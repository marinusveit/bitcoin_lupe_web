// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import SignaturDemo from './SignaturDemo.svelte';

const WRONG_KEY = /nicht mit dem privaten Schlüssel zu diesem öffentlichen Schlüssel erstellt/;

describe('SignaturDemo', () => {
  afterEach(cleanup);

  it('erklärt die Signatur von Mallory als ungültig, weil sie nicht zu Alices öffentlichem Schlüssel passt', async () => {
    render(SignaturDemo);
    expect(screen.getByText('Signatur gültig')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Mallory signiert statt Alice' }));
    expect(screen.getByText('Signatur ungültig')).toBeTruthy();
    expect(screen.getByText(WRONG_KEY)).toBeTruthy();
    expect(screen.queryByText(/Zwei Gründe/)).toBeNull();
  });

  it('nennt beide Gründe, wenn Mallory signiert und die Nachricht manipuliert wurde', async () => {
    render(SignaturDemo);
    await fireEvent.click(screen.getByRole('button', { name: 'Mallory signiert statt Alice' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Nachricht manipulieren' }));
    expect(screen.getByText(/Zwei Gründe: Die Nachricht wurde nach dem Signieren verändert/)).toBeTruthy();
    expect(screen.getByText(WRONG_KEY)).toBeTruthy();
  });
});
