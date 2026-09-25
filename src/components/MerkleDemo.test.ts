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
});
