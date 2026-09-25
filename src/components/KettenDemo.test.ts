// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import KettenDemo from './KettenDemo.svelte';

describe('KettenDemo', () => {
  afterEach(cleanup);

  it('hasht eine gebrochene Nonce als ihren ganzzahligen Teil', async () => {
    render(KettenDemo);
    // Block 1 ist mit Nonce 65131 gültig; 65131.7 muss denselben Hash ergeben.
    const nonce = screen.getAllByRole('spinbutton')[0]!;
    await fireEvent.input(nonce, { target: { value: '65131.7' } });
    expect(screen.getByRole('status').textContent).toMatch(/Alle Blöcke sind gültig/);
  });

  it('hasht eine negative oder leere Nonce wie Nonce 0', async () => {
    render(KettenDemo);
    const nonce = screen.getAllByRole('spinbutton')[0]!;
    const hashField = () => screen.getAllByText(/Eigener Hash/)[0]!.parentElement!.querySelector('.hash')!.textContent;
    await fireEvent.input(nonce, { target: { value: '0' } });
    const zero = hashField();
    await fireEvent.input(nonce, { target: { value: '-5' } });
    expect(hashField()).toBe(zero);
    await fireEvent.input(nonce, { target: { value: '' } });
    expect(hashField()).toBe(zero);
  });
});
