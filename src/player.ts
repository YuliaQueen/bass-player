/**
 * Контролы плеера: Play/Pause/Stop, скорость, громкости, метроном, count-in,
 * loop, индикатор такта, прогресс-бар, hotkeys, сохранение настроек на трек.
 *
 * Чистая логика (поиск такта, settings I/O, формат) — в playerLogic.ts, оттуда же тесты.
 */

import * as alphaTab from '@coderline/alphatab';

import {
    SPEED_STEP,
    loadSettings,
    saveSettings,
    fmtSpeed,
    fmtPercent,
    clamp,
    isValidBar as isValidBarFn,
    findBarIndexByTick,
    barEndTick as barEndTickFn,
    stepSpeed as stepSpeedFn,
    type LoopMode,
    type MasterBarLike,
} from './playerLogic.ts';
import { toast, toastError } from './toast.ts';

export interface PlayerControls {
    playBtn: HTMLButtonElement;
    stopBtn: HTMLButtonElement;
    speedSlider: HTMLInputElement;
    speedValue: HTMLElement;
    volumeSlider: HTMLInputElement;
    volumeValue: HTMLElement;
    metronomeSlider: HTMLInputElement;
    metronomeValue: HTMLElement;
    countInCheckbox: HTMLInputElement;
    loopCheckbox: HTMLInputElement;
    loopFromInput: HTMLInputElement;
    loopToInput: HTMLInputElement;
    loopSectionApplyBtn: HTMLButtonElement;
    loopSectionResetBtn: HTMLButtonElement;
    barPosition: HTMLElement;
    progress: HTMLElement;
    progressFill: HTMLElement;
}

export interface InitPlayerOptions {
    api: alphaTab.AlphaTabApi;
    getCurrentFile: () => string | null;
    controls: PlayerControls;
}

interface PlaybackRange {
    startTick: number;
    endTick: number;
}

