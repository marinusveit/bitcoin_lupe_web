import type { Block, ChainNode, SimEvent, SimNode, Tx, World } from './types';
import { addBlock, checkBlock, checkMempoolTx } from './node';
import { formatBtc, shortHash } from './tx';

/** Ereignis-Sammler eines Aufrufs; alles landet zusätzlich in `world.log`. */
export type Emit = (event: Omit<SimEvent, 'tick'>) => void;

export function makeEmitter(world: World, sink: SimEvent[]): Emit {
  return (event) => {
    const full: SimEvent = { tick: world.tick, ...event };
    sink.push(full);
    world.log.push(full);
    const overflow = world.log.length - world.params.logLimit;
    if (overflow > 0) world.log.splice(0, overflow);
  };
}

export function isChainNode(node: SimNode | undefined): node is ChainNode {
  return node !== undefined && node.kind !== 'wallet';
}

/** Anzeigename in Ereignistexten: „Miner M1“, „Knoten 3“, „Alice“. */
export function label(node: SimNode): string {
  return node.kind === 'miner' ? `Miner ${node.name}` : node.name;
}

export function blockLabel(block: Block): string {
  return `Block ${block.height} (${shortHash(block.hash)})`;
}

export function linkLatency(world: World, a: string, b: string): number {
  const link = world.links.find((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  return link?.latencyTicks ?? 1;
}

export function sendMessage(world: World, kind: 'tx' | 'block', payload: Tx | Block, from: string, to: string): void {
  const base = {
    id: world.nextMessageId++,
    from,
    to,
    sentAt: world.tick,
    arrivesAt: world.tick + Math.max(1, linkLatency(world, from, to)),
  };
  if (kind === 'tx') world.messagesInFlight.push({ ...base, kind, payload: payload as Tx });
  else world.messagesInFlight.push({ ...base, kind, payload: payload as Block });
}

/** Leitet an alle Peers weiter, die Knoten sind (nicht an Wallets), außer dem Absender. */
export function broadcast(world: World, node: ChainNode, kind: 'tx' | 'block', payload: Tx | Block, except?: string): void {
  for (const peer of node.peers) {
    if (peer === except || !isChainNode(world.nodes[peer])) continue;
    sendMessage(world, kind, payload, node.id, peer);
  }
}

/** Beschreibt eine Zahlung für das Protokoll, z. B. „2 BTC an Bob“. */
export function describePayment(world: World, tx: Tx, fromAddress: string): string {
  const parts = tx.outputs
    .filter((o) => o.address !== fromAddress)
    .map((o) => `${formatBtc(o.value)} an ${addressName(world, o.address)}`);
  return parts.length > 0 ? parts.join(', ') : `${formatBtc(tx.outputs[0]?.value ?? 0)} an sich selbst`;
}

/** Klarname einer Adresse (Wallet- oder Minername), sonst die Adresse selbst. */
export function addressName(world: World, address: string): string {
  for (const n of Object.values(world.nodes)) {
    if ((n.kind === 'wallet' || n.kind === 'miner') && n.address === address) return n.name;
  }
  return address;
}

/** Nimmt eine Transaktion entgegen, prüft sie und leitet sie weiter. */
export function receiveTx(world: World, node: ChainNode, tx: Tx, from: string, emit: Emit): boolean {
  if (node.mempool[tx.txid] || node.txIndex[tx.txid]) return false;
  const err = checkMempoolTx(node, tx);
  if (err) {
    emit({ kind: 'tx-rejected', text: `${label(node)} lehnt Transaktion ${shortHash(tx.txid)} ab: ${err}`, nodeId: node.id, txid: tx.txid });
    return false;
  }
  node.mempool[tx.txid] = tx;
  emit({ kind: 'tx-accepted', text: `${label(node)} nimmt Transaktion ${shortHash(tx.txid)} in den Mempool`, nodeId: node.id, txid: tx.txid });
  broadcast(world, node, 'tx', tx, from);
  return true;
}

/**
 * Nimmt einen Block entgegen: prüfen, speichern, ggf. Kette wechseln, weiterleiten.
 * `own` = selbst gefunden (kein Empfangsereignis). Liefert true, wenn neu und gültig.
 */
export function receiveBlock(world: World, node: ChainNode, block: Block, from: string, emit: Emit, own = false): boolean {
  if (node.blocks[block.hash]) return false;
  if (!node.blocks[block.prevHash]) {
    if (!node.orphans[block.hash]) {
      node.orphans[block.hash] = block;
      emit({ kind: 'block-rejected', text: `${label(node)} parkt ${blockLabel(block)}: Vorgängerblock noch unbekannt`, nodeId: node.id, blockHash: block.hash });
    }
    return false;
  }
  const err = checkBlock(node, block, world.params);
  if (err) {
    emit({ kind: 'block-rejected', text: `${label(node)} lehnt ${blockLabel(block)} ab: ${err}`, nodeId: node.id, blockHash: block.hash });
    return false;
  }
  const update = addBlock(node, block);
  if (!own) {
    if (update.kind === 'none') {
      // First-Seen-Regel: bei gleicher Arbeit bleibt der Knoten beim zuerst gesehenen Block.
      const tie = node.work[block.hash] === node.work[node.tip];
      const stays = tie ? 'bleibt beim zuerst gesehenen Block' : 'bleibt bei seiner Kette mit mehr Arbeit';
      emit({ kind: 'block-side', text: `${label(node)} speichert ${blockLabel(block)} als Nebenzweig, ${stays}`, nodeId: node.id, blockHash: block.hash });
    } else {
      const text = update.kind === 'extend' ? `hängt ${blockLabel(block)} an seine Kette` : `übernimmt ${blockLabel(block)}`;
      emit({ kind: 'block-accepted', text: `${label(node)} ${text}`, nodeId: node.id, blockHash: block.hash });
    }
  }
  if (update.kind === 'reorg') {
    const n = update.discarded.length;
    emit({
      kind: 'reorg',
      text: `${label(node)} wechselt auf die Kette mit mehr Arbeit (Reorganisation, ${n} ${n === 1 ? 'Block' : 'Blöcke'} verworfen)`,
      nodeId: node.id,
      blockHash: block.hash,
    });
  }
  if (update.kind !== 'none') {
    const lostCoinbases = new Set(update.kind === 'reorg' ? update.discarded.map((b) => b.txs[0]!.txid) : []);
    const droppedIds = new Set(update.dropped.map((t) => t.txid));
    for (const tx of update.dropped) {
      emit({ kind: 'tx-dropped', text: `${label(node)} verwirft Transaktion ${shortHash(tx.txid)}: ${dropReason(tx, update.kind === 'reorg', lostCoinbases, droppedIds)}`, nodeId: node.id, txid: tx.txid });
    }
  }
  broadcast(world, node, 'block', block, from);
  // Wartende Kinder dieses Blocks nachholen.
  for (const orphan of Object.values(node.orphans)) {
    if (orphan.prevHash === block.hash) {
      delete node.orphans[orphan.hash];
      receiveBlock(world, node, orphan, from, emit);
    }
  }
  return true;
}

/** Grund, warum eine Transaktion nach einem Kettenwechsel nicht mehr gültig ist. */
function dropReason(tx: Tx, reorg: boolean, lostCoinbases: Set<string>, droppedIds: Set<string>): string {
  if (tx.inputs.some((i) => droppedIds.has(i.txid))) return 'Input stammt aus einer ebenfalls verworfenen Transaktion';
  if (!reorg) return 'Coins sind schon ausgegeben';
  if (tx.inputs.some((i) => lostCoinbases.has(i.txid))) {
    return 'Input stammt aus der Coinbase eines verworfenen Blocks (bei Bitcoin wäre sie wegen der 100-Block-Reifefrist noch gar nicht ausgebbar)';
  }
  return 'Coins sind in der neuen Kette schon ausgegeben';
}

/** Stellt alle fälligen Nachrichten in Sende-Reihenfolge zu. */
export function deliverMessages(world: World, emit: Emit): void {
  const due = world.messagesInFlight.filter((m) => m.arrivesAt <= world.tick);
  if (due.length === 0) return;
  world.messagesInFlight = world.messagesInFlight.filter((m) => m.arrivesAt > world.tick);
  due.sort((a, b) => a.arrivesAt - b.arrivesAt || a.id - b.id);
  for (const msg of due) {
    const node = world.nodes[msg.to];
    if (!isChainNode(node)) continue;
    if (msg.kind === 'tx') receiveTx(world, node, msg.payload, msg.from, emit);
    else receiveBlock(world, node, msg.payload, msg.from, emit);
  }
}
