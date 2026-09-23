import type { ChainNode, MinerNode, Point, Result, SimEvent, SimParams, TxOutput, WalletNode, World } from './types';
import { createGenesis, nextDifficulty } from './block';
import { balances as nodeBalances, copyChainState, initChainState, type Balance } from './node';
import { btcToSats, buildPayment, mempoolSpent, outpointKey } from './tx';
import { describePayment, isChainNode, label, makeEmitter, deliverMessages, sendMessage } from './network';
import { mineTick } from './mining';
import { attackTick, startDoubleSpend } from './attack';
import { createRng } from './rng';
import { DEFAULT_PARAMS, PRESETS, type PresetName, type PresetSpec } from './presets';

/** Legt eine Welt aus einem Preset (Name oder eigene Beschreibung) an. */
export function createWorld(preset: PresetName | PresetSpec, seed = 1, overrides: Partial<SimParams> = {}): World {
  const spec = typeof preset === 'string' ? PRESETS[preset] : preset;
  const params: SimParams = { ...DEFAULT_PARAMS, ...spec.params, ...overrides };
  const genesis = createGenesis(
    spec.genesis.map(([address, btc]) => [address, btcToSats(btc)]),
    params,
  );
  const world: World = {
    tick: 0,
    seed,
    preset: spec.name,
    nodes: {},
    links: [],
    messagesInFlight: [],
    log: [],
    params,
    rng: createRng(seed),
    attack: null,
    nextMessageId: 0,
    genesisHash: genesis.hash,
  };
  for (const n of spec.nodes) {
    const base = { id: n.id, name: n.name, peers: [] as string[], pos: { ...n.pos } };
    if (n.kind === 'wallet') {
      world.nodes[n.id] = { ...base, kind: 'wallet', via: n.via, address: n.address };
    } else if (n.kind === 'full') {
      world.nodes[n.id] = { ...base, kind: 'full', ...initChainState(genesis) };
    } else {
      world.nodes[n.id] = {
        ...base,
        kind: 'miner',
        ...initChainState(genesis),
        hashrate: n.hashrate,
        dishonest: false,
        address: n.address ?? n.id,
        privateChain: [],
        privateBase: null,
      };
    }
  }
  for (const l of spec.links) connect(world, l.a, l.b, l.latencyTicks);
  for (const n of Object.values(world.nodes)) {
    if (n.kind === 'wallet' && !n.peers.includes(n.via)) connect(world, n.id, n.via, 1);
  }
  for (const n of spec.nodes) {
    if (n.kind === 'miner' && n.dishonest) {
      const m = world.nodes[n.id] as MinerNode;
      m.dishonest = true;
      m.privateBase = m.tip;
    }
  }
  if (spec.attack) {
    const res = startDoubleSpend(world, spec.attack.attackerId, spec.attack.victimId, btcToSats(spec.attack.amount));
    if (!res.ok) throw new Error(`Preset ${spec.name}: ${res.error}`);
  }
  return world;
}

function connect(world: World, a: string, b: string, latencyTicks: number): void {
  const na = world.nodes[a];
  const nb = world.nodes[b];
  if (!na || !nb) throw new Error(`Verbindung ${a}–${b}: Knoten fehlt`);
  world.links.push({ a, b, latencyTicks });
  if (!na.peers.includes(b)) na.peers.push(b);
  if (!nb.peers.includes(a)) nb.peers.push(a);
}

/** Ein Tick: Nachrichten zustellen, minen, Angreifer-Logik. Mutiert `world`, liefert die Ereignisse. */
export function step(world: World): SimEvent[] {
  const events: SimEvent[] = [];
  world.tick += 1;
  const emit = makeEmitter(world, events);
  deliverMessages(world, emit);
  mineTick(world, emit);
  attackTick(world, emit);
  return events;
}

/** Knoten, dessen Kettenansicht eine Wallet nutzt (bei Knoten: er selbst). */
export function chainNodeOf(world: World, id: string): ChainNode | null {
  const n = world.nodes[id];
  if (!n) return null;
  if (n.kind === 'wallet') {
    const via = world.nodes[n.via];
    return isChainNode(via) ? via : null;
  }
  return n;
}

/**
 * Wallet `fromWalletId` zahlt `amount` Satoshi an die Adresse von `toId` (Wallet oder Miner).
 * Die Transaktion geht zuerst an den Knoten der Wallet.
 */
