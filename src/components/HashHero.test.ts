// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import HashHero from './HashHero.svelte';

describe('HashHero', () => {
  afterEach(cleanup);

  it('sperrt „Zahl anhängen“, solange das Suchergebnis dasteht, und gibt den Knopf nach Tippen oder Zurücksetzen frei', async () => {
    render(HashHero);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    const button = screen.getByRole('button', { name: /Zahl anhängen/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    await fireEvent.click(button);
    expect(input.value).toMatch(/ #\d+$/);
    expect(screen.getByText(/nach [\d.]+ Versuchen/)).toBeTruthy();
    expect(button.disabled).toBe(true);

    await fireEvent.input(input, { target: { value: 'Hallo' } });
    expect(button.disabled).toBe(false);

    await fireEvent.click(button);
    expect(button.disabled).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(button.disabled).toBe(false);
  });
});
