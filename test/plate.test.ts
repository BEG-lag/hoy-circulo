import { describe, expect, it } from 'vitest';
import { colorForDigit, isValidDigit, parsePlate, weekdayForDigit } from '../src/engine/plate.ts';

describe('parsePlate', () => {
  it('uses the last numeric digit', () => {
    expect(parsePlate('ABC-123')?.digit).toBe(3);
    expect(parsePlate('123-ABC')?.digit).toBe(3);
    expect(parsePlate('a12-bcd')?.digit).toBe(2);
    expect(parsePlate(' xyz 9 ')?.digit).toBe(9);
  });

  it('normalizes the plate', () => {
    expect(parsePlate('abc-12-34')?.normalized).toBe('ABC1234');
    expect(parsePlate('ñab-120')?.normalized).toBe('ÑAB120');
  });

  it('flags plates with several numeric series', () => {
    const p = parsePlate('ABC-12-34');
    expect(p).toMatchObject({ digit: 4, ambiguous: true, firstSeriesDigit: 2, series: ['12', '34'] });
    expect(parsePlate('ABC-123')?.ambiguous).toBe(false);
    expect(parsePlate('ABC-123')?.firstSeriesDigit).toBeNull();
  });

  it('treats letters-only plates as blue / even (decreto 2014, numeral X)', () => {
    expect(parsePlate('ABCDEF')).toMatchObject({ digit: 0, method: 'letters-only' });
  });

  it('rejects empty and overlong input', () => {
    expect(parsePlate('')).toBeNull();
    expect(parsePlate(' - ')).toBeNull();
    expect(parsePlate('ABCDEFGHIJKLM')).toBeNull();
  });
});

describe('digit tables', () => {
  it('maps every digit to its sticker color and weekday', () => {
    const expected: [number, string, number][] = [
      [5, 'amarillo', 1], [6, 'amarillo', 1],
      [7, 'rosa', 2], [8, 'rosa', 2],
      [3, 'rojo', 3], [4, 'rojo', 3],
      [1, 'verde', 4], [2, 'verde', 4],
      [9, 'azul', 5], [0, 'azul', 5],
    ];
    for (const [digit, color, weekday] of expected) {
      expect(colorForDigit(digit)).toBe(color);
      expect(weekdayForDigit(digit)).toBe(weekday);
    }
    expect(() => colorForDigit(10)).toThrow();
    expect(() => weekdayForDigit(-1)).toThrow();
  });

  it('validates digits', () => {
    expect(isValidDigit(0)).toBe(true);
    expect(isValidDigit(9)).toBe(true);
    expect(isValidDigit(10)).toBe(false);
    expect(isValidDigit(2.5)).toBe(false);
    expect(isValidDigit('3')).toBe(false);
  });
});
