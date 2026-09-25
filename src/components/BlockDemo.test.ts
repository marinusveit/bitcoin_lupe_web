// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import BlockDemo from './BlockDemo.svelte';

describe('BlockDemo', () => {
  afterEach(cleanup);

  it('nennt den Genesis-Block gültig', () => {
    render(BlockDemo);
    expect(screen.getByRole('status').textContent).toMatch(/Ja, der Block ist gültig/);
  });

  it('lehnt ein Target über dem Maximum ab, auch wenn der Hash darunter liegt', async () => {
    render(BlockDemo);
    await fireEvent.click(screen.getByRole('button', { name: 'Nonce +1' }));
    await fireEvent.input(screen.getByLabelText(/nBits/), { target: { value: '207fffff' } });
    const status = screen.getByRole('status').textContent ?? '';
    expect(status).toMatch(/lehnt Bitcoin ab/);
    expect(status).not.toMatch(/Block ist gültig/);
  });
  it('zeigt die Merkle-Wurzel weiter an, wenn nur ein anderes Feld fehlerhaft ist', async () => {
    render(BlockDemo);
    await fireEvent.input(screen.getByLabelText(/nBits/), { target: { value: 'ff00ffff' } });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b')).toBeTruthy();
  });

  it('lehnt eine Version außerhalb von 32 Bit mit Vorzeichen ab', async () => {
    render(BlockDemo);
    await fireEvent.input(screen.getByLabelText(/^Version/), { target: { value: '99999999999' } });
    expect(screen.getByRole('alert').textContent).toMatch(/Version/);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('erklärt ein negatives Target über das zweite Byte von nBits', async () => {
    render(BlockDemo);
    await fireEvent.input(screen.getByLabelText(/nBits/), { target: { value: '1d80ffff' } });
    expect(screen.getByRole('alert').textContent).toMatch(/zweite Byte von nBits darf höchstens 7f sein/);
  });
});
