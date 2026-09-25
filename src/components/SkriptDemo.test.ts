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
    expect(screen.getByText('HASH160 (Mallory) ist nicht gleich HASH160 (Alice): Abbruch.')).toBeTruthy();
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

  it('übernimmt das aktuelle P2PKH als eigenes Skript mit Hex-Werten', async () => {
    render(SkriptDemo);
    await fireEvent.click(screen.getByRole('button', { name: 'Aktuelles P2PKH als eigenes Skript übernehmen' }));
    const sig = screen.getByRole('textbox', { name: /scriptSig/ }) as HTMLTextAreaElement;
    const pub = screen.getByRole('textbox', { name: /scriptPubKey/ }) as HTMLTextAreaElement;
    expect(sig.value).toMatch(/^[0-9a-f]+ [0-9a-f]{66}$/);
    expect(pub.value).toMatch(/^OP_DUP OP_HASH160 [0-9a-f]{40} OP_EQUALVERIFY OP_CHECKSIG$/);
    await runAll();
    expect(screen.getByRole('status').textContent).toMatch(/Gültig/);
  });

  it('weist bei mehr als einem Restelement auf die Clean-Stack-Weiterleitungsregel hin', async () => {
    render(SkriptDemo);
    await fireEvent.click(screen.getByRole('radio', { name: 'Eigenes Skript' }));
    // scriptSig OP_2 OP_3 bleibt, scriptPubKey legt nur 1 obenauf: drei Elemente übrig.
    const pub = screen.getByRole('textbox', { name: /scriptPubKey/ });
    await fireEvent.input(pub, { target: { value: 'OP_1' } });
    await runAll();
    expect(screen.getByRole('status').textContent).toMatch(/mehr als ein Element übrig/);
  });
});
