// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import HashDemo from './HashDemo.svelte';
import { sha256Hex } from '../lib/hash';

describe('HashDemo', () => {
  afterEach(cleanup);

  it('zeigt nach einer Eingabe den vorherigen Hash mit Zählung gleicher Zeichen, Zurücksetzen leert ihn', async () => {
    render(HashDemo);
    expect(screen.queryByText('Vorheriger Hash')).toBeNull();

    const before = sha256Hex('Hochschule München');
    const after = sha256Hex('Hochschule München.');
    const same = [...before].filter((c, i) => c === after[i]).length;

    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'Hochschule München.' } });
    expect(screen.getByText('Vorheriger Hash')).toBeTruthy();
    expect(document.querySelector('.prev-hex')!.textContent!.trim()).toBe(before);
    expect(screen.getByText(after)).toBeTruthy();
    expect(screen.getByText(new RegExp(`^${same} von 64 Zeichen gleich`))).toBeTruthy();
    expect(document.querySelectorAll('.prev-hex .same')).toHaveLength(same);

    await fireEvent.click(screen.getByRole('button', { name: 'Bits' }));
    expect(screen.getByText(/Vorheriger Hash: \d+ von 256 Bit gleich/)).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(screen.queryByText('Vorheriger Hash')).toBeNull();
    expect(screen.queryByText(/von 256 Bit gleich/)).toBeNull();
  });
});
