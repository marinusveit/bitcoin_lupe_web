import type { Block, ChainNode, FullNode, SimParams, Tx, UtxoSet } from './types';
import { hashHeader, hexLeadingZeroBits, merkleRoot, nextDifficulty, subsidy } from './block';
import { applyTx, computeTxid, isCoinbase, mempoolSpent, outpointKey, sumOutputs, txFee, validateTx } from './tx';

export type ChainState = Pick<FullNode, 'mempool' | 'blocks' | 'work' | 'tip' | 'utxo' | 'txIndex' | 'orphans'>;

/** Kettenzustand eines Knotens, der nur den Genesis-Block kennt. */
export function initChainState(genesis: Block): ChainState {
  const { utxo, txIndex } = replayChain({ [genesis.hash]: genesis }, genesis.hash);
  return {
    mempool: {},
    blocks: { [genesis.hash]: genesis },
    work: { [genesis.hash]: genesis.difficulty },
    tip: genesis.hash,
    utxo,
    txIndex,
    orphans: {},
  };
}

/** Kopie des Kettenzustands (Blöcke werden geteilt, sie sind unveränderlich). */
export function copyChainState(src: ChainState): ChainState {
  return {
    mempool: { ...src.mempool },
    blocks: { ...src.blocks },
    work: { ...src.work },
    tip: src.tip,
    utxo: { ...src.utxo },
    txIndex: { ...src.txIndex },
    orphans: {},
  };
}

/** Hashes von Genesis bis `tip`. */
export function chainHashes(blocks: Record<string, Block>, tip: string): string[] {
  const out: string[] = [];
  let cur: Block | undefined = blocks[tip];
  while (cur) {
    out.push(cur.hash);
    if (cur.height === 0) break;
    cur = blocks[cur.prevHash];
  }
  return out.reverse();
}

/** Beste Kette eines Knotens von Genesis bis zum Tip. */
export function bestChain(node: ChainNode): Block[] {
  return chainHashes(node.blocks, node.tip).map((h) => node.blocks[h]!);
}

/** Baut UTXO-Menge und Tx-Index ab Genesis bis `tip` neu auf. */
export function replayChain(
  blocks: Record<string, Block>,
  tip: string,
): { utxo: UtxoSet; txIndex: Record<string, string> } {
  const utxo: UtxoSet = {};
  const txIndex: Record<string, string> = {};
  for (const hash of chainHashes(blocks, tip)) {
    for (const tx of blocks[hash]!.txs) {
      applyTx(utxo, tx);
      txIndex[tx.txid] = hash;
    }
  }
  return { utxo, txIndex };
}

/** UTXO-Menge nach Block `hash` (schnell, wenn `hash` der Tip ist). */
export function utxoAfter(node: ChainState, hash: string): UtxoSet {
  return hash === node.tip ? { ...node.utxo } : replayChain(node.blocks, hash).utxo;
}

/**
 * Prüft Block-Inhalt gegen die UTXO-Menge nach seinem Vorgänger. Liefert `null` oder eine
 * deutsche Fehlermeldung. `utxo` wird dabei fortgeschrieben.
 */
export function checkBlockTxs(block: Block, utxo: UtxoSet, params: SimParams): string | null {
  const [coinbase, ...rest] = block.txs;
  if (!coinbase || !isCoinbase(coinbase)) return 'Erste Transaktion ist keine Coinbase';
  if (coinbase.txid !== computeTxid(coinbase)) return 'TxID der Coinbase passt nicht';
  if (rest.length > params.maxTxPerBlock) return `Mehr als ${params.maxTxPerBlock} Transaktionen im Block`;
  for (const o of coinbase.outputs) {
    if (!Number.isSafeInteger(o.value) || o.value < 0) return 'Coinbase-Wert darf nicht negativ sein';
  }
  let fees = 0;
  for (const tx of rest) {
    if (isCoinbase(tx)) return 'Mehr als eine Coinbase im Block';
    const err = validateTx(tx, utxo);
    if (err) return `Transaktion ${tx.txid.slice(0, 6)}… ungültig: ${err}`;
    fees += txFee(tx, utxo);
    applyTx(utxo, tx);
  }
  if (sumOutputs(coinbase) > subsidy(block.height, params) + fees) {
    return 'Coinbase ist größer als Blockbelohnung plus Gebühren';
  }
  applyTx(utxo, coinbase);
  return null;
}

