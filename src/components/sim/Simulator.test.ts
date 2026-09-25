// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import Simulator from './Simulator.svelte';

describe('Simulator', () => {
  afterEach(cleanup);

  it('hält nach „Zurücksetzen“ an und steht wieder im Zustand „Start“', async () => {
    render(Simulator, { compact: true });
    await fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  });

  it('leert die Meldung des Formulars beim Zurücksetzen', async () => {
    render(Simulator, { compact: true });
    await fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
    expect(screen.getByText(/ist unterwegs/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(screen.queryByText(/ist unterwegs/)).toBeNull();
  });

  it('erklärt beim zweiten Senden, dass das Guthaben in der ersten Zahlung steckt', async () => {
    render(Simulator, { compact: true });
    const send = screen.getByRole('button', { name: 'Senden' });
    await fireEvent.click(send);
    await fireEvent.click(send);
    expect(screen.getByText(/Deine 50 BTC stecken in einer Zahlung, die gerade unterwegs ist/)).toBeTruthy();
  });

  it('verspricht im Kapitel keine Knotendetails und keine langsame Verbindung', () => {
    render(Simulator, { compact: true });
    expect(screen.queryByText(/Klicke auf einen Knoten/)).toBeNull();
    expect(screen.queryByText('langsame Verbindung')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Alice, Wallet/ })).toBeNull();
  });

  it('blendet Weiterleitungen im Protokoll standardmäßig aus', async () => {
    render(Simulator);
    await fireEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Ein Tick' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Ein Tick' }));
    expect(screen.getByText(/Alice sendet/)).toBeTruthy();
    expect(screen.queryByText(/nimmt Transaktion .* in den Mempool/)).toBeNull();
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Weiterleitungen zeigen' }));
    expect(screen.getAllByText(/nimmt Transaktion .* in den Mempool/).length).toBeGreaterThan(0);
  });
});
