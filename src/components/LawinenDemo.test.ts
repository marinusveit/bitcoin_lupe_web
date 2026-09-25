// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import LawinenDemo from './LawinenDemo.svelte';

function differingPositions(a: string, b: string): number[] {
  const ca = Array.from(a);
  const cb = Array.from(b);
  expect(cb.length).toBe(ca.length);
  return ca.flatMap((c, i) => (c === cb[i] ? [] : [i]));
}

describe('LawinenDemo', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('ändert bei jedem Klick genau ein Zeichen von Text A, auch nach mehreren Klicks', async () => {
    // Feste Zufallsfolge, damit die Klicks verschiedene Stellen treffen.
    const seq = [0.05, 0.42, 0.71, 0.93, 0.27, 0.6];
    let k = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => seq[k++ % seq.length]!);

    render(LawinenDemo);
    const [a, b] = screen.getAllByRole('textbox') as HTMLInputElement[];
    const button = screen.getByRole('button', { name: /Ein Zeichen/ });
    await fireEvent.click(button);
    await fireEvent.click(button);

    expect(a!.value).toBe('Hochschule München');
    const [pos] = differingPositions(a!.value, b!.value);
    expect(differingPositions(a!.value, b!.value)).toHaveLength(1);
    expect(screen.getByText(new RegExp(`geändertem Zeichen ${pos! + 1}:`))).toBeTruthy();
  });

  it('leert den Verlauf der Zufallsänderungen, sobald man selbst in Text A oder B tippt', async () => {
    render(LawinenDemo);
    const [a, b] = screen.getAllByRole('textbox') as HTMLInputElement[];
    const button = screen.getByRole('button', { name: /Ein Zeichen/ });
    await fireEvent.click(button);
    await fireEvent.click(button);
    expect(screen.getByText(/Nach 2 Änderungen/)).toBeTruthy();

    await fireEvent.input(b!, { target: { value: 'Hochschule München' } });
    expect(screen.queryByText(/Nach \d+ Änderung/)).toBeNull();

    await fireEvent.click(button);
    expect(screen.getByText(/Nach 1 Änderung:/)).toBeTruthy();
    await fireEvent.input(a!, { target: { value: 'Hallo' } });
    expect(screen.queryByText(/Nach \d+ Änderung/)).toBeNull();
  });
});