/** Vollständige Blockprüfung. Der Vorgänger muss bekannt sein. */
export function checkBlock(node: ChainState, block: Block, params: SimParams): string | null {
  const parent = node.blocks[block.prevHash];
  if (!parent) return 'Vorgängerblock unbekannt';
  if (block.height !== parent.height + 1) return 'Höhe passt nicht zum Vorgänger';
  if (hashHeader(block.prevHash, block.merkleRoot, block.nonce, block.height) !== block.hash) {
    return 'Blockhash passt nicht zum Inhalt';
  }
  if (hexLeadingZeroBits(block.hash) < params.displayZeroBits) {
    return `Hash hat weniger als ${params.displayZeroBits} führende Nullbits`;
  }
  if (merkleRoot(block.txs.map((t) => t.txid)) !== block.merkleRoot) return 'Merkle-Root stimmt nicht';
  const expected = nextDifficulty(parent, (h) => node.blocks[h], params);
  if (Math.abs(expected - block.difficulty) > 1e-9 * expected) return 'Difficulty stimmt nicht';
  return checkBlockTxs(block, utxoAfter(node, block.prevHash), params);
}

export type ChainUpdate =
  | { kind: 'none' }
  | { kind: 'extend'; dropped: Tx[] }
  | { kind: 'reorg'; discarded: Block[]; dropped: Tx[] };

/** Nimmt einen geprüften Block auf und wechselt die beste Kette, falls er mehr Arbeit hat. */
export function addBlock(node: ChainState, block: Block): ChainUpdate {
  node.blocks[block.hash] = block;
  node.work[block.hash] = (node.work[block.prevHash] ?? 0) + block.difficulty;
  // Gleichstand: der zuerst gesehene Tip bleibt.
  if (node.work[block.hash]! <= node.work[node.tip]!) return { kind: 'none' };
  if (block.prevHash === node.tip) {
    for (const tx of block.txs) {
      applyTx(node.utxo, tx);
      node.txIndex[tx.txid] = block.hash;
      delete node.mempool[tx.txid];
    }
    node.tip = block.hash;
    return { kind: 'extend', dropped: pruneMempool(node) };
  }
  const oldChain = chainHashes(node.blocks, node.tip);
  const newChain = chainHashes(node.blocks, block.hash);
  let fork = 0;
  while (fork < oldChain.length && oldChain[fork] === newChain[fork]) fork++;
  const discarded = oldChain.slice(fork).map((h) => node.blocks[h]!);
  const { utxo, txIndex } = replayChain(node.blocks, block.hash);
  node.utxo = utxo;
  node.txIndex = txIndex;
  node.tip = block.hash;
  // Blockreihenfolge, Eltern vor Kindern: Eine Transaktion darf das Rückgeld einer
  // vorher zurückgelegten ausgeben (wie Bitcoin Core bei einer Reorganisation).
  const candidates = [...discarded.flatMap((b) => b.txs.filter((t) => !isCoinbase(t))), ...Object.values(node.mempool)];
  node.mempool = {};
  const work: UtxoSet = { ...node.utxo };
  const dropped: Tx[] = [];
  for (const tx of candidates) {
    if (node.txIndex[tx.txid] || node.mempool[tx.txid]) continue;
    if (validateTx(tx, work) === null) {
      node.mempool[tx.txid] = tx;
      applyTx(work, tx);
    } else {
      dropped.push(tx);
    }
  }
  return { kind: 'reorg', discarded, dropped };
}

