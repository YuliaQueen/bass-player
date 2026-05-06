import { describe, it, expect, beforeEach } from 'vitest';
import {
    SPEED_MIN,
    SPEED_MAX,
    SPEED_STEP,
    settingsKey,
    loadSettings,
    saveSettings,
    fmtSpeed,
    fmtPercent,
    clamp,
    isValidBar,
    findBarIndexByTick,
    barEndTick,
    stepSpeed,
    type StorageLike,
} from './playerLogic.ts';

class MemoryStorage implements StorageLike {
    private data = new Map<string, string>();
    getItem(k: string): string | null {
        return this.data.has(k) ? (this.data.get(k) ?? null) : null;
    }
    setItem(k: string, v: string): void {
        this.data.set(k, String(v));
    }
}

describe('clamp', () => {
    it('возвращает значение в диапазоне без изменений', () => {
        expect(clamp(5, 0, 10)).toBe(5);
    });
    it('обрезает снизу', () => {
        expect(clamp(-3, 0, 10)).toBe(0);
    });
    it('обрезает сверху', () => {
        expect(clamp(15, 0, 10)).toBe(10);
    });
    it('работает с дробями', () => {
        expect(clamp(0.7, 0, 1)).toBe(0.7);
        expect(clamp(1.5, 0, 1)).toBe(1);
    });
});

describe('isValidBar', () => {
    it('принимает 1-based номера в диапазоне [1, total]', () => {
        expect(isValidBar(1, 10)).toBe(true);
        expect(isValidBar(10, 10)).toBe(true);
        expect(isValidBar(5, 10)).toBe(true);
    });
    it('отвергает 0, отрицательные и больше total', () => {
        expect(isValidBar(0, 10)).toBe(false);
        expect(isValidBar(-1, 10)).toBe(false);
        expect(isValidBar(11, 10)).toBe(false);
    });
    it('отвергает NaN, Infinity, не-числа', () => {
        expect(isValidBar(NaN, 10)).toBe(false);
        expect(isValidBar(Infinity, 10)).toBe(false);
        expect(isValidBar('5', 10)).toBe(false);
    });
});

describe('findBarIndexByTick', () => {
    const bars = [{ start: 0 }, { start: 1000 }, { start: 2000 }, { start: 3000 }].map((b) => ({
        ...b,
        calculateDuration: () => 1000,
    }));

    it('возвращает 0 для tick=0', () => {
        expect(findBarIndexByTick(0, bars)).toBe(0);
    });
    it('возвращает индекс такта, в начало которого попал tick', () => {
        expect(findBarIndexByTick(1000, bars)).toBe(1);
        expect(findBarIndexByTick(2000, bars)).toBe(2);
    });
    it('возвращает индекс такта, в середине которого находится tick', () => {
        expect(findBarIndexByTick(500, bars)).toBe(0);
        expect(findBarIndexByTick(1500, bars)).toBe(1);
        expect(findBarIndexByTick(2500, bars)).toBe(2);
    });
    it('возвращает последний такт для tick за пределами', () => {
        expect(findBarIndexByTick(99999, bars)).toBe(3);
    });
    it('возвращает 0 при пустом массиве', () => {
        expect(findBarIndexByTick(100, [])).toBe(0);
    });
});

describe('barEndTick', () => {
    const bars = [
        { start: 0, calculateDuration: () => 1000 },
        { start: 1000, calculateDuration: () => 1000 },
        { start: 2000, calculateDuration: () => 500 },
    ];

    it('для не-последнего такта возвращает start следующего', () => {
        expect(barEndTick(0, bars)).toBe(1000);
        expect(barEndTick(1, bars)).toBe(2000);
    });
    it('для последнего такта считает через calculateDuration', () => {
        expect(barEndTick(2, bars)).toBe(2500);
    });
});

describe('settingsKey', () => {
    it('формирует префиксированный ключ', () => {
        expect(settingsKey('foo.gp')).toBe('settings:foo.gp');
        expect(settingsKey('Кино-Спокойная ночь.gp')).toBe('settings:Кино-Спокойная ночь.gp');
    });
});

describe('loadSettings / saveSettings', () => {
    let storage: MemoryStorage;
    beforeEach(() => {
        storage = new MemoryStorage();
    });

    it('возвращает {} для незнакомого имени', () => {
        expect(loadSettings('foo.gp', storage)).toEqual({});
    });

    it('сохраняет и читает настройки', () => {
        saveSettings('foo.gp', { speed: 0.5 }, storage);
        expect(loadSettings('foo.gp', storage)).toEqual({ speed: 0.5 });
    });

    it('мерджит partial с существующими', () => {
        saveSettings('foo.gp', { speed: 0.5, volume: 0.8 }, storage);
        saveSettings('foo.gp', { speed: 0.7 }, storage);
        expect(loadSettings('foo.gp', storage)).toEqual({ speed: 0.7, volume: 0.8 });
    });

    it('настройки на разные файлы изолированы', () => {
        saveSettings('a.gp', { speed: 0.5 }, storage);
        saveSettings('b.gp', { speed: 1.2 }, storage);
        expect(loadSettings('a.gp', storage)).toEqual({ speed: 0.5 });
        expect(loadSettings('b.gp', storage)).toEqual({ speed: 1.2 });
    });

    it('возвращает {} при битом JSON в localStorage', () => {
        storage.setItem(settingsKey('foo.gp'), '{not json');
        expect(loadSettings('foo.gp', storage)).toEqual({});
    });

    it('игнорирует пустое имя', () => {
        saveSettings('', { speed: 0.5 }, storage);
        expect(loadSettings('', storage)).toEqual({});
    });
});

describe('форматтеры', () => {
    it('fmtSpeed', () => {
        expect(fmtSpeed(1)).toBe('1.00x');
        expect(fmtSpeed(0.65)).toBe('0.65x');
        expect(fmtSpeed(1.5)).toBe('1.50x');
    });
    it('fmtPercent', () => {
        expect(fmtPercent(0)).toBe('0%');
        expect(fmtPercent(50)).toBe('50%');
        expect(fmtPercent(99.7)).toBe('100%');
    });
});

describe('stepSpeed', () => {
    it('увеличивает на шаг', () => {
        expect(stepSpeed(1.0, SPEED_STEP)).toBeCloseTo(1.05, 2);
    });
    it('уменьшает на шаг', () => {
        expect(stepSpeed(1.0, -SPEED_STEP)).toBeCloseTo(0.95, 2);
    });
    it('не выходит за SPEED_MIN', () => {
        expect(stepSpeed(SPEED_MIN, -SPEED_STEP)).toBe(SPEED_MIN);
    });
    it('не выходит за SPEED_MAX', () => {
        expect(stepSpeed(SPEED_MAX, SPEED_STEP)).toBe(SPEED_MAX);
    });
    it('округляет до сетки шага (нет накопления флоат-погрешностей)', () => {
        const v = stepSpeed(0.6, SPEED_STEP);
        expect(v).toBeCloseTo(0.65, 5);
    });
});
