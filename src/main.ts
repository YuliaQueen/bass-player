import * as alphaTab from '@coderline/alphatab';
import { setUnauthorizedHandler } from './api.ts';
import { initLibrary, type LibraryHandle } from './library.ts';
import { initPlayer } from './player.ts';
import { initMixer } from './mixer.ts';
import { toast, toastError } from './toast.ts';
import { login, logout, me, register, type User } from './auth.ts';

const LAST_TAB_KEY = 'lastTabName';

/** Helper: querySelector с обязательным результатом и типом. */
const $ = <T extends HTMLElement>(selector: string): T => {
    const el = document.querySelector<T>(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    return el;
};

const statusEl = $('#status');
const setStatus = (text: string): void => {
    statusEl.textContent = text;
};

// ============================================================================
// alphaTab — инициализация (нужна вне зависимости от auth, но рендер пустой
// пока пользователь не залогинен и не выбрал файл)
// ============================================================================

const api = new alphaTab.AlphaTabApi($('#alphatab'), {
    core: {
        fontDirectory: '/alphatab/font/',
        // Отключаем ленивый рендер чанков — баг при горизонтальном layout.
        enableLazyLoading: false,
    },
    player: {
        enablePlayer: true,
        enableCursor: true,
        enableUserInteraction: true,
        soundFont: '/alphatab/soundfont/sonivox.sf3',
        scrollMode: alphaTab.ScrollMode.Continuous,
        scrollElement: '.score-stage',
        scrollOffsetX: -window.innerWidth * 0.3,
    },
    display: {
        layoutMode: alphaTab.LayoutMode.Horizontal,
        scale: 1.6,
        staveProfile: alphaTab.StaveProfile.ScoreTab,
    },
});

// Подменяем шрифты текстовых элементов на системные с кириллицей.
const cyrillicFont = (
    size: number,
    weight: alphaTab.model.FontWeight = alphaTab.model.FontWeight.Regular,
): alphaTab.model.Font =>
    new alphaTab.model.Font('Arial, Helvetica, sans-serif', size, alphaTab.model.FontStyle.Plain, weight);

const fonts = api.settings.display.resources.elementFonts;
fonts.set(alphaTab.NotationElement.EffectMarker, cyrillicFont(14, alphaTab.model.FontWeight.Bold));
fonts.set(alphaTab.NotationElement.ScoreWords, cyrillicFont(14));
fonts.set(alphaTab.NotationElement.ScoreTitle, cyrillicFont(32));
fonts.set(alphaTab.NotationElement.ScoreSubTitle, cyrillicFont(20));
api.updateSettings();

let currentTitle = '';
let currentFile: string | null = null;

api.scoreLoaded.on((score) => {
    // MusicXML файлы часто без MIDI-инструкций — alphaTab оставляет volume=0
    // и program=0 для каждой дорожки. Подставляем разумные дефолты.
    let fixedSomething = false;
    score.tracks.forEach((track) => {
        const info = track.playbackInfo;
        if (!info.volume || info.volume === 0) {
            info.volume = 13;
        }
        if (info.program === 0 && /bass/i.test(track.name)) {
            info.program = 33; // Electric Bass (picked) в General MIDI
        }
        if (info.isMute) info.isMute = false;

        // Workaround для MusicXML без <staff-details><staff-tuning>:
        // если в файле есть <technical><string>/<fret>, alphaTab помечает
        // ноты как stringed и считает MIDI = fret + stringTuning. Без
        // tuning это даёт MIDI 1-3 — soundfont там пуст, тишина.
        // Ставим стандартный tuning по количеству используемых струн.
        // MusicXML reader у alphaTab непоследователен: для одного трека часть нот
        // помечается как stringed (string/fret из <technical>), часть как piano
        // (octave/tone из <pitch>). Без правильного staff-tuning stringed-ноты
        // не воспроизводятся (MIDI=fret+0=инфразвук). Принудительно форсим
        // piano-режим у всех нот, у которых есть валидный pitch.
        track.staves.forEach((staff) => {
            if (staff.stringTuning.tunings.length > 0) return; // honest tab — не трогаем

            staff.bars.forEach((bar) => {
                bar.voices.forEach((voice) => {
                    voice.beats.forEach((beat) => {
                        beat.notes.forEach((note) => {
                            if (note.string >= 0 && note.octave >= 0 && note.tone >= 0) {
                                note.string = -1;
                                note.fret = -1;
                                fixedSomething = true;
                            }
                        });
                    });
                });
            });
        });
    });

    const bassTrack =
        score.tracks.find((track) => {
            const program = track.playbackInfo.program;
            return program >= 32 && program <= 39;
        }) ||
        // Fallback для MusicXML: ищем по имени трека
        score.tracks.find((track) => /bass/i.test(track.name)) ||
        score.tracks[0];

    if (!bassTrack) return;

    currentTitle = `${score.title || ''} - дорожка: ${bassTrack.name}`.trim();

    const SECTION_PREFIX = '       ';
    score.masterBars.forEach((bar) => {
        if (bar.section && !bar.section.text.startsWith(SECTION_PREFIX)) {
            bar.section.text = SECTION_PREFIX + bar.section.text;
        }
    });

    api.renderTracks([bassTrack]);
    setStatus(currentTitle);
    // Громкости отдельных дорожек регулируются через микшер (mixer.ts) —
    // он подписан на тот же scoreLoaded и подтягивает saved per-file state.

    // Пересоздаём MIDI ТОЛЬКО если правили ноты (в основном это MusicXML).
    // Для .gp файлов не дёргаем — это вызывает побочный баг alphaTab
    // с метрономом (он начинает хрипеть и ускорять трек).
    if (fixedSomething) {
        api.loadMidiForScore();
    }
});

api.renderStarted.on(() => setStatus('рендер…'));
api.renderFinished.on(() => {
    setStatus(currentTitle);
    fixSurfaceWidth();
});

/**
 * Workaround для бага alphaTab при LayoutMode.Horizontal: .at-surface получает
 * width меньше фактической ширины контента. Натягиваем его на максимальный
 * right-edge всех positioned-чанков.
 */
const fixSurfaceWidth = (): void => {
    const root = document.querySelector('#alphatab');
    if (!root) return;

    const surface = root.querySelector<HTMLElement>('.at-surface');
    const cursors = root.querySelector<HTMLElement>('.at-cursors');
    if (!surface) return;

    let maxRight = 0;
    surface.querySelectorAll<HTMLElement>(':scope > div').forEach((chunk) => {
        const left = parseFloat(chunk.style.left) || 0;
        const width = parseFloat(chunk.style.width) || 0;
        if (left + width > maxRight) maxRight = left + width;
    });

    const currentWidth = parseFloat(surface.style.width) || 0;
    if (maxRight > currentWidth) {
        surface.style.width = `${maxRight}px`;
        surface.style.overflow = 'visible';
        if (cursors) cursors.style.width = `${maxRight}px`;
    }
};

api.error.on((error: unknown) => {
    console.error('[alphatab] error', error);
    const msg = error instanceof Error ? error.message : String(error);
    setStatus(`ошибка: ${msg}`);
    toastError('Ошибка alphaTab', msg);
});

// ============================================================================
// UI: тогглы сайдбара, табулатуры, layout-mode (всё ещё работают без auth)
// ============================================================================

const SIDEBAR_KEY = 'ui.sidebar';
const SHOW_TABS_KEY = 'ui.showTabs';
const LAYOUT_MODE_KEY = 'ui.layoutMode';

type LayoutMode = 'horizontal' | 'page';

const layoutEl = $('#layout');
const sidebarToggle = $<HTMLButtonElement>('#toggle-sidebar');
const showTabsCheck = $<HTMLInputElement>('#show-tabs');
const layoutSelect = $<HTMLSelectElement>('#layout-mode');

const setSidebarVisible = (visible: boolean): void => {
    layoutEl.classList.toggle('no-sidebar', !visible);
    sidebarToggle.classList.toggle('active', visible);
    localStorage.setItem(SIDEBAR_KEY, String(visible));
};

const setShowTabs = (show: boolean, rerender = true): void => {
    showTabsCheck.checked = show;
    api.settings.display.staveProfile = show ? alphaTab.StaveProfile.ScoreTab : alphaTab.StaveProfile.Score;
    api.updateSettings();
    if (rerender) api.render();
    localStorage.setItem(SHOW_TABS_KEY, String(show));
};

const setLayoutMode = (mode: LayoutMode, rerender = true): void => {
    layoutSelect.value = mode;
    api.settings.display.layoutMode =
        mode === 'page' ? alphaTab.LayoutMode.Page : alphaTab.LayoutMode.Horizontal;
    api.updateSettings();
    if (rerender) api.render();
    localStorage.setItem(LAYOUT_MODE_KEY, mode);
};

sidebarToggle.addEventListener('click', () => {
    const visible = layoutEl.classList.contains('no-sidebar');
    setSidebarVisible(visible);
});
showTabsCheck.addEventListener('change', () => setShowTabs(showTabsCheck.checked));
layoutSelect.addEventListener('change', () => setLayoutMode(layoutSelect.value as LayoutMode));

setSidebarVisible(localStorage.getItem(SIDEBAR_KEY) !== 'false');
setShowTabs(localStorage.getItem(SHOW_TABS_KEY) !== 'false', /* rerender */ false);
setLayoutMode((localStorage.getItem(LAYOUT_MODE_KEY) as LayoutMode) || 'horizontal', /* rerender */ false);

// ============================================================================
// Player + Library — инициализируются один раз при старте, но реально оживают
// после авторизации (когда listTabs() возвращает данные)
// ============================================================================

let lib: LibraryHandle | null = null;

const loadTab = (name: string): void => {
    currentFile = name;
    api.load(`/tabs/${encodeURIComponent(name)}`);
    localStorage.setItem(LAST_TAB_KEY, name);
    lib?.setActive(name);
};

lib = await initLibrary({
    listEl: $('#tabs-list'),
    uploadBtn: $('#upload'),
    fileInput: $<HTMLInputElement>('#file-input'),
    dropOverlay: $('#drop-overlay'),
    onSelect: loadTab,
});

initMixer({
    api,
    listEl: $('#mixer-tracks'),
    button: $<HTMLButtonElement>('#mixer-button'),
    dropdown: $('#mixer-dropdown'),
    resetBtn: $<HTMLButtonElement>('#mixer-reset'),
    getCurrentFile: () => currentFile,
});

initPlayer({
    api,
    getCurrentFile: () => currentFile,
    controls: {
        playBtn: $<HTMLButtonElement>('#play'),
        stopBtn: $<HTMLButtonElement>('#stop'),
        speedSlider: $<HTMLInputElement>('#speed'),
        speedValue: $('#speed-value'),
        volumeSlider: $<HTMLInputElement>('#volume'),
        volumeValue: $('#volume-value'),
        metronomeSlider: $<HTMLInputElement>('#metronome'),
        metronomeValue: $('#metronome-value'),
        countInCheckbox: $<HTMLInputElement>('#countin'),
        loopCheckbox: $<HTMLInputElement>('#loop-track'),
        loopFromInput: $<HTMLInputElement>('#loop-from'),
        loopToInput: $<HTMLInputElement>('#loop-to'),
        loopSectionApplyBtn: $<HTMLButtonElement>('#loop-section-apply'),
        loopSectionResetBtn: $<HTMLButtonElement>('#loop-section-reset'),
        barPosition: $('#bar-position'),
        progress: $('#progress'),
        progressFill: $('#progress-fill'),
    },
});

// ============================================================================
// Auth: overlay, login/register формы, user-меню в топбаре
// ============================================================================

const authOverlay = $('#auth-overlay');
const authCard = $('#auth-overlay .auth-card');
const authForm = $<HTMLFormElement>('#auth-form');
const authTitle = $('#auth-title');
const authSubtitle = $('#auth-subtitle');
const authSubmit = $<HTMLButtonElement>('#auth-submit');
const authToggle = $<HTMLAnchorElement>('#auth-toggle');
const authToggleText = $('#auth-toggle-text');
const nameField = $('.auth-field[data-field="name"]');
const passwordConfirmField = $('.auth-field[data-field="password_confirmation"]');

const userButton = $<HTMLButtonElement>('#user-button');
const userDropdown = $('#user-dropdown');
const userNameEl = $('#user-name');
const userEmailEl = $('#user-email');
const logoutBtn = $<HTMLButtonElement>('#logout-btn');

type AuthMode = 'login' | 'register';
let authMode: AuthMode = 'login';

const setAuthMode = (mode: AuthMode): void => {
    authMode = mode;
    authCard.dataset.mode = mode;
    if (mode === 'login') {
        authTitle.textContent = 'Вход';
        authSubtitle.textContent = 'Войди в аккаунт, чтобы открыть библиотеку';
        authSubmit.textContent = 'Войти';
        authToggleText.textContent = 'Нет аккаунта?';
        authToggle.textContent = 'Зарегистрироваться';
        nameField.hidden = true;
        passwordConfirmField.hidden = true;
    } else {
        authTitle.textContent = 'Регистрация';
        authSubtitle.textContent = 'Создай аккаунт за минуту';
        authSubmit.textContent = 'Создать аккаунт';
        authToggleText.textContent = 'Уже есть аккаунт?';
        authToggle.textContent = 'Войти';
        nameField.hidden = false;
        passwordConfirmField.hidden = false;
    }
};

authToggle.addEventListener('click', (ev) => {
    ev.preventDefault();
    setAuthMode(authMode === 'login' ? 'register' : 'login');
});

const showAuthOverlay = (): void => {
    authOverlay.hidden = false;
    setAuthMode('login');
};

const hideAuthOverlay = (): void => {
    authOverlay.hidden = true;
};

const initials = (user: User): string => {
    const parts = user.name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const second = parts[1]?.[0] ?? '';
    return (first + second).toUpperCase() || user.email[0]?.toUpperCase() || '?';
};

const setUserUi = (user: User): void => {
    userButton.textContent = initials(user);
    userButton.title = user.email;
    userNameEl.textContent = user.name;
    userEmailEl.textContent = user.email;
};

userButton.addEventListener('click', (ev) => {
    ev.stopPropagation();
    userDropdown.hidden = !userDropdown.hidden;
});

document.addEventListener('click', () => {
    if (!userDropdown.hidden) userDropdown.hidden = true;
});

logoutBtn.addEventListener('click', async () => {
    try {
        await logout();
        toast({ title: 'Вы вышли', body: 'До скорого!' });
        currentFile = null;
        showAuthOverlay();
    } catch (err) {
        toastError('Ошибка выхода', (err as Error).message);
    }
});

authForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const formData = new FormData(authForm);
    const email = String(formData.get('email') || '');
    const password = String(formData.get('password') || '');

    authSubmit.disabled = true;
    try {
        let user: User;
        if (authMode === 'login') {
            user = await login({ email, password });
        } else {
            const name = String(formData.get('name') || '');
            const passwordConfirmation = String(formData.get('password_confirmation') || '');
            user = await register({
                name,
                email,
                password,
                password_confirmation: passwordConfirmation,
            });
        }
        setUserUi(user);
        hideAuthOverlay();
        toast({ title: `Привет, ${user.name}!`, kind: 'success' });
        await openLibrary();
    } catch (err) {
        toastError('Не получилось', (err as Error).message);
    } finally {
        authSubmit.disabled = false;
    }
});

/** При 401 на любом API-запросе — выкидываем в форму логина. */
setUnauthorizedHandler(() => {
    showAuthOverlay();
});

/**
 * После успешной авторизации — рефрешим список файлов и открываем последний.
 */
const openLibrary = async (): Promise<void> => {
    if (!lib) return;
    await lib.refresh();
    const tabs = lib.getTabs();
    const lastTab = localStorage.getItem(LAST_TAB_KEY);
    const initial = tabs.find((t) => t.name === lastTab) || tabs[0];
    if (initial) {
        loadTab(initial.name);
    } else {
        setStatus('Библиотека пуста — перетащи .gp файл сюда.');
    }
};

// ============================================================================
// Bootstrap: проверка сессии при старте → либо открываем библиотеку, либо login
// ============================================================================

try {
    const user = await me();
    if (user) {
        setUserUi(user);
        await openLibrary();
    } else {
        showAuthOverlay();
    }
} catch (err) {
    console.error('[auth] me() failed', err);
    showAuthOverlay();
}
