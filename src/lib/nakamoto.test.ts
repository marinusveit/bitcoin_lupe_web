import { describe, expect, it } from 'vitest';
import { attackerSuccessProbability, confirmationsFor, seededRandom, simulateRace } from './nakamoto';

describe('nakamoto', () => {
  it('rechnet die Tabelle aus Abschnitt 11 des Whitepapers nach', () => {
    // q = 0,1
    expect(attackerSuccessProbability(0.1, 0)).toBe(1);
    expect(attackerSuccessProbability(0.1, 1)).toBeCloseTo(0.2045873, 6);
    expect(attackerSuccessProbability(0.1, 3)).toBeCloseTo(0.0131722, 6);
    expect(attackerSuccessProbability(0.1, 5)).toBeCloseTo(0.0009137, 6);
    // q = 0,3
    expect(attackerSuccessProbability(0.3, 5)).toBeCloseTo(0.1773523, 6);
    expect(attackerSuccessProbability(0.3, 10)).toBeCloseTo(0.0416605, 6);
    // ab 50 % hilft kein Warten
    expect(attackerSuccessProbability(0.5, 100)).toBe(1);
  });

  it('bestimmt die nötigen Bestätigungen für unter 0,1 % Risiko', () => {
    expect(confirmationsFor(0.1)).toBe(5);
    expect(confirmationsFor(0.3)).toBe(24);
    expect(confirmationsFor(0.5)).toBeNull();
  });

  it('simulateRace liefert konsistente Zählungen', () => {
    const r = simulateRace(0.3, 3, { random: seededRandom(7) });
    expect(r.steps.filter((s) => s === 'honest')).toHaveLength(r.honest);
    expect(r.steps.filter((s) => s === 'attacker')).toHaveLength(r.attacker);
    if (r.outcome === 'success') expect(r.attacker).toBeGreaterThanOrEqual(r.honest);
    else expect(r.honest - r.attacker).toBeGreaterThanOrEqual(1);
    expect(r.deliveredAt).toBeGreaterThan(0);
    const untilDelivery = r.steps.slice(0, r.deliveredAt).filter((s) => s === 'honest');
    expect(untilDelivery).toHaveLength(3);
  });

  it('simulateRace gelingt ohne Bestätigungen sofort und mit 60 % praktisch immer', () => {
    expect(simulateRace(0.1, 0).outcome).toBe('success');
    const random = seededRandom(42);
    let wins = 0;
    for (let i = 0; i < 200; i++) if (simulateRace(0.6, 3, { random }).outcome === 'success') wins++;
    expect(wins).toBeGreaterThan(190);
  });

  it('die Erfolgsquote vieler Rennen liegt nahe an der Formel', () => {
    const random = seededRandom(2024);
    const N = 20_000;
    let wins = 0;
    for (let i = 0; i < N; i++) if (simulateRace(0.3, 2, { random }).outcome === 'success') wins++;
    const expected = attackerSuccessProbability(0.3, 2);
    expect(wins / N).toBeGreaterThan(expected - 0.03);
    expect(wins / N).toBeLessThan(expected + 0.03);
  });
});
