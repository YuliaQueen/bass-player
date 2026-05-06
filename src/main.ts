import * as alphaTab from '@coderline/alphatab';
import { initLibrary, type LibraryHandle } from './library.ts';
import { initPlayer } from './player.ts';
import { toastError } from './toast.ts';

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

const api = new alphaTab.AlphaTabApi($('#alphatab'), {
    core: {
        fontDirectory: '/alphatab/font/',
        // Отключаем ленивый рендер чанков — он бажный при горизонтальном layout
        // и resize'ах: at-surface обрезает контент по своей ширине, а внутренние
        // чанки уезжают за пределы → ноты пропадают по мере прокрутки.
        enableLazyLoading: false,
    },
    player: {
        enablePlayer: true,
        enableCursor: true,
        enableUserInteraction: true,
        soundFont: '/alphatab/soundfont/sonivox.sf3',
        scrollMode: alphaTab.ScrollMode.Continuous,
        scrollElement: '.score-stage',
        // Курсор фиксируется ~на 30% ширины viewport от левого края.
        scrollOffsetX: -window.innerWidth * 0.3,
    },
    display: {
        layoutMode: alphaTab.LayoutMode.Horizontal,
        scale: 1.6,
        staveProfile: alphaTab.StaveProfile.ScoreTab,
    },
});

// Подменяем шрифты текстовых элементов на системные с кириллицей.
// markerFont/wordsFont/titleFont в JSON-конфиге устарели с 1.7.0 — нужно через elementFonts.
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
    const bassTrack =
        score.tracks.find((track) => {
            const program = track.playbackInfo.program;
            return program >= 32 && program <= 39;
        }) || score.tracks[0];

    if (!bassTrack) return;

    currentTitle = `${score.title || ''} - дорожка: ${bassTrack.name}`.trim();

    // Сдвигаем rehearsal-метки вправо, чтобы не наезжали на букву аккорда.
    const SECTION_PREFIX = '       ';
    score.masterBars.forEach((bar) => {
        if (bar.section && !bar.section.text.startsWith(SECTION_PREFIX)) {
            bar.section.text = SECTION_PREFIX + bar.section.text;
        }
    });

    api.renderTracks([bassTrack]);
    setStatus(currentTitle);
});

api.renderStarted.on(() => setStatus('рендер…'));
api.renderFinished.on(() => {
    setStatus(currentTitle);
    fixSurfaceWidth();
});

/**
 * Workaround для бага alphaTab при LayoutMode.Horizontal: .at-surface получает
 * width меньше, чем фактическая ширина контента (сумма positioned-чанков),
 * и за счёт overflow:hidden конец трека обрезается невидимо.
 * Перевычисляем максимальный right-edge по чанкам и натягиваем surface на него.
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

// ===== UI: тогглы сайдбара, табулатуры, layout-mode =====

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

// Восстанавливаем UI-состояние ДО загрузки трека, чтобы первый рендер был сразу с нужным профилем.
setSidebarVisible(localStorage.getItem(SIDEBAR_KEY) !== 'false');
setShowTabs(localStorage.getItem(SHOW_TABS_KEY) !== 'false', /* rerender */ false);
setLayoutMode((localStorage.getItem(LAYOUT_MODE_KEY) as LayoutMode) || 'horizontal', /* rerender */ false);

// ===== Открываем последний просмотренный, иначе — первый из списка =====

const tabs = lib.getTabs();
const lastTab = localStorage.getItem(LAST_TAB_KEY);
const initial = tabs.find((t) => t.name === lastTab) || tabs[0];
if (initial) {
    loadTab(initial.name);
} else {
    setStatus('Библиотека пуста — перетащи .gp файл сюда.');
}