/**
 * UTXO-Menge plus alle Outputs der Transaktionen `txs`, zum Nachschlagen von Beträgen und Gebühren.
 * Nach einer Reorganisation kann der Mempool Ketten enthalten (ein Kind gibt Rückgeld seines Elternteils aus).
 */
export function withPendingOutputs(utxo: UtxoSet, txs: Tx[]): UtxoSet {
  const view: UtxoSet = { ...utxo };
  for (const tx of txs) tx.outputs.forEach((o, vout) => (view[outpointKey(tx.txid, vout)] = o));
  return view;
}

/** Entfernt Mempool-Transaktionen, deren Inputs weder unverbraucht noch Outputs früherer Mempool-Transaktionen sind. */
function pruneMempool(node: ChainState): Tx[] {
  const dropped: Tx[] = [];
  const work: UtxoSet = { ...node.utxo };
  for (const tx of Object.values(node.mempool)) {
    if (tx.inputs.some((i) => !work[outpointKey(i.txid, i.vout)])) {
      delete node.mempool[tx.txid];
      dropped.push(tx);
    } else {
      applyTx(work, tx);
    }
  }
  return dropped;
}

/** Prüft eine Transaktion für den Mempool. `null` = gültig. */
export function checkMempoolTx(node: ChainState, tx: Tx): string | null {
  if (isCoinbase(tx)) return 'Coinbase darf nicht einzeln verschickt werden';
  return validateTx(tx, node.utxo, mempoolSpent(node.mempool));
}

/** Wählt bis zu `max` Mempool-Transaktionen nach Gebühr (absteigend) und prüft sie nacheinander. */
export function selectTransactions(
  candidates: Tx[],
  utxo: UtxoSet,
  max: number,
): { txs: Tx[]; fees: number } {
  const view = withPendingOutputs(utxo, candidates);
  const withFee = candidates
    .map((tx) => ({ tx, fee: txFee(tx, view) }))
    .sort((a, b) => b.fee - a.fee || (a.tx.txid < b.tx.txid ? -1 : 1));
  const work = { ...utxo };
  const txs: Tx[] = [];
  let fees = 0;
  // Mehrere Durchläufe, damit ein Kind nach seinem Elternteil noch Platz findet.
  let rest = withFee.map((c) => c.tx);
  let progress = true;
  while (progress && txs.length < max) {
    progress = false;
    const later: Tx[] = [];
    for (const tx of rest) {
      if (txs.length >= max || validateTx(tx, work) !== null) {
        later.push(tx);
        continue;
      }
      fees += txFee(tx, work);
      applyTx(work, tx);
      txs.push(tx);
      progress = true;
    }
    rest = later;
  }
  return { txs, fees };
}

export interface Balance {
  /** Summe der UTXOs in der besten Kette (Satoshi). */
  confirmed: number;
  /** Änderung durch Mempool-Transaktionen (Satoshi, kann negativ sein). */
  unconfirmed: number;
}

/** Guthaben je Adresse aus Sicht eines Knotens. */
export function balances(node: ChainState): Record<string, Balance> {
  const out: Record<string, Balance> = {};
  const get = (a: string): Balance => (out[a] ??= { confirmed: 0, unconfirmed: 0 });
  for (const o of Object.values(node.utxo)) get(o.address).confirmed += o.value;
  const work: UtxoSet = { ...node.utxo };
  for (const tx of Object.values(node.mempool)) {
    for (const i of tx.inputs) {
      const prev = work[outpointKey(i.txid, i.vout)];
      if (prev) get(prev.address).unconfirmed -= prev.value;
    }
    for (const o of tx.outputs) get(o.address).unconfirmed += o.value;
    applyTx(work, tx);
  }
  return out;
}

/** Anzahl Bestätigungen einer Transaktion in der besten Kette (0 = unbestätigt oder unbekannt). */
export function confirmations(node: ChainState, txid: string): number {
  const hash = node.txIndex[txid];
  if (!hash) return 0;
  return node.blocks[node.tip]!.height - node.blocks[hash]!.height + 1;
}
