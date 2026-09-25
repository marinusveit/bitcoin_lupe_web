import type { SimNode, Tx, World } from '../../lib/sim';

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

/** Klarname einer Adresse (Wallet oder Miner). */
export function addressName(world: World, address: string): string {
  for (const n of Object.values(world.nodes)) {
    if ((n.kind === 'wallet' || n.kind === 'miner') && n.address === address) return n.name;
  }
  return address;
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

export function fmtNumber(n: number, digits = 1): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: digits });
}
