import * as alphaTab from '@coderline/alphatab';
import { initLibrary } from './library.js';
import { initPlayer } from './player.js';

const LAST_TAB_KEY = 'lastTabName';

const statusEl = document.querySelector('#status');
const setStatus = (text) => {
    statusEl.textContent = text;
};

const api = new alphaTab.AlphaTabApi(document.querySelector('#alphatab'), {
    core: {
        fontDirectory: '/alphatab/font/',
    },
    player: {
        enablePlayer: true,
        enableCursor: true,
        enableUserInteraction: true,
        soundFont: '/alphatab/soundfont/sonivox.sf3',
        scrollMode: alphaTab.ScrollMode.Continuous,
        scrollElement: '.score-area',
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
const cyrillicFont = (size, weight = alphaTab.model.FontWeight.Regular) =>
    new alphaTab.model.Font('Arial, Helvetica, sans-serif', size, alphaTab.model.FontStyle.Plain, weight);

const fonts = api.settings.display.resources.elementFonts;
fonts.set(alphaTab.NotationElement.EffectMarker, cyrillicFont(14, alphaTab.model.FontWeight.Bold));
fonts.set(alphaTab.NotationElement.ScoreWords, cyrillicFont(14));
fonts.set(alphaTab.NotationElement.ScoreTitle, cyrillicFont(32));
fonts.set(alphaTab.NotationElement.ScoreSubTitle, cyrillicFont(20));
api.updateSettings();

let currentTitle = '';
let currentFile = null;

api.scoreLoaded.on((score) => {
    const bassTrack =
        score.tracks.find((track) => {
            const program = track.playbackInfo.program;
            return program >= 32 && program <= 39;
        }) || score.tracks[0];

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
api.renderFinished.on(() => setStatus(currentTitle));
api.error.on((error) => {
    console.error('[alphatab] error', error);
    setStatus(`ошибка: ${error?.message || error}`);
});

let lib = null;

const loadTab = (name) => {
    currentFile = name;
    api.load(`/tabs/${encodeURIComponent(name)}`);
    localStorage.setItem(LAST_TAB_KEY, name);
    lib?.setActive(name);
};

lib = await initLibrary({
    listEl: document.querySelector('#tabs-list'),
    uploadBtn: document.querySelector('#upload'),
    fileInput: document.querySelector('#file-input'),
    dropOverlay: document.querySelector('#drop-overlay'),
    onSelect: loadTab,
});

initPlayer({
    api,
    getCurrentFile: () => currentFile,
    controls: {
        playBtn: document.querySelector('#play'),
        stopBtn: document.querySelector('#stop'),
        speedSlider: document.querySelector('#speed'),
        speedValue: document.querySelector('#speed-value'),
        volumeSlider: document.querySelector('#volume'),
        volumeValue: document.querySelector('#volume-value'),
        metronomeSlider: document.querySelector('#metronome'),
        metronomeValue: document.querySelector('#metronome-value'),
        countInCheckbox: document.querySelector('#countin'),
        loopCheckbox: document.querySelector('#loop-track'),
        loopFromInput: document.querySelector('#loop-from'),
        loopToInput: document.querySelector('#loop-to'),
        loopSectionApplyBtn: document.querySelector('#loop-section-apply'),
        loopSectionResetBtn: document.querySelector('#loop-section-reset'),
        barPosition: document.querySelector('#bar-position'),
        progress: document.querySelector('#progress'),
        progressFill: document.querySelector('#progress-fill'),
    },
});

// ===== UI: тогглы сайдбара и табулатуры =====

const SIDEBAR_KEY = 'ui.sidebar'; // 'true' / 'false'
const SHOW_TABS_KEY = 'ui.showTabs'; // 'true' / 'false'

const layoutEl = document.querySelector('#layout');
const sidebarToggle = document.querySelector('#toggle-sidebar');
const showTabsCheck = document.querySelector('#show-tabs');

const setSidebarVisible = (visible) => {
    layoutEl.classList.toggle('no-sidebar', !visible);
    sidebarToggle.classList.toggle('active', visible);
    localStorage.setItem(SIDEBAR_KEY, String(visible));
};

const setShowTabs = (show, rerender = true) => {
    showTabsCheck.checked = show;
    api.settings.display.staveProfile = show ? alphaTab.StaveProfile.ScoreTab : alphaTab.StaveProfile.Score;
    api.updateSettings();
    if (rerender) api.render();
    localStorage.setItem(SHOW_TABS_KEY, String(show));
};

sidebarToggle.addEventListener('click', () => {
    const visible = layoutEl.classList.contains('no-sidebar');
    setSidebarVisible(visible);
});

showTabsCheck.addEventListener('change', () => setShowTabs(showTabsCheck.checked));

// Восстанавливаем UI-состояние ДО загрузки трека, чтобы первый рендер был сразу с нужным профилем.
setSidebarVisible(localStorage.getItem(SIDEBAR_KEY) !== 'false');
setShowTabs(localStorage.getItem(SHOW_TABS_KEY) !== 'false', /* rerender */ false);

// ===== Открываем последний просмотренный, иначе — первый из списка =====

const tabs = lib.getTabs();
const lastTab = localStorage.getItem(LAST_TAB_KEY);
const initial = tabs.find((t) => t.name === lastTab) || tabs[0];
if (initial) {
    loadTab(initial.name);
} else {
    setStatus('Библиотека пуста — перетащи .gp файл сюда.');
}