export const initPlayer = ({ api, getCurrentFile, controls }: InitPlayerOptions): void => {
    const {
        playBtn,
        stopBtn,
        speedSlider,
        speedValue,
        volumeSlider,
        volumeValue,
        metronomeSlider,
        metronomeValue,
        countInCheckbox,
        loopCheckbox,
        loopFromInput,
        loopToInput,
        loopSectionApplyBtn,
        loopSectionResetBtn,
        barPosition,
        progress,
        progressFill,
    } = controls;

    let masterBars: MasterBarLike[] = [];
    let endTick = 1;

    // ---------- loop section ----------

    const isValidBar = (n: unknown): n is number => isValidBarFn(n, masterBars.length);

    /**
     * Включает один из режимов loop. range нужен только для 'section'.
     * jumpToStart=true — прыгнуть на startTick секции (нужно при пользовательском
     * включении, не нужно при восстановлении сохранённой позиции).
     */
    const setLoopMode = (mode: LoopMode, range: PlaybackRange | null = null, jumpToStart = false): void => {
        switch (mode) {
            case 'off':
                api.isLooping = false;
                api.playbackRange = null;
                break;
            case 'track':
                api.isLooping = true;
                api.playbackRange = null;
                break;
            case 'section':
                if (!range) return;
                api.isLooping = true;
                api.playbackRange = range;
                // Если текущая позиция вне диапазона — прыгаем в начало секции,
                // иначе плеер играет «в пустоту» и звука нет.
                if (jumpToStart || api.tickPosition < range.startTick || api.tickPosition >= range.endTick) {
                    api.tickPosition = range.startTick;
                }
                break;
        }
        loopCheckbox.checked = mode === 'track';
        loopSectionApplyBtn.classList.toggle('active', mode === 'section');
    };

    const barEndTick = (idx: number): number => barEndTickFn(idx, masterBars);

    const applyLoopSection = (): void => {
        if (masterBars.length === 0) return;
        const from = parseInt(loopFromInput.value, 10);
        const to = parseInt(loopToInput.value, 10);
        if (!isValidBar(from) || !isValidBar(to) || from > to) {
            toastError('Неверный диапазон', `Введи такты от 1 до ${masterBars.length}, от ≤ до`);
            return;
        }
        const fromBar = masterBars[from - 1];
        if (!fromBar) return;
        const range: PlaybackRange = {
            startTick: fromBar.start,
            endTick: barEndTick(to - 1),
        };
        setLoopMode('section', range, /* jumpToStart */ true);
        saveSettings(getCurrentFile() ?? '', { loopMode: 'section', loopFrom: from, loopTo: to });
        toast({ title: 'Loop секции', body: `такты ${from}-${to}`, kind: 'success' });
    };

    const resetLoopSection = (): void => {
        loopFromInput.value = '';
        loopToInput.value = '';
        setLoopMode('off');
        saveSettings(getCurrentFile() ?? '', { loopMode: 'off', loopFrom: null, loopTo: null });
    };

    loopSectionApplyBtn.addEventListener('click', applyLoopSection);
    loopSectionResetBtn.addEventListener('click', resetLoopSection);

    // ---------- drag по тактам → выделение секции ----------

    let dragStartBar: number | null = null;
    let isDragging = false;

    api.beatMouseDown.on((beat) => {
        if (masterBars.length === 0) return;
        dragStartBar = beat.voice.bar.index + 1;
        isDragging = false;
    });

    api.beatMouseMove.on((beat) => {
        if (dragStartBar === null) return;
        const currentBar = beat.voice.bar.index + 1;
        if (currentBar !== dragStartBar) {
            isDragging = true;
        }
    });

    api.beatMouseUp.on((beat) => {
        if (dragStartBar !== null && isDragging && beat) {
            const endBar = beat.voice.bar.index + 1;
            const from = Math.min(dragStartBar, endBar);
            const to = Math.max(dragStartBar, endBar);
            loopFromInput.value = String(from);
            loopToInput.value = String(to);
            applyLoopSection();
        }
        dragStartBar = null;
        isDragging = false;
    });

    // ---------- применение настроек при загрузке трека ----------

    const applySettings = (): void => {
        const name = getCurrentFile() ?? '';
        const s = loadSettings(name);

        const speed = s.speed ?? 1.0;
        const volume = s.volume ?? 0.8;
        const metronome = s.metronome ?? 0;
        const countIn = s.countIn ?? false;

        api.playbackSpeed = speed;
        api.masterVolume = volume;
        api.metronomeVolume = metronome;
        api.countInVolume = countIn ? 1 : 0;

        speedSlider.value = String(speed);
        speedValue.textContent = fmtSpeed(speed);
        volumeSlider.value = String(volume * 100);
        volumeValue.textContent = fmtPercent(volume * 100);
        metronomeSlider.value = String(metronome * 100);
        metronomeValue.textContent = fmtPercent(metronome * 100);
        countInCheckbox.checked = countIn;

        // Восстанавливаем loop-режим после того, как стал известен masterBars
        loopFromInput.max = String(masterBars.length);
        loopToInput.max = String(masterBars.length);
        dragStartBar = null;
        isDragging = false;

        const savedMode: LoopMode = s.loopMode ?? 'off';
        if (
            savedMode === 'section' &&
            isValidBar(s.loopFrom) &&
            isValidBar(s.loopTo) &&
            s.loopFrom <= s.loopTo
        ) {
            const fromBar = masterBars[s.loopFrom - 1];
            if (!fromBar) {
                setLoopMode('off');
                return;
            }
            loopFromInput.value = String(s.loopFrom);
            loopToInput.value = String(s.loopTo);
            setLoopMode('section', {
                startTick: fromBar.start,
                endTick: barEndTick(s.loopTo - 1),
            });
        } else {
            loopFromInput.value = '';
            loopToInput.value = '';
            setLoopMode(savedMode === 'track' ? 'track' : 'off');
        }
    };

    api.scoreLoaded.on((score) => {
        masterBars = score.masterBars as unknown as MasterBarLike[];
        applySettings();
        barPosition.textContent = `1 / ${masterBars.length}`;
        progressFill.style.width = '0%';
    });

    // tickPosition восстанавливаем после готовности плеера (soundfont загружен и т.д.).
    api.playerReady.on(() => {
        const s = loadSettings(getCurrentFile() ?? '');
        if (typeof s.tickPosition === 'number' && s.tickPosition > 0) {
            api.tickPosition = s.tickPosition;
        }
    });

    // ---------- индикатор такта + прогресс ----------

    api.playerPositionChanged.on((args) => {
        endTick = args.endTick || 1;
        const pct = (args.currentTick / endTick) * 100;
        progressFill.style.width = `${pct}%`;
        if (masterBars.length > 0) {
            const idx = findBarIndexByTick(args.currentTick, masterBars);
            barPosition.textContent = `${idx + 1} / ${masterBars.length}`;
        }
    });

    progress.addEventListener('click', (ev) => {
        const rect = progress.getBoundingClientRect();
        const pct = clamp((ev.clientX - rect.left) / rect.width, 0, 1);
        api.tickPosition = pct * endTick;
    });

    // ---------- кнопки Play/Stop ----------

    /**
     * Workaround alphaTab issue #297: если метроном включён ДО Play, плеер
     * ускоряется и хрипит. Если включить во время play — всё нормально.
     * Перед стартом обнуляем метроном, потом восстанавливаем через short delay
     * — внутренне alphaTab воспринимает это как «включили во время play».
     */
    const playPauseWithMetronomeFix = (): void => {
        const isPaused = api.playerState === 0; // PlayerState.Paused
        const savedMetronome = api.metronomeVolume;
        if (isPaused && savedMetronome > 0) {
            api.metronomeVolume = 0;
            api.playPause();
            setTimeout(() => {
                api.metronomeVolume = savedMetronome;
            }, 150);
        } else {
            api.playPause();
        }
    };

    playBtn.addEventListener('click', playPauseWithMetronomeFix);
    stopBtn.addEventListener('click', () => api.stop());

    // PlayerState: Paused = 0, Playing = 1
    api.playerStateChanged.on(({ state }) => {
        playBtn.textContent = state === 1 ? '⏸ Pause' : '▶ Play';
        // На паузе — сохраняем позицию, чтобы при перезагрузке возобновиться отсюда
        if (state === 0) {
            saveSettings(getCurrentFile() ?? '', { tickPosition: api.tickPosition });
        }
    });

    window.addEventListener('beforeunload', () => {
        saveSettings(getCurrentFile() ?? '', { tickPosition: api.tickPosition });
    });

    // ---------- слайдеры ----------

    speedSlider.addEventListener('input', () => {
        const v = parseFloat(speedSlider.value);
        api.playbackSpeed = v;
        speedValue.textContent = fmtSpeed(v);
    });
    speedSlider.addEventListener('change', () => {
        saveSettings(getCurrentFile() ?? '', { speed: parseFloat(speedSlider.value) });
    });

    volumeSlider.addEventListener('input', () => {
        const v = parseInt(volumeSlider.value, 10);
        api.masterVolume = v / 100;
        volumeValue.textContent = fmtPercent(v);
    });
    volumeSlider.addEventListener('change', () => {
        saveSettings(getCurrentFile() ?? '', { volume: parseInt(volumeSlider.value, 10) / 100 });
    });

    metronomeSlider.addEventListener('input', () => {
        const v = parseInt(metronomeSlider.value, 10);
        api.metronomeVolume = v / 100;
        metronomeValue.textContent = fmtPercent(v);
    });
    metronomeSlider.addEventListener('change', () => {
        saveSettings(getCurrentFile() ?? '', { metronome: parseInt(metronomeSlider.value, 10) / 100 });
    });

    countInCheckbox.addEventListener('change', () => {
        api.countInVolume = countInCheckbox.checked ? 1 : 0;
        saveSettings(getCurrentFile() ?? '', { countIn: countInCheckbox.checked });
    });

    loopCheckbox.addEventListener('change', () => {
        const mode: LoopMode = loopCheckbox.checked ? 'track' : 'off';
        setLoopMode(mode);
        saveSettings(getCurrentFile() ?? '', { loopMode: mode, loopFrom: null, loopTo: null });
        if (mode === 'track') {
            // Включили loop трека — сбрасываем поля секции
            loopFromInput.value = '';
            loopToInput.value = '';
        }
    });

    // ---------- hotkeys ----------

    const isTypingTarget = (target: EventTarget | null): boolean => {
        if (!target || !(target instanceof HTMLElement)) return false;
        const tag = target.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    };

    const goToBar = (idx: number): void => {
        if (masterBars.length === 0) return;
        const clamped = clamp(idx, 0, masterBars.length - 1);
        const bar = masterBars[clamped];
        if (bar) api.tickPosition = bar.start;
    };

    const stepSpeed = (delta: number): void => {
        const rounded = stepSpeedFn(api.playbackSpeed, delta);
        api.playbackSpeed = rounded;
        speedSlider.value = String(rounded);
        speedValue.textContent = fmtSpeed(rounded);
        saveSettings(getCurrentFile() ?? '', { speed: rounded });
    };

    document.addEventListener('keydown', (ev) => {
        if (isTypingTarget(ev.target)) return;
        if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

        switch (ev.code) {
            case 'Space':
                ev.preventDefault();
                playPauseWithMetronomeFix();
                break;
            case 'ArrowLeft': {
                ev.preventDefault();
                const cur = findBarIndexByTick(api.tickPosition, masterBars);
                goToBar(cur - 1);
                break;
            }
            case 'ArrowRight': {
                ev.preventDefault();
                const cur = findBarIndexByTick(api.tickPosition, masterBars);
                goToBar(cur + 1);
                break;
            }
            case 'ArrowUp':
                ev.preventDefault();
                stepSpeed(SPEED_STEP);
                break;
            case 'ArrowDown':
                ev.preventDefault();
                stepSpeed(-SPEED_STEP);
                break;
            case 'Home':
                ev.preventDefault();
                api.tickPosition = 0;
                break;
        }
    });
};
