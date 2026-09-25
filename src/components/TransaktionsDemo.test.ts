// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import TransaktionsDemo from './TransaktionsDemo.svelte';

/** Gibt einen Betrag ein, sendet Alice → Bob und liefert die Fehlermeldung (oder null). */
async function sendAmount(amount: string): Promise<string | null> {
  render(TransaktionsDemo);
  await fireEvent.input(screen.getByLabelText('Betrag in BTC'), { target: { value: amount } });
  await fireEvent.click(screen.getByRole('button', { name: 'Signieren und senden' }));
  return screen.queryByRole('alert')?.textContent ?? null;
}

describe('TransaktionsDemo: Betragseingabe', () => {
  afterEach(cleanup);

  it.each(['1.000', '0x10', '1e3', '10,123456789'])('lehnt „%s“ mit Meldung ab und sendet nichts', async (amount) => {
    const error = await sendAmount(amount);
    expect(error).toBeTruthy();
    expect(screen.queryByText(/Zuletzt: Alice zahlt Bob/)).toBeNull();
  });

  it.each(['2,5', '2.5', '0,00000001'])('nimmt „%s“ an und sendet', async (amount) => {
    const error = await sendAmount(amount);
    expect(error).toBeNull();
    expect(screen.getByText(/Zuletzt: Alice zahlt Bob/)).toBeTruthy();
  });

  it('nennt beim Tausenderpunkt das Komma als Dezimaltrennzeichen', async () => {
    expect(await sendAmount('1.000')).toMatch(/Tausenderpunkt/);
  });

  it('nennt bei zu vielen Nachkommastellen den Satoshi als kleinste Einheit', async () => {
    expect(await sendAmount('0,000000001')).toMatch(/1 Satoshi = 0,00000001 BTC/);
  });
});
