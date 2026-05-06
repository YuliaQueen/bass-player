/**
 * Контролы плеера: Play/Pause/Stop, скорость, громкости, метроном, count-in,
 * loop, индикатор такта, прогресс-бар, hotkeys, сохранение настроек на трек.
 *
 * Чистая логика (поиск такта, settings I/O, формат) — в playerLogic.js, оттуда же тесты.
 */

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
} from './playerLogic.js';

/**
 * @param {Object} opts
 * @param {alphaTab.AlphaTabApi} opts.api
 * @param {() => string|null}    opts.getCurrentFile
 * @param {Object} opts.controls — DOM-узлы контролов
 */
export const initPlayer = ({ api, getCurrentFile, controls }) => {
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

    let masterBars = [];
    let endTick = 1;

    // ---------- loop section ----------

    const isValidBar = (n) => isValidBarFn(n, masterBars.length);

    /**
     * Включает один из режимов loop. range нужен только для 'section'.
     * jumpToStart=true — прыгнуть на startTick секции (нужно при пользовательском
     * включении, не нужно при восстановлении сохранённой позиции).
     */
    const setLoopMode = (mode, range = null, jumpToStart = false) => {
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

    const barEndTick = (idx) => barEndTickFn(idx, masterBars);

    const applyLoopSection = () => {
        if (masterBars.length === 0) return;
        const from = parseInt(loopFromInput.value, 10);
        const to = parseInt(loopToInput.value, 10);
        if (!isValidBar(from) || !isValidBar(to) || from > to) {
            alert(`Введи диапазон от 1 до ${masterBars.length} (от ≤ до)`);
            return;
        }
        const range = {
            startTick: masterBars[from - 1].start,
            endTick: barEndTick(to - 1),
        };
        setLoopMode('section', range, /* jumpToStart */ true);
        saveSettings(getCurrentFile(), { loopMode: 'section', loopFrom: from, loopTo: to });
    };

    const resetLoopSection = () => {
        loopFromInput.value = '';
        loopToInput.value = '';
        setLoopMode('off');
        saveSettings(getCurrentFile(), { loopMode: 'off', loopFrom: null, loopTo: null });
    };

    loopSectionApplyBtn.addEventListener('click', applyLoopSection);
    loopSectionResetBtn.addEventListener('click', resetLoopSection);

    // ---------- drag по тактам → выделение секции ----------
    //
    // Логика: на mousedown запоминаем начальный такт. Если мышь уехала на другой
    // такт до отпускания — это drag, на mouseup ставим loop. Если осталась на
    // том же такте — это обычный клик, ничего не делаем (пусть alphaTab сам
    // отрабатывает seek).

    let dragStartBar = null;
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
            loopFromInput.value = from;
            loopToInput.value = to;
            applyLoopSection();
        }
        dragStartBar = null;
        isDragging = false;
    });

    // ---------- применение настроек при загрузке трека ----------

    const applySettings = () => {
        const name = getCurrentFile();
        const s = loadSettings(name);

        const speed = s.speed ?? 1.0;
        const volume = s.volume ?? 0.8;
        const metronome = s.metronome ?? 0;
        const countIn = s.countIn ?? false;

        api.playbackSpeed = speed;
        api.masterVolume = volume;
        api.metronomeVolume = metronome;
        api.countInVolume = countIn ? 1 : 0;

        speedSlider.value = speed;
        speedValue.textContent = fmtSpeed(speed);
        volumeSlider.value = volume * 100;
        volumeValue.textContent = fmtPercent(volume * 100);
        metronomeSlider.value = metronome * 100;
        metronomeValue.textContent = fmtPercent(metronome * 100);
        countInCheckbox.checked = countIn;

        // Восстанавливаем loop-режим после того, как стал известен masterBars
        loopFromInput.max = masterBars.length;
        loopToInput.max = masterBars.length;
        dragStartBar = null;
        isDragging = false;

        const savedMode = s.loopMode ?? 'off';
        if (
            savedMode === 'section' &&
            isValidBar(s.loopFrom) &&
            isValidBar(s.loopTo) &&
            s.loopFrom <= s.loopTo
        ) {
            loopFromInput.value = s.loopFrom;
            loopToInput.value = s.loopTo;
            setLoopMode('section', {
                startTick: masterBars[s.loopFrom - 1].start,
                endTick: barEndTick(s.loopTo - 1),
            });
        } else {
            loopFromInput.value = '';
            loopToInput.value = '';
            setLoopMode(savedMode === 'track' ? 'track' : 'off');
        }
    };

    api.scoreLoaded.on((score) => {
        masterBars = score.masterBars;
        applySettings();
        barPosition.textContent = `1 / ${masterBars.length}`;
        progressFill.style.width = '0%';
    });

    // tickPosition восстанавливаем после готовности плеера (soundfont загружен и т.д.).
    api.playerReady.on(() => {
        const s = loadSettings(getCurrentFile());
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

    playBtn.addEventListener('click', () => api.playPause());
    stopBtn.addEventListener('click', () => api.stop());

    // PlayerState: Paused = 0, Playing = 1
    api.playerStateChanged.on(({ state }) => {
        playBtn.textContent = state === 1 ? '⏸ Pause' : '▶ Play';
        // На паузе — сохраняем позицию, чтобы при перезагрузке возобновиться отсюда
        if (state === 0) {
            saveSettings(getCurrentFile(), { tickPosition: api.tickPosition });
        }
    });

    window.addEventListener('beforeunload', () => {
        saveSettings(getCurrentFile(), { tickPosition: api.tickPosition });
    });

    // ---------- слайдеры ----------

    // Используем `input` для мгновенного отклика и `change` для сохранения
    // (иначе писали бы в localStorage 100 раз за один drag).

    speedSlider.addEventListener('input', () => {
        const v = parseFloat(speedSlider.value);
        api.playbackSpeed = v;
        speedValue.textContent = fmtSpeed(v);
    });
    speedSlider.addEventListener('change', () => {
        saveSettings(getCurrentFile(), { speed: parseFloat(speedSlider.value) });
    });

    volumeSlider.addEventListener('input', () => {
        const v = parseInt(volumeSlider.value, 10);
        api.masterVolume = v / 100;
        volumeValue.textContent = fmtPercent(v);
    });
    volumeSlider.addEventListener('change', () => {
        saveSettings(getCurrentFile(), { volume: parseInt(volumeSlider.value, 10) / 100 });
    });

    metronomeSlider.addEventListener('input', () => {
        const v = parseInt(metronomeSlider.value, 10);
        api.metronomeVolume = v / 100;
        metronomeValue.textContent = fmtPercent(v);
    });
    metronomeSlider.addEventListener('change', () => {
        saveSettings(getCurrentFile(), { metronome: parseInt(metronomeSlider.value, 10) / 100 });
    });

    countInCheckbox.addEventListener('change', () => {
        api.countInVolume = countInCheckbox.checked ? 1 : 0;
        saveSettings(getCurrentFile(), { countIn: countInCheckbox.checked });
    });

    loopCheckbox.addEventListener('change', () => {
        const mode = loopCheckbox.checked ? 'track' : 'off';
        setLoopMode(mode);
        saveSettings(getCurrentFile(), { loopMode: mode, loopFrom: null, loopTo: null });
        if (mode === 'track') {
            // Включили loop трека — сбрасываем поля секции
            loopFromInput.value = '';
            loopToInput.value = '';
        }
    });

    // ---------- hotkeys ----------

    const isTypingTarget = (target) => {
        if (!target) return false;
        const tag = target.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
    };

    const goToBar = (idx) => {
        if (masterBars.length === 0) return;
        const clamped = clamp(idx, 0, masterBars.length - 1);
        api.tickPosition = masterBars[clamped].start;
    };

    const stepSpeed = (delta) => {
        const rounded = stepSpeedFn(api.playbackSpeed, delta);
        api.playbackSpeed = rounded;
        speedSlider.value = rounded;
        speedValue.textContent = fmtSpeed(rounded);
        saveSettings(getCurrentFile(), { speed: rounded });
    };

    document.addEventListener('keydown', (ev) => {
        if (isTypingTarget(ev.target)) return;
        if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

        switch (ev.code) {
            case 'Space':
                ev.preventDefault();
                api.playPause();
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
