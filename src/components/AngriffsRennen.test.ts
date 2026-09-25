import { describe, expect, it } from 'vitest';
import { catchUpChance } from './AngriffsRennen.svelte';

describe('AngriffsRennen: Aufholchance (q/p)^Rückstand', () => {
  it('rechnet bei 30 % und einem Block Rückstand 3/7', () => {
    expect(catchUpChance(0.3, 1)).toBeCloseTo(3 / 7, 12);
  });

  it('liegt bei 30 % und zehn Blöcken Rückstand bei etwa 0,02 %', () => {
    expect(catchUpChance(0.3, 10)).toBeCloseTo(0.000209, 6);
  });

  it('ist ab der Hälfte der Rechenleistung 100 %', () => {
    expect(catchUpChance(0.5, 7)).toBe(1);
    expect(catchUpChance(0.6, 7)).toBe(1);
  });
});
