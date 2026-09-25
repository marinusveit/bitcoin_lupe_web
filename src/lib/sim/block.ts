import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { bytesToHex, hexToBytes, sha256dHex } from '../hash';
import { ZERO_HASH } from '../block';
import { merkleRoot as bitcoinMerkleRoot } from '../merkle';
import type { Block, SimParams, Tx } from './types';
import { makeTx } from './tx';

export { ZERO_HASH };

/**
 * Merkle-Wurzel über die TxIDs in Anzeige-Reihenfolge, dieselbe Rechnung wie in Kapitel 2
 * (`src/lib/merkle.ts`, mit Byte-Drehung wie in Bitcoin). Ohne Transaktionen: Null-Hash.
 */
export function merkleRoot(txids: string[]): string {
  return txids.length === 0 ? ZERO_HASH : bitcoinMerkleRoot(txids);
}

export function headerString(prevHash: string, root: string, nonce: number, height: number): string {
  return `${prevHash}|${root}|${nonce}|${height}`;
}

export function hashHeader(prevHash: string, root: string, nonce: number, height: number): string {
  return sha256dHex(headerString(prevHash, root, nonce, height));
}

/** Zählt führende Nullbits eines Hashes. */
export function leadingZeroBits(bytes: Uint8Array): number {
  let bits = 0;
  for (const b of bytes) {
    if (b === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(b) - 24;
  }
  return bits;
}

export function hexLeadingZeroBits(hash: string): number {
  return leadingZeroBits(hexToBytes(hash));
}

/**
 * Sucht die kleinste Nonce, deren Blockhash `zeroBits` führende Nullbits hat.
 * Der gleichbleibende Anfang `prevHash|merkleRoot|` wird nur einmal gehasht (Midstate).
 */
export function findNonce(
  prevHash: string,
  root: string,
  height: number,
  zeroBits: number,
): { nonce: number; hash: string } {
  const midstate = sha256.create().update(utf8ToBytes(`${prevHash}|${root}|`));
  for (let nonce = 0; ; nonce++) {
    const h = sha256(midstate.clone().update(utf8ToBytes(`${nonce}|${height}`)).digest());
    if (leadingZeroBits(h) >= zeroBits) return { nonce, hash: bytesToHex(h) };
  }
}

/** Blockbelohnung ohne Gebühren: halbiert sich alle `halvingInterval` Blöcke. */
export function subsidy(height: number, params: SimParams): number {
  const halvings = Math.floor(height / params.halvingInterval);
  if (halvings >= 53) return 0;
  return Math.floor(params.initialSubsidy / 2 ** halvings);
}

/**
 * Difficulty für den Nachfolger von `parent`. Alle `retargetInterval` Blöcke wird sie so
 * angepasst, dass im Mittel alle `targetBlockTicks` ein Block entsteht, höchstens um Faktor 4.
 */
export function nextDifficulty(
  parent: Block,
  getBlock: (hash: string) => Block | undefined,
  params: SimParams,
): number {
  const height = parent.height + 1;
  if (height % params.retargetInterval !== 0) return parent.difficulty;
  let first: Block = parent;
  while (first.height > 0 && parent.height - first.height < params.retargetInterval) {
    const prev = getBlock(first.prevHash);
    if (!prev) break;
    first = prev;
  }
  const gaps = parent.height - first.height;
  if (gaps === 0) return parent.difficulty;
  const actual = Math.max(1, parent.timestampTick - first.timestampTick);
  const expected = gaps * params.targetBlockTicks;
  const factor = Math.min(4, Math.max(0.25, expected / actual));
  // Anders als bei Bitcoin (powLimit) darf die Difficulty hier unter den Startwert fallen; ein Deckel
  // würde die Zufallsfolge der Seeds ändern (Test Seed 21). Der Simulator-Text nennt die Abweichung.
  return parent.difficulty * factor;
}

/** Setzt einen Block zusammen und sucht die Nonce. */
export function assembleBlock(args: {
  height: number;
  prevHash: string;
  txs: Tx[];
  minerId: string;
  timestampTick: number;
  difficulty: number;
  zeroBits: number;
}): Block {
  const root = merkleRoot(args.txs.map((t) => t.txid));
  const { nonce, hash } = findNonce(args.prevHash, root, args.height, args.zeroBits);
  return {
    height: args.height,
    prevHash: args.prevHash,
    txs: args.txs,
    merkleRoot: root,
    nonce,
    minerId: args.minerId,
    timestampTick: args.timestampTick,
    difficulty: args.difficulty,
    hash,
  };
}

/** Genesis-Block mit Anfangsguthaben (Adresse → Satoshi). */
export function createGenesis(allocations: [string, number][], params: SimParams): Block {
  const tx = makeTx(
    [],
    allocations.map(([address, value]) => ({ address, value })),
    'genesis',
  );
  return assembleBlock({
    height: 0,
    prevHash: ZERO_HASH,
    txs: [tx],
    minerId: 'genesis',
    timestampTick: 0,
    difficulty: params.difficulty,
    zeroBits: params.displayZeroBits,
  });
}
