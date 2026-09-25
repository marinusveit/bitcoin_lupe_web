// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import SkriptDemo from './SkriptDemo.svelte';

async function runAll() {
  await fireEvent.click(screen.getByRole('button', { name: 'Alle' }));
}

describe('SkriptDemo', () => {
  afterEach(cleanup);

  it('lässt Mallory mit eigenem Schlüssel in Schritt 6 an OP_EQUALVERIFY scheitern', async () => {
    render(SkriptDemo);
    await fireEvent.click(screen.getByRole('radio', { name: 'Mallory mit eigenem Schlüssel' }));
    await runAll();
    expect(screen.getByText('Schritt 6 von 6')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Ungültig: OP_EQUALVERIFY/);
  });

  it('lässt Mallory mit Alices Public Key erst in Schritt 7 an OP_CHECKSIG scheitern', async () => {
    render(SkriptDemo);
    await fireEvent.click(screen.getByRole('radio', { name: 'Mallory mit Alices Public Key' }));
    await runAll();
    expect(screen.getByText('Schritt 7 von 7')).toBeTruthy();
    expect(screen.getByText(/Signatur passt nicht zu Public Key und Transaktion/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Ungültig/);
  });

  it('macht Alices Signatur ungültig, wenn die Transaktion nachträglich geändert wird', async () => {
    render(SkriptDemo);
    await fireEvent.click(screen.getByRole('checkbox', { name: /Transaktion nachträglich ändern/ }));
    await runAll();
    expect(screen.getByText('Schritt 7 von 7')).toBeTruthy();
    expect(screen.getByText(/Signatur passt nicht zu Public Key und Transaktion/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/Ungültig/);
  });
});
