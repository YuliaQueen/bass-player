/**
 * Чистые функции плеера: настройки, поиск такта, форматирование, валидации.
 * Без DOM и alphaTab — чтобы можно было покрыть тестами.
 */

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 1.5;
export const SPEED_STEP = 0.05;

export const settingsKey = (name) => `settings:${name}`;

/**
 * @param {string} name — имя файла
 * @param {Storage} [storage=globalThis.localStorage] — куда писать (для тестов можно подставить мок)
 */
export const loadSettings = (name, storage = globalThis.localStorage) => {
    if (!name || !storage) return {};
    try {
        return JSON.parse(storage.getItem(settingsKey(name)) || '{}');
    } catch {
        return {};
    }
};

export const saveSettings = (name, partial, storage = globalThis.localStorage) => {
    if (!name || !storage) return;
    const merged = { ...loadSettings(name, storage), ...partial };
    storage.setItem(settingsKey(name), JSON.stringify(merged));
};

export const fmtSpeed = (v) => `${v.toFixed(2)}x`;
export const fmtPercent = (v) => `${Math.round(v)}%`;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Проверка, что номер такта (1-based) валиден для данного количества тактов.
 */
export const isValidBar = (n, total) => Number.isFinite(n) && n >= 1 && n <= total;

/**
 * Линейный поиск такта по абсолютному tick'у. Бары короткие, перебор копеечный.
 * Возвращает 0-based индекс.
 */
export const findBarIndexByTick = (tick, masterBars) => {
    for (let i = masterBars.length - 1; i >= 0; i -= 1) {
        if (masterBars[i].start <= tick) return i;
    }
    return 0;
};

/**
 * Конец такта в тиках. У MasterBar нет готового свойства `end` — берём начало
 * следующего такта или, для последнего, считаем через calculateDuration().
 */
export const barEndTick = (idx, masterBars) => {
    const next = masterBars[idx + 1];
    if (next) return next.start;
    return masterBars[idx].start + masterBars[idx].calculateDuration();
};

/**
 * Шагнуть скоростью на delta, с клампом и округлением до шага слайдера.
 */
export const stepSpeed = (current, delta) => {
    const v = clamp(current + delta, SPEED_MIN, SPEED_MAX);
    return Math.round(v / SPEED_STEP) * SPEED_STEP;
};
