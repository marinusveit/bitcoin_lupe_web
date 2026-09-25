// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import MerkleDemo from './MerkleDemo.svelte';

describe('MerkleDemo', () => {
  afterEach(cleanup);

  it('lässt den Beweis nach dem Hinzufügen einer Transaktion gültig (Header zieht mit)', async () => {
    render(MerkleDemo);
    await fireEvent.click(screen.getByRole('button', { name: 'Transaktion hinzufügen' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Tx 5: Merkle-Beweis anzeigen' }));
    expect(screen.getByText(/Beweis gültig/)).toBeTruthy();
  });

  it('lässt den Beweis nach einer Textänderung gegen den festen Header scheitern', async () => {
    render(MerkleDemo);
    const input = screen.getAllByRole('textbox')[2]!;
    await fireEvent.input(input, { target: { value: 'Carol → Dave 5 BTC' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Tx 3: Merkle-Beweis anzeigen' }));
    expect(screen.getByText(/Beweis scheitert/)).toBeTruthy();
  });

  it('zeigt Bitcoin-konforme TxIDs (byte-umgedrehter HASH256) und die passende Wurzel', () => {
    render(MerkleDemo);
    expect(screen.getByText(/TxID 9e7f5fd0/)).toBeTruthy();
    expect(screen.getByTitle(/^787d7c7a905b523d/)).toBeTruthy();
  });

  it('erklärt nach dem Neuschreiben einer abweichenden Wurzel, dass es ein anderer Block ist', async () => {
    render(MerkleDemo);
    const note = /anderer Block/;
    await fireEvent.click(screen.getByRole('button', { name: 'Transaktion hinzufügen' }));
    expect(screen.queryByText(note)).toBeNull();
    const input = screen.getAllByRole('textbox')[2]!;
    await fireEvent.input(input, { target: { value: 'Carol → Dave 5 BTC' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Wurzel in den Block-Header schreiben' }));
    expect(screen.getByText(note)).toBeTruthy();
  });

  it('verweist bei unveränderter Tx auf den Geschwister-Hash aus dem veränderten Teil', async () => {
    render(MerkleDemo);
    const input = screen.getAllByRole('textbox')[2]!;
    await fireEvent.input(input, { target: { value: 'Carol → Dave 5 BTC' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Tx 1: Merkle-Beweis anzeigen' }));
    expect(screen.getByText(/Beweis scheitert/)).toBeTruthy();
    const hint = screen.getByText(/Tx 1 ist unverändert/);
    expect(hint.textContent).toMatch(/der Hash\s+[0-9a-f]{8}\s+stammt aus dem veränderten Teil des Baums/);
    // Genau eine Beweiszeile (Ebene 1, Geschwister über Tx 3/4) ist markiert, Ebene 0 (Tx 2) nicht.
    const marked = screen.getAllByText('passt nicht zum Stand beim Header-Eintrag');
    expect(marked).toHaveLength(1);
    const sib = marked[0]!.closest('li')!.querySelector('.sib')!.textContent;
    expect(hint.textContent).toContain(sib);
  });

  it('behält den bisherigen Text, wenn die gewählte Tx selbst verändert ist', async () => {
    render(MerkleDemo);
    const input = screen.getAllByRole('textbox')[2]!;
    await fireEvent.input(input, { target: { value: 'Carol → Dave 5 BTC' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Tx 3: Merkle-Beweis anzeigen' }));
    expect(screen.getByText(/hat sich eine Transaktion geändert/)).toBeTruthy();
    expect(screen.queryByText(/ist unverändert/)).toBeNull();
  });

  it('beschriftet bei nur einer Transaktion das Blatt als Merkle-Wurzel', async () => {
    render(MerkleDemo);
    const remove = screen.getByRole('button', { name: 'Transaktion entfernen' });
    for (let k = 0; k < 3; k++) await fireEvent.click(remove);
    expect(screen.getByText('Merkle-Wurzel')).toBeTruthy();
  });

  it('bringt nach Entfernen und Wieder-Hinzufügen die Ausgangstransaktionen zurück', async () => {
    render(MerkleDemo);
    const remove = screen.getByRole('button', { name: 'Transaktion entfernen' });
    for (let k = 0; k < 3; k++) await fireEvent.click(remove);
    const add = screen.getByRole('button', { name: 'Transaktion hinzufügen' });
    for (let k = 0; k < 3; k++) await fireEvent.click(add);
    const values = screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value);
    expect(values).toEqual(['Alice → Bob 2 BTC', 'Bob → Carol 1 BTC', 'Carol → Dave 0,5 BTC', 'Dave → Eve 0,2 BTC']);
  });

  it('kündigt nur das Urteil live an, nicht die Hash-Zeilen des Beweises', async () => {
    const { container } = render(MerkleDemo);
    await fireEvent.click(screen.getByRole('button', { name: 'Tx 1: Merkle-Beweis anzeigen' }));
    const live = container.querySelectorAll('[aria-live]');
    expect(live).toHaveLength(1);
    expect(live[0]!.querySelector('.verdict')).toBeTruthy();
    expect(live[0]!.querySelector('.steps')).toBeNull();
  });
});
