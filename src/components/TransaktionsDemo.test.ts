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

describe('TransaktionsDemo: verbrauchte Kiste nach dem Senden', () => {
  afterEach(cleanup);

  it('zeigt die ausgegebene Kiste mit der neuen TxID und räumt beim Zurücksetzen auf', async () => {
    expect(await sendAmount('10')).toBeNull();
    const spent = screen.getByText(/^ausgegeben in [0-9a-f]{8}…$/);
    const txid = screen.getByText(/^[0-9a-f]{64}$/).textContent!;
    expect(spent.textContent).toBe(`ausgegeben in ${txid.slice(0, 8)}…`);
    await fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(screen.queryByText(/ausgegeben in/)).toBeNull();
  });
});

/** Sendet Alice → Bob mit Betrag und Gebühr und liefert den Text aller Hinweise. */
async function sendWithFee(amount: string, feeText: string): Promise<string> {
  render(TransaktionsDemo);
  await fireEvent.input(screen.getByLabelText('Betrag in BTC'), { target: { value: amount } });
  await fireEvent.input(screen.getByLabelText('Gebühr in BTC'), { target: { value: feeText } });
  await fireEvent.click(screen.getByRole('button', { name: 'Signieren und senden' }));
  return document.querySelector('.hints')?.textContent?.replace(/\s+/g, ' ') ?? '';
}

describe('TransaktionsDemo: Hinweise zu Gebühr und Wechselgeld', () => {
  afterEach(cleanup);

  it('sendet mit Gebühr 0, weist aber auf den fehlenden Anreiz für Miner hin', async () => {
    const hints = await sendWithFee('10', '0');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(/Zuletzt: Alice zahlt Bob/)).toBeTruthy();
    expect(hints).toMatch(/ohne Gebühr/i);
  });

  it('schlägt Wechselgeld unter 546 Satoshi der Gebühr zu und sagt das', async () => {
    // 50 BTC − 49,999899 − 0,0001 = 100 Satoshi Wechselgeld
    const hints = await sendWithFee('49,999899', '0,0001');
    expect(hints).toMatch(/100 Satoshi/);
    expect(hints).toMatch(/546 Satoshi/);
    expect(screen.queryByText(/Wechselgeld an den Absender/)).toBeNull();
    expect(screen.getByText('Gebühr', { selector: 'dt' }).nextElementSibling!.textContent).toMatch(/^0,000101 BTC/);
  });

  it('warnt, wenn die Gebühr größer als der Betrag ist', async () => {
    const hints = await sendWithFee('10', '20');
    expect(hints).toMatch(/Gebühr ist größer als der Betrag/);
  });

  it('gibt bei üblicher Gebühr keinen Hinweis', async () => {
    expect(await sendWithFee('10', '0,0001')).toBe('');
  });
});

describe('TransaktionsDemo: Betragsbalken', () => {
  afterEach(cleanup);

  it('trennt die Sätze der Balkennotiz mit einem Leerzeichen', async () => {
    expect(await sendAmount('10')).toBeNull();
    const note = document.querySelector('.bar-note')!.textContent!.replace(/\s+/g, ' ');
    expect(note).toContain('heraus. Sehr schmale');
  });
});
