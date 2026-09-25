import type { Block, MinerNode, SimEvent, Tx, UtxoSet, World } from './types';
import { assembleBlock, nextDifficulty, subsidy } from './block';
import { selectTransactions, utxoAfter } from './node';
import { applyTx, makeTx, txFee, validateTx } from './tx';
import { blockLabel, label, makeEmitter, receiveBlock, type Emit } from './network';
import { nextRandom } from './rng';

/** Findet einen Block im eigenen Knoten oder in der privaten Kette. */
function lookup(miner: MinerNode): (hash: string) => Block | undefined {
  return (hash) => miner.blocks[hash] ?? miner.privateChain.find((b) => b.hash === hash);
}

/** Ist dieser Miner gerade im privaten Modus (Blöcke zurückhalten)? */
export function minesPrivately(miner: MinerNode): boolean {
  return miner.dishonest && miner.privateBase !== null;
}

/** Block, auf den der Miner als Nächstes aufbaut. */
export function miningParent(miner: MinerNode): Block {
  if (minesPrivately(miner)) {
    return miner.privateChain.at(-1) ?? miner.blocks[miner.privateBase!]!;
  }
  return miner.blocks[miner.tip]!;
}

/** Difficulty für den nächsten Block des Miners. */
export function minerDifficulty(world: World, miner: MinerNode): number {
  return nextDifficulty(miningParent(miner), lookup(miner), world.params);
}

function privateUtxo(miner: MinerNode): UtxoSet {
  const utxo = utxoAfter(miner, miner.privateBase!);
  for (const b of miner.privateChain) for (const tx of b.txs) applyTx(utxo, tx);
  return utxo;
}

/** Baut, löst und verbreitet (oder hält zurück) einen neuen Block des Miners. */
export function produceBlock(world: World, miner: MinerNode, emit: Emit): Block {
  const isPrivate = minesPrivately(miner);
  const parent = miningParent(miner);
  const utxo = isPrivate ? privateUtxo(miner) : { ...miner.utxo };
  const max = world.params.maxTxPerBlock;
  const chosen: Tx[] = [];
  let fees = 0;
  const attack = world.attack;
  let candidates = Object.values(miner.mempool);
  if (isPrivate && attack && attack.attackerId === miner.id && attack.status === 'running') {
    candidates = candidates.filter((t) => t.txid !== attack.publicTx.txid);
    const pending = !miner.privateChain.some((b) => b.txs.some((t) => t.txid === attack.privateTx.txid));
    if (pending && validateTx(attack.privateTx, utxo) === null) {
      fees += txFee(attack.privateTx, utxo);
      applyTx(utxo, attack.privateTx);
      chosen.push(attack.privateTx);
    }
  }
  const sel = selectTransactions(candidates, utxo, max - chosen.length);
  chosen.push(...sel.txs);
  fees += sel.fees;
  const height = parent.height + 1;
  const difficulty = nextDifficulty(parent, lookup(miner), world.params);
  const coinbase = makeTx(
    [],
    [{ value: subsidy(height, world.params) + fees, address: miner.address }],
    `${miner.id}@${height}/${parent.hash.slice(0, 16)}`,
  );
  const block = assembleBlock({
    height,
    prevHash: parent.hash,
    txs: [coinbase, ...chosen],
    minerId: miner.id,
    timestampTick: world.tick,
    difficulty,
    zeroBits: world.params.displayZeroBits,
  });
  if (difficulty !== parent.difficulty) {
    emit({
      kind: 'retarget',
      text: `Difficulty-Anpassung ab Block ${height}: ${formatDifficulty(parent.difficulty, world.params.difficulty)} → ${formatDifficulty(difficulty, world.params.difficulty)}`,
      nodeId: miner.id,
      blockHash: block.hash,
    });
  }
  if (isPrivate) {
    miner.privateChain.push(block);
    emit({ kind: 'block-found-private', text: `${label(miner)} findet heimlich ${blockLabel(block)} und hält ihn zurück`, nodeId: miner.id, blockHash: block.hash });
  } else {
    emit({ kind: 'block-found', text: `${label(miner)} findet ${blockLabel(block)}`, nodeId: miner.id, blockHash: block.hash });
    receiveBlock(world, miner, block, miner.id, emit, true);
  }
  return block;
}

/**
 * Difficulty relativ zum Start (Genesis = 1), wie Kapitel 6 sie definiert. Intern ist die
 * Difficulty die erwartete Rechenarbeit je Block (Fundchance je Tick = Hashrate / Difficulty).
 */
export function formatDifficulty(d: number, start: number): string {
  return (d / start).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/** Ein Tick Mining: je Miner ein Bernoulli-Versuch mit p = hashrate / difficulty. */
export function mineTick(world: World, emit: Emit): void {
  for (const node of Object.values(world.nodes)) {
    if (node.kind !== 'miner') continue;
    const r = nextRandom(world.rng);
    if (node.hashrate <= 0) continue;
    if (minesPrivately(node) && node.privateChain.length === 0 && !(world.attack?.attackerId === node.id && world.attack.status === 'running')) {
      node.privateBase = node.tip;
    }
    const p = node.hashrate / minerDifficulty(world, node);
    if (r < p) produceBlock(world, node, emit);
  }
}

/** Test- und Lehr-Hook: Miner findet sofort (im aktuellen Tick) einen Block. */
export function forceBlock(world: World, minerId: string): SimEvent[] {
  const miner = world.nodes[minerId];
  if (!miner || miner.kind !== 'miner') throw new Error(`Kein Miner mit ID ${minerId}`);
  const events: SimEvent[] = [];
  produceBlock(world, miner, makeEmitter(world, events));
  return events;
}