export function sendTransaction(
  world: World,
  fromWalletId: string,
  toId: string,
  amount: number,
  fee = world.params.defaultFee,
): Result<string> & { events: SimEvent[] } {
  const events: SimEvent[] = [];
  const emit = makeEmitter(world, events);
  const from = world.nodes[fromWalletId];
  const to = world.nodes[toId];
  if (!from || from.kind !== 'wallet') return { ok: false, error: 'Absender muss eine Wallet sein', events };
  if (!to || to.kind === 'full') return { ok: false, error: 'Empfänger muss eine Wallet oder ein Miner sein', events };
  if (to.id === from.id) return { ok: false, error: 'Absender und Empfänger sind gleich', events };
  const via = chainNodeOf(world, from.id);
  if (!via) return { ok: false, error: `${from.name} ist mit keinem Knoten verbunden`, events };
  const locked = mempoolSpent(via.mempool);
  for (const m of world.messagesInFlight) {
    if (m.kind === 'tx' && m.from === from.id) for (const i of m.payload.inputs) locked.add(outpointKey(i.txid, i.vout));
  }
  const pay = buildPayment(via.utxo, locked, from.address, to.address, amount, fee);
  if (!pay.ok) return { ok: false, error: pay.error, events };
  emit({ kind: 'tx-created', text: `${from.name} sendet ${describePayment(world, pay.tx, from.address)}`, nodeId: from.id, txid: pay.tx.txid });
  sendMessage(world, 'tx', pay.tx, from.id, via.id);
  return { ok: true, value: pay.tx.txid, events };
}

export interface AddMinerOptions {
  name?: string;
  hashrate?: number;
  /** Knoten, mit denen der Miner verbunden wird (Standard: zwei Full Nodes mit den wenigsten Peers). */
  peers?: string[];
  latencyTicks?: number;
  pos?: Point;
}

/** Fügt einen ehrlichen Miner hinzu; er übernimmt die Kette seines ersten Peers. */
export function addMiner(world: World, opts: AddMinerOptions = {}): Result<string> & { events: SimEvent[] } {
  const events: SimEvent[] = [];
  const emit = makeEmitter(world, events);
  const chainNodes = Object.values(world.nodes).filter(isChainNode);
  const peers =
    opts.peers ??
    chainNodes
      .filter((n) => n.kind === 'full')
      .sort((a, b) => a.peers.length - b.peers.length || (a.id < b.id ? -1 : 1))
      .slice(0, 2)
      .map((n) => n.id);
  const first = peers[0] ? world.nodes[peers[0]] : undefined;
  if (!isChainNode(first)) return { ok: false, error: 'Neuer Miner braucht mindestens einen Knoten als Peer', events };
  if (peers.some((p) => !isChainNode(world.nodes[p]))) return { ok: false, error: 'Peers müssen Knoten oder Miner sein', events };
  let i = 1;
  while (world.nodes[`m${i}`]) i++;
  const id = `m${i}`;
  const avg = peers.reduce((s, p) => ({ x: s.x + world.nodes[p]!.pos.x, y: s.y + world.nodes[p]!.pos.y }), { x: 0, y: 0 });
  const miner: MinerNode = {
    id,
    name: opts.name ?? `M${i}`,
    kind: 'miner',
    peers: [],
    pos: opts.pos ?? { x: avg.x / peers.length, y: avg.y / peers.length - 90 },
    ...copyChainState(first),
    hashrate: opts.hashrate ?? 1,
    dishonest: false,
    address: id,
    privateChain: [],
    privateBase: null,
  };
  world.nodes[id] = miner;
  for (const p of peers) connect(world, id, p, opts.latencyTicks ?? 1);
  emit({ kind: 'node-added', text: `${label(miner)} kommt mit Hashrate ${miner.hashrate} dazu`, nodeId: id });
  return { ok: true, value: id, events };
}

