import { describe, it, expect } from 'vitest';
import { stripExt } from './library.ts';

describe('stripExt', () => {
    it('убирает обычное расширение', () => {
        expect(stripExt('song.gp')).toBe('song');
        expect(stripExt('song.gpx')).toBe('song');
    });
    it('убирает только последнее расширение', () => {
        expect(stripExt('Hotel.California.gp')).toBe('Hotel.California');
    });
    it('работает с кириллицей и пробелами', () => {
        expect(stripExt('Кино-Спокойная ночь-04-03.gp')).toBe('Кино-Спокойная ночь-04-03');
    });
    it('не трогает имя без расширения', () => {
        expect(stripExt('NoExtension')).toBe('NoExtension');
    });
});
