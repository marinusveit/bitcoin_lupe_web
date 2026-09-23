import type { RngState } from './types';

/** Legt einen Zufallszustand aus einem Seed an. */
export function createRng(seed: number): RngState {
  return { state: seed >>> 0 };
}

/** mulberry32: liefert eine Zahl in [0, 1) und schreibt den Zustand fort. */
export function nextRandom(rng: RngState): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
