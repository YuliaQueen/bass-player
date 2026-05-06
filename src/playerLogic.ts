/**
 * Чистые функции плеера: настройки, поиск такта, форматирование, валидации.
 * Без DOM и alphaTab — чтобы можно было покрыть тестами.
 */

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 1.5;
export const SPEED_STEP = 0.05;

export type LoopMode = 'off' | 'track' | 'section';

/** Настройки, которые сохраняются в localStorage на каждый файл. */
export interface Settings {
    speed?: number;
    volume?: number;
    metronome?: number;
    countIn?: boolean;
    loopMode?: LoopMode;
    loopFrom?: number | null;
    loopTo?: number | null;
    tickPosition?: number;
}

/** Минимальный shape MasterBar, которым мы пользуемся (без зависимости от alphaTab). */
export interface MasterBarLike {
    start: number;
    calculateDuration(): number;
}

/**
 * Storage-like интерфейс — реализуется в браузере объектом localStorage,
 * а в тестах подставляется любой совместимый класс.
 */
export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

export const settingsKey = (name: string): string => `settings:${name}`;

export const loadSettings = (
    name: string,
    storage: StorageLike | undefined = globalThis.localStorage,
): Settings => {
    if (!name || !storage) return {};
    try {
        return JSON.parse(storage.getItem(settingsKey(name)) || '{}') as Settings;
    } catch {
        return {};
    }
};

export const saveSettings = (
    name: string,
    partial: Settings,
    storage: StorageLike | undefined = globalThis.localStorage,
): void => {
    if (!name || !storage) return;
    const merged: Settings = { ...loadSettings(name, storage), ...partial };
    storage.setItem(settingsKey(name), JSON.stringify(merged));
};

export const fmtSpeed = (v: number): string => `${v.toFixed(2)}x`;
export const fmtPercent = (v: number): string => `${Math.round(v)}%`;
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Проверка, что номер такта (1-based) валиден для данного количества тактов.
 */
export const isValidBar = (n: unknown, total: number): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= total;

/**
 * Линейный поиск такта по абсолютному tick'у. Бары короткие, перебор копеечный.
 * Возвращает 0-based индекс.
 */
export const findBarIndexByTick = (tick: number, masterBars: MasterBarLike[]): number => {
    for (let i = masterBars.length - 1; i >= 0; i -= 1) {
        const bar = masterBars[i];
        if (bar && bar.start <= tick) return i;
    }
    return 0;
};

/**
 * Конец такта в тиках. У MasterBar нет готового свойства `end` — берём начало
 * следующего такта или, для последнего, считаем через calculateDuration().
 */
export const barEndTick = (idx: number, masterBars: MasterBarLike[]): number => {
    const next = masterBars[idx + 1];
    if (next) return next.start;
    const cur = masterBars[idx];
    if (!cur) throw new Error(`barEndTick: out-of-range index ${idx}`);
    return cur.start + cur.calculateDuration();
};

/**
 * Шагнуть скоростью на delta, с клампом и округлением до шага слайдера.
 */
export const stepSpeed = (current: number, delta: number): number => {
    const v = clamp(current + delta, SPEED_MIN, SPEED_MAX);
    return Math.round(v / SPEED_STEP) * SPEED_STEP;
};
