import { describe, expect, it } from 'vitest';
import {
  attackerSuccessProbability,
  confirmationsFor,
  exactAttackerSuccessProbability,
  seededRandom,
  simulateRace,
} from './nakamoto';

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

  it('findet die nötigen Bestätigungen der Whitepaper-Tabelle für q = 10 % bis 45 %', () => {
    const qs = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];
    expect(qs.map((q) => confirmationsFor(q))).toEqual([5, 8, 11, 15, 24, 41, 89, 340]);
  });

  it('bricht bei knapp unter 50 % nicht an einer Obergrenze ab', () => {
    expect(confirmationsFor(0.49)).toBe(8111);
    expect(attackerSuccessProbability(0.49, 8111)).toBeLessThan(0.001);
    expect(attackerSuccessProbability(0.49, 8110)).toBeGreaterThanOrEqual(0.001);
  });

  it('rechnet die genaue Formel (Grunspan/Pérez-Marco) nach', () => {
    expect(exactAttackerSuccessProbability(0.1, 0)).toBe(1);
    // z = 1: genau 2q
    expect(exactAttackerSuccessProbability(0.1, 1)).toBeCloseTo(0.2, 12);
    expect(exactAttackerSuccessProbability(0.3, 1)).toBeCloseTo(0.6, 12);
    // z = 2 und 3 von Hand: 1 − Σ_{k<z} C(k+z−1, k)(p^z q^k − q^z p^k)
    expect(exactAttackerSuccessProbability(0.3, 2)).toBeCloseTo(0.432, 12);
    expect(exactAttackerSuccessProbability(0.45, 3)).toBeCloseTo(0.81374625, 12);
    expect(exactAttackerSuccessProbability(0.5, 100)).toBe(1);
    expect(exactAttackerSuccessProbability(0, 3)).toBe(0);
  });

  it('bestimmt mit der genauen Formel die nötigen Bestätigungen wie Grunspan/Pérez-Marco', () => {
    const qs = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45];
    const exact = qs.map((q) => confirmationsFor(q, 0.001, exactAttackerSuccessProbability));
    expect(exact).toEqual([6, 9, 13, 20, 32, 58, 133, 539]);
    expect(confirmationsFor(0.5, 0.001, exactAttackerSuccessProbability)).toBeNull();
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

  it('die Erfolgsquote vieler Rennen liegt nahe an der genauen Formel', () => {
    const random = seededRandom(2024);
    const N = 20_000;
    let wins = 0;
    for (let i = 0; i < N; i++) if (simulateRace(0.3, 2, { random }).outcome === 'success') wins++;
    const expected = exactAttackerSuccessProbability(0.3, 2);
    expect(wins / N).toBeGreaterThan(expected - 0.015);
    expect(wins / N).toBeLessThan(expected + 0.015);
  });
});
