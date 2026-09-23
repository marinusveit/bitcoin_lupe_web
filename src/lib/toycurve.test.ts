import { describe, expect, it } from 'vitest';
import {
  INFINITY,
  add,
  double,
  groupOrder,
  isInfinity,
  isOnCurve,
  negate,
  pointOrder,
  pointsEqual,
  pointsOnCurve,
  scalarMul,
} from './toycurve';

describe('toycurve', () => {
  it('alle aufgelisteten Punkte liegen auf der Kurve', () => {
    for (const p of [17, 97]) {
      const points = pointsOnCurve(p);
      expect(points.length).toBeGreaterThan(0);
      for (const P of points) expect(isOnCurve(P, p)).toBe(true);
    }
    // y² = x³ + 7 über F_17 hat 17 gewöhnliche Punkte plus O.
    expect(groupOrder(17)).toBe(18);
  });

  it('P + (-P) = O und P + O = P', () => {
    const P = pointsOnCurve(97)[0]!;
    expect(isInfinity(add(P, negate(P)))).toBe(true);
    expect(pointsEqual(add(P, INFINITY), P)).toBe(true);
  });

  it('Addition und Verdopplung bleiben auf der Kurve und sind kommutativ', () => {
    const [P, Q] = pointsOnCurve(97);
    expect(isOnCurve(add(P!, Q!))).toBe(true);
    expect(pointsEqual(add(P!, Q!), add(Q!, P!))).toBe(true);
    expect(isOnCurve(double(P!))).toBe(true);
    expect(pointsEqual(double(P!), add(P!, P!))).toBe(true);
  });

  it('n·G = O für die Ordnung n, Zwischenpunkte vollständig', () => {
    for (const p of [17, 97]) {
      for (const G of pointsOnCurve(p)) {
        const n = pointOrder(G, p);
        expect(groupOrder(p) % n).toBe(0);
        const { result, steps } = scalarMul(n, G, p);
        expect(isInfinity(result)).toBe(true);
        expect(steps).toHaveLength(n);
        expect(pointsEqual(steps[0]!, G)).toBe(true);
      }
    }
  });

  it('ungeeignete Primzahlen werden abgelehnt', () => {
    expect(() => pointsOnCurve(7)).toThrow();
    expect(() => pointsOnCurve(15)).toThrow();
  });
});
