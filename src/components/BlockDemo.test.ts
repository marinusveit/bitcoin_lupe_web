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
});