/** Entfernt einen Knoten samt Verbindungen und Nachrichten. */
export function removeNode(world: World, id: string): Result & { events: SimEvent[] } {
  const events: SimEvent[] = [];
  const emit = makeEmitter(world, events);
  const node = world.nodes[id];
  if (!node) return { ok: false, error: 'Knoten nicht gefunden', events };
  if (node.kind !== 'wallet') {
    const wallets = Object.values(world.nodes).filter((n): n is WalletNode => n.kind === 'wallet' && n.via === id);
    if (wallets.length > 0) {
      return { ok: false, error: `An ${label(node)} hängen noch Wallets: ${wallets.map((w) => w.name).join(', ')}`, events };
    }
    if (Object.values(world.nodes).filter(isChainNode).length <= 1) {
      return { ok: false, error: 'Der letzte Knoten kann nicht entfernt werden', events };
    }
  }
  delete world.nodes[id];
  world.links = world.links.filter((l) => l.a !== id && l.b !== id);
  world.messagesInFlight = world.messagesInFlight.filter((m) => m.from !== id && m.to !== id);
  for (const n of Object.values(world.nodes)) n.peers = n.peers.filter((p) => p !== id);
  if (world.attack?.attackerId === id && (world.attack.status === 'running' || world.attack.status === 'released')) {
    world.attack.status = 'abandoned';
  }
  emit({ kind: 'node-removed', text: `${label(node)} verlässt das Netz`, nodeId: id });
  return { ok: true, value: undefined, events };
}

export function setHashrate(world: World, minerId: string, hashrate: number): SimEvent[] {
  const events: SimEvent[] = [];
  const node = world.nodes[minerId];
  if (!node || node.kind !== 'miner' || !(hashrate >= 0)) return events;
  node.hashrate = hashrate;
  makeEmitter(world, events)({ kind: 'config', text: `${label(node)} rechnet jetzt mit Hashrate ${hashrate}`, nodeId: minerId });
  return events;
}

export interface WalletView extends Balance {
  address: string;
  /** Bestätigte UTXOs der Wallet in der besten Kette ihres Knotens. */
  utxos: { key: string; txid: string; vout: number; value: number }[];
}

/** Guthaben einer Wallet aus Sicht ihres Knotens. */
export function walletBalance(world: World, walletId: string): WalletView | null {
  const w = world.nodes[walletId];
  if (!w || (w.kind !== 'wallet' && w.kind !== 'miner')) return null;
  const node = chainNodeOf(world, walletId);
  if (!node) return null;
  const b = nodeBalances(node)[w.address] ?? { confirmed: 0, unconfirmed: 0 };
  const utxos = Object.entries(node.utxo)
    .filter(([, o]: [string, TxOutput]) => o.address === w.address)
    .map(([key, o]) => {
      const sep = key.lastIndexOf(':');
      return { key, txid: key.slice(0, sep), vout: Number(key.slice(sep + 1)), value: o.value };
    });
  return { address: w.address, ...b, utxos };
}

export interface WorldStats {
  tick: number;
  height: number;
  /** Difficulty für den nächsten Block auf der besten bekannten Kette. */
  difficulty: number;
  totalHashrate: number;
  /** Mittlerer Abstand der letzten (bis zu 20) Blöcke in Ticks, `null` ohne Blöcke. */
  meanBlockInterval: number | null;
  /** Coins im Umlauf in Satoshi. */
  coinsInCirculation: number;
  mempoolSize: number;
  messagesInFlight: number;
  /** Anzahl verschiedener Tips unter den Knoten (1 = alle einig). */
  distinctTips: number;
  referenceNodeId: string;
}

/** Knoten mit der meisten kumulierten Arbeit (bei Gleichstand der erste). */
export function referenceNode(world: World): ChainNode {
  let best: ChainNode | null = null;
  for (const n of Object.values(world.nodes)) {
    if (!isChainNode(n)) continue;
    if (!best || n.work[n.tip]! > best.work[best.tip]!) best = n;
  }
  if (!best) throw new Error('Welt ohne Knoten');
  return best;
}

export function stats(world: World): WorldStats {
  const ref = referenceNode(world);
  const tip = ref.blocks[ref.tip]!;
  let first = tip;
  while (first.height > 0 && tip.height - first.height < 20) first = ref.blocks[first.prevHash]!;
  const nodes = Object.values(world.nodes);
  const chainNodes = nodes.filter(isChainNode);
  return {
    tick: world.tick,
    height: tip.height,
    difficulty: nextDifficulty(tip, (h) => ref.blocks[h], world.params),
    totalHashrate: nodes.reduce((s, n) => s + (n.kind === 'miner' ? n.hashrate : 0), 0),
    meanBlockInterval: tip.height > first.height ? (tip.timestampTick - first.timestampTick) / (tip.height - first.height) : null,
    coinsInCirculation: Object.values(ref.utxo).reduce((s, o) => s + o.value, 0),
    mempoolSize: Object.keys(ref.mempool).length,
    messagesInFlight: world.messagesInFlight.length,
    distinctTips: new Set(chainNodes.map((n) => n.tip)).size,
    referenceNodeId: ref.id,
  };
}

