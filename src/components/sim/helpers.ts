import type { SimNode, Tx } from '../../lib/sim';

/** Hervorgehobenes Element (per Klick im Protokoll oder in der Kettenansicht). */
export type Highlight = { kind: 'tx' | 'block'; id: string } | null;

/** Anzahl fester Miner-Farben (CSS-Variablen `--miner-1` bis `--miner-6`, in Simulator.svelte auf `--cat-*` gelegt). */
export const MINER_SLOTS = 6;

/** Farbplatz eines Miners, fest an seiner ID (m1 → 1, m2 → 2 …), damit die Farbe am Miner hängt. */
export function minerSlot(minerId: string): number {
  const n = Number(minerId.replace(/\D/g, ''));
  return Number.isFinite(n) && n > 0 ? ((n - 1) % MINER_SLOTS) + 1 : MINER_SLOTS;
}

export function minerColor(minerId: string): string {
  return `var(--miner-${minerSlot(minerId)})`;
}

/** Kurzname für enge Beschriftungen: „Knoten 3“ → „K3“, Miner und Wallets behalten ihren Namen. */
export function shortName(node: SimNode): string {
  if (node.kind === 'full') return node.name.replace(/^Knoten\s*/, 'K');
  return node.name;
}

export function isHighlightedTx(h: Highlight, txid: string): boolean {
  return h?.kind === 'tx' && h.id === txid;
}

export function isHighlightedBlock(h: Highlight, hash: string): boolean {
  return h?.kind === 'block' && h.id === hash;
}

/** Enthält der Block die hervorgehobene Transaktion? */
export function blockHasTx(h: Highlight, txs: Tx[]): boolean {
  return h?.kind === 'tx' && txs.some((t) => t.txid === h.id);
}
