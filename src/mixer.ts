/**
 * Микшер дорожек: per-track громкость и mute.
 * AlphaTab играет MIDI всех дорожек песни (даже если рендерится только бас),
 * поэтому через api.changeTrackVolume / changeTrackMute можно регулировать каждую.
 *
 * Состояние сохраняется в localStorage на каждый файл:
 *   { volumes: { trackIndex: number }, mutes: { trackIndex: boolean } }
 */

import * as alphaTab from '@coderline/alphatab';

export interface MixerState {
    volumes: Record<number, number>; // 0..4 (1 = default, 2 = 200%, 4 = 400%)
    mutes: Record<number, boolean>;
    solos: Record<number, boolean>;
}

const KEY = (file: string) => `mixer:${file}`;

const emptyState = (): MixerState => ({ volumes: {}, mutes: {}, solos: {} });

export const loadMixer = (file: string, storage: Storage = localStorage): MixerState => {
    if (!file) return emptyState();
    try {
        const raw = storage.getItem(KEY(file));
        const parsed = raw ? (JSON.parse(raw) as Partial<MixerState>) : {};
        return {
            volumes: parsed.volumes ?? {},
            mutes: parsed.mutes ?? {},
            solos: parsed.solos ?? {},
        };
    } catch {
        return emptyState();
    }
};

export const saveMixer = (file: string, state: MixerState, storage: Storage = localStorage): void => {
    if (!file) return;
    storage.setItem(KEY(file), JSON.stringify(state));
};

/** Является ли дорожка басовой (MIDI program 32–39 — General MIDI bass family). */
export const isBassTrack = (track: alphaTab.model.Track): boolean => {
    const p = track.playbackInfo.program;
    return p >= 32 && p <= 39;
};

interface InitMixerOptions {
    api: alphaTab.AlphaTabApi;
    listEl: HTMLElement;
    button: HTMLButtonElement;
    dropdown: HTMLElement;
    resetBtn: HTMLButtonElement;
    getCurrentFile: () => string | null;
}

export const initMixer = ({
    api,
    listEl,
    button,
    dropdown,
    resetBtn,
    getCurrentFile,
}: InitMixerOptions): void => {
    let tracks: alphaTab.model.Track[] = [];
    let state: MixerState = emptyState();

    const fmt = (v: number) => `${Math.round(v * 100)}%`;

    /** Применить громкость+mute+solo трека к alphaTab API. */
    const applyTrack = (track: alphaTab.model.Track): void => {
        const idx = track.index;
        const muted = state.mutes[idx] ?? false;
        const solo = state.solos[idx] ?? false;
        const volume = state.volumes[idx] ?? 1;
        api.changeTrackMute([track], muted);
        api.changeTrackSolo([track], solo);
        api.changeTrackVolume([track], muted ? 0 : volume);
    };

    /** Применить настройки ко всем дорожкам. */
    const applyAll = (): void => {
        tracks.forEach(applyTrack);
    };

    const persist = (): void => {
        const file = getCurrentFile();
        if (file) saveMixer(file, state);
    };

    const renderRow = (track: alphaTab.model.Track): HTMLLIElement => {
        const idx = track.index;
        const li = document.createElement('li');
        li.className = isBassTrack(track) ? 'mixer-track is-bass' : 'mixer-track';

        const muted = state.mutes[idx] ?? false;
        const solo = state.solos[idx] ?? false;
        const volume = state.volumes[idx] ?? 1;

        const buttons = document.createElement('div');
        buttons.className = 'mixer-buttons';

        const muteBtn = document.createElement('button');
        muteBtn.type = 'button';
        muteBtn.className = muted ? 'mixer-mute active' : 'mixer-mute';
        muteBtn.textContent = 'M';
        muteBtn.title = 'Mute';
        muteBtn.addEventListener('click', () => {
            const newMuted = !(state.mutes[idx] ?? false);
            state.mutes[idx] = newMuted;
            muteBtn.classList.toggle('active', newMuted);
            applyTrack(track);
            persist();
        });

        const soloBtn = document.createElement('button');
        soloBtn.type = 'button';
        soloBtn.className = solo ? 'mixer-solo active' : 'mixer-solo';
        soloBtn.textContent = 'S';
        soloBtn.title = 'Solo (заглушает остальные)';
        soloBtn.addEventListener('click', () => {
            const newSolo = !(state.solos[idx] ?? false);
            state.solos[idx] = newSolo;
            soloBtn.classList.toggle('active', newSolo);
            applyTrack(track);
            persist();
        });

        buttons.append(muteBtn, soloBtn);

        const info = document.createElement('div');
        info.className = 'mixer-track-info';
        const name = document.createElement('div');
        name.className = 'mixer-track-name';
        name.textContent = track.name || `Track ${idx + 1}`;
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '4';
        slider.step = '0.05';
        slider.value = String(volume);
        info.append(name, slider);

        const value = document.createElement('div');
        value.className = 'mixer-volume';
        value.textContent = fmt(volume);

        slider.addEventListener('input', () => {
            const v = parseFloat(slider.value);
            state.volumes[idx] = v;
            value.textContent = fmt(v);
            applyTrack(track);
        });
        slider.addEventListener('change', persist);

        li.append(buttons, info, value);
        return li;
    };

    const render = (): void => {
        listEl.innerHTML = '';
        if (tracks.length === 0) {
            const empty = document.createElement('li');
            empty.style.padding = '16px';
            empty.style.color = 'var(--subtle)';
            empty.style.fontSize = '12px';
            empty.style.textAlign = 'center';
            empty.textContent = 'Откройте файл, чтобы увидеть дорожки';
            listEl.append(empty);
            return;
        }
        for (const track of tracks) {
            listEl.append(renderRow(track));
        }
    };

    // Тогглим дропдаун
    button.addEventListener('click', (ev) => {
        ev.stopPropagation();
        dropdown.hidden = !dropdown.hidden;
    });
    dropdown.addEventListener('click', (ev) => ev.stopPropagation());
    document.addEventListener('click', () => {
        if (!dropdown.hidden) dropdown.hidden = true;
    });

    resetBtn.addEventListener('click', () => {
        state = emptyState();
        applyAll();
        render();
        persist();
    });

    // Подписка на загрузку нового файла: подтягиваем state, применяем громкости
    api.scoreLoaded.on((score) => {
        tracks = [...score.tracks];
        const file = getCurrentFile();
        state = file ? loadMixer(file) : emptyState();
        render();
    });

    // changeTrackVolume на свежеподнятый плеер не всегда «прилипает» —
    // повторяем после готовности плеера, гарантировано применяет настройки.
    api.playerReady.on(() => applyAll());
};
