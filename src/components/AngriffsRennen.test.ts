// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import AngriffsRennen, { catchUpChance } from './AngriffsRennen.svelte';

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

/** Legt die Blockfunde fest: Werte unter q (Start 30 %) gehen an den Angreifer, sonst an die Ehrlichen. */
function fixRandom(values: number[]) {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => values[Math.min(i++, values.length - 1)]!);
}

describe('AngriffsRennen: Ablauf', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('setzt „Ware geliefert“ direkt hinter den Block, bei dem geliefert wurde', async () => {
    fixRandom([0.9]);
    const { container } = render(AngriffsRennen);
    await fireEvent.click(screen.getByRole('button', { name: 'Ein Rennen starten' }));
    const mark = container.querySelector('.blk.mark');
    expect(mark?.nextElementSibling?.textContent).toBe('Ware geliefert');
  });

  it('nennt im Erfolgstext die neuen Blöcke beider Ketten getrennt', async () => {
    fixRandom([0.9, 0.9, 0.9, 0.1, 0.1, 0.1]);
    render(AngriffsRennen);
    await fireEvent.click(screen.getByRole('button', { name: 'Ein Rennen starten' }));
    expect(screen.getByText(/Nach 6 neuen Blöcken \(3 ehrliche, 3 vom Angreifer\)/)).toBeTruthy();
  });

  it('zeigt eine Zahlzeile mit beiden Kettenlängen und dem Rückstand', async () => {
    fixRandom([0.9]);
    render(AngriffsRennen);
    await fireEvent.click(screen.getByRole('button', { name: 'Ein Rennen starten' }));
    expect(screen.getByText('Ehrlich 20 · Angreifer 0 · Rückstand 20')).toBeTruthy();
  });

  it('springt bei einem Doppelklick auf „Ein Rennen starten“ nicht sofort ans Ende', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    fixRandom([0.9]);
    render(AngriffsRennen);
    await fireEvent.click(screen.getByRole('button', { name: 'Ein Rennen starten' }));
    const skip = screen.getByRole('button', { name: 'Zum Ende springen' });
    await fireEvent.click(skip);
    expect(screen.queryByText(/Angriff gescheitert/)).toBeNull();
    await vi.advanceTimersByTimeAsync(300);
    await fireEvent.click(skip);
    expect(screen.getByText(/Angriff gescheitert/)).toBeTruthy();
  });
});
