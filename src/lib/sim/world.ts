import type { ChainNode, MinerNode, Point, Result, SimEvent, SimParams, TxOutput, WalletNode, World } from './types';
import { createGenesis, nextDifficulty } from './block';
import { balances as nodeBalances, copyChainState, initChainState, type Balance } from './node';
import { btcToSats, buildPayment, mempoolSpent, outpointKey, parseOutpoint } from './tx';
import { collectEvents, describePayment, isChainNode, label, deliverMessages, sendMessage, withEvents } from './network';
import { mineTick } from './mining';
import { attackInProgress, attackTick, startDoubleSpend } from './attack';
import { createRng } from './rng';
import { DEFAULT_PARAMS, PRESETS, type PresetName, type PresetSpec } from './presets';

/**
 * Outpoints, die eine Wallet gerade nicht ausgeben kann: schon im Mempool ihres Knotens
 * ausgegeben oder in einer eigenen Transaktion, die noch zum Knoten unterwegs ist.
 */
function lockedOutpoints(world: World, walletId: string, via: ChainNode): Set<string> {
  const locked = mempoolSpent(via.mempool);
  for (const m of world.messagesInFlight) {
    if (m.kind === 'tx' && m.from === walletId) for (const i of m.payload.inputs) locked.add(outpointKey(i.txid, i.vout));
  }
  return locked;
}

/**
 * Betrag in Satoshi, den eine Wallet jetzt ausgeben kann: bestätigte UTXOs ihrer Adresse ohne
 * gesperrte Outpoints. Dieselbe Regel prüft `sendTransaction`. `null`, wenn es die Wallet nicht gibt.
 */
export function spendableBalance(world: World, walletId: string): number | null {
  const w = world.nodes[walletId];
  if (!w || w.kind !== 'wallet') return null;
  const via = chainNodeOf(world, w.id);
  if (!via) return null;
  const locked = lockedOutpoints(world, w.id, via);
  let sum = 0;
  for (const [key, o] of Object.entries(via.utxo)) if (o.address === w.address && !locked.has(key)) sum += o.value;
  return sum;
}

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
    nodes: {},
    links: [],
    messagesInFlight: [],
    log: [],
    params,
    rng: createRng(seed),
    attack: null,
    nextMessageId: 0,
    nextMinerNo: 1 + Math.max(0, ...spec.nodes.map((n) => Number(/^m(\d+)$/.exec(n.id)?.[1] ?? 0))),
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
        dishonest: n.dishonest ?? false,
        address: n.address ?? n.id,
        privateChain: [],
        // Unehrliche Miner halten ab Genesis (ihrem Tip) Blöcke zurück.
        privateBase: n.dishonest ? genesis.hash : null,
      };
    }
  }
  for (const l of spec.links) connect(world, l.a, l.b, l.latencyTicks);
  for (const n of Object.values(world.nodes)) {
    if (n.kind === 'wallet' && !n.peers.includes(n.via)) connect(world, n.id, n.via, 1);
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
  world.tick += 1;
  return collectEvents(world, (emit) => {
    deliverMessages(world, emit);
    mineTick(world, emit);
    attackTick(world, emit);
  });
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
  return withEvents(world, (emit): Result<string> => {
    const from = world.nodes[fromWalletId];
    const to = world.nodes[toId];
    if (!from || from.kind !== 'wallet') return { ok: false, error: 'Absender muss eine Wallet sein' };
    if (!to || to.kind === 'full') return { ok: false, error: 'Empfänger muss eine Wallet oder ein Miner sein' };
    if (to.id === from.id) return { ok: false, error: 'Absender und Empfänger sind gleich' };
    const via = chainNodeOf(world, from.id);
    if (!via) return { ok: false, error: `${from.name} ist mit keinem Knoten verbunden` };
    const pay = buildPayment(via.utxo, lockedOutpoints(world, from.id, via), from.address, to.address, amount, fee);
    if (!pay.ok) return { ok: false, error: pay.error };
    emit({ kind: 'tx-created', text: `${from.name} sendet ${describePayment(world, pay.tx, from.address)}`, nodeId: from.id, txid: pay.tx.txid });
    sendMessage(world, 'tx', pay.tx, from.id, via.id);
    return { ok: true, value: pay.tx.txid };
  });
}

export interface AddMinerOptions {
  name?: string;
  hashrate?: number;
  /** Knoten, mit denen der Miner verbunden wird (Standard: zwei Full Nodes mit den wenigsten Peers). */
  peers?: string[];
  latencyTicks?: number;
  pos?: Point;
}

/**
 * Mindestabstand eines neuen Miners zu allen Knoten in Kartenkoordinaten. Die Karte zeichnet Knoten mit
 * Radius 26 und vergrößert sie auf dem Handy bis auf das 1,9-Fache; 100 hält sie auch dort getrennt.
 */
const MIN_NODE_GAP = 100;

/**
 * Platz für einen neuen Miner nahe `center` (Mitte seiner Peers): zuerst 90 Einheiten darüber, sonst der
 * erste Punkt auf Kreisen um die Mitte, der zu allen Knoten mindestens `MIN_NODE_GAP` Abstand hat.
 */
function freeSpot(world: World, center: Point): Point {
  const nodes = Object.values(world.nodes);
  const free = (p: Point) => nodes.every((n) => Math.hypot(n.pos.x - p.x, n.pos.y - p.y) >= MIN_NODE_GAP);
  for (const radius of [90, 150, 210, 270, 330]) {
    for (let k = 0; k < 12; k++) {
      const a = -Math.PI / 2 + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
      const p = { x: Math.round(center.x + radius * Math.cos(a)), y: Math.round(center.y + radius * Math.sin(a)) };
      if (free(p)) return p;
    }
  }
  return { x: center.x, y: center.y - 90 };
}

/** Fügt einen ehrlichen Miner hinzu; er übernimmt die Kette seines ersten Peers. */
export function addMiner(world: World, opts: AddMinerOptions = {}): Result<string> & { events: SimEvent[] } {
  return withEvents(world, (emit): Result<string> => {
    const chainNodes = Object.values(world.nodes).filter(isChainNode);
    const peers =
      opts.peers ??
      chainNodes
        .filter((n) => n.kind === 'full')
        .sort((a, b) => a.peers.length - b.peers.length || (a.id < b.id ? -1 : 1))
        .slice(0, 2)
        .map((n) => n.id);
    const first = peers[0] ? world.nodes[peers[0]] : undefined;
    if (!isChainNode(first)) return { ok: false, error: 'Neuer Miner braucht mindestens einen Knoten als Peer' };
    if (peers.some((p) => !isChainNode(world.nodes[p]))) return { ok: false, error: 'Peers müssen Knoten oder Miner sein' };
    // Fortlaufende Nummer statt erster freier ID: Blöcke und Coins eines entfernten Miners bleiben ihm zugeordnet.
    let i = world.nextMinerNo;
    while (world.nodes[`m${i}`]) i++;
    world.nextMinerNo = i + 1;
    const id = `m${i}`;
    const avg = peers.reduce((s, p) => ({ x: s.x + world.nodes[p]!.pos.x, y: s.y + world.nodes[p]!.pos.y }), { x: 0, y: 0 });
    const miner: MinerNode = {
      id,
      name: opts.name ?? `M${i}`,
      kind: 'miner',
      peers: [],
      pos: opts.pos ?? freeSpot(world, { x: avg.x / peers.length, y: avg.y / peers.length }),
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
    return { ok: true, value: id };
  });
}

/** Entfernt einen Knoten samt Verbindungen und Nachrichten. */
export function removeNode(world: World, id: string): Result & { events: SimEvent[] } {
  return withEvents(world, (emit): Result => {
    const node = world.nodes[id];
    if (!node) return { ok: false, error: 'Knoten nicht gefunden' };
    if (node.kind !== 'wallet') {
      const wallets = Object.values(world.nodes).filter((n): n is WalletNode => n.kind === 'wallet' && n.via === id);
      if (wallets.length > 0) {
        return { ok: false, error: `An ${label(node)} hängen noch Wallets: ${wallets.map((w) => w.name).join(', ')}` };
      }
      if (Object.values(world.nodes).filter(isChainNode).length <= 1) {
        return { ok: false, error: 'Der letzte Knoten kann nicht entfernt werden' };
      }
    }
    delete world.nodes[id];
    world.links = world.links.filter((l) => l.a !== id && l.b !== id);
    world.messagesInFlight = world.messagesInFlight.filter((m) => m.from !== id && m.to !== id);
    for (const n of Object.values(world.nodes)) n.peers = n.peers.filter((p) => p !== id);
    if (attackInProgress(world.attack) && world.attack.attackerId === id) world.attack.status = 'abandoned';
    emit({ kind: 'node-removed', text: `${label(node)} verlässt das Netz`, nodeId: id });
    return { ok: true, value: undefined };
  });
}

export function setHashrate(world: World, minerId: string, hashrate: number): SimEvent[] {
  return collectEvents(world, (emit) => {
    const node = world.nodes[minerId];
    if (!node || node.kind !== 'miner' || !(hashrate >= 0)) return;
    node.hashrate = hashrate;
    emit({ kind: 'config', text: `${label(node)} rechnet jetzt mit Hashrate ${hashrate}`, nodeId: minerId });
  });
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
    .map(([key, o]) => ({ key, ...parseOutpoint(key), value: o.value }));
  return { address: w.address, ...b, utxos };
}

export interface WorldStats {
  height: number;
  /** Difficulty für den nächsten Block auf der besten bekannten Kette. */
  difficulty: number;
  totalHashrate: number;
  /** Mittlerer Abstand der letzten (bis zu 20) Blöcke in Ticks, `null` ohne Blöcke. */
  meanBlockInterval: number | null;
  /** Coins im Umlauf in Satoshi. */
  coinsInCirculation: number;
  mempoolSize: number;
  /** Anzahl verschiedener Tips unter den Knoten (1 = alle einig). */
  distinctTips: number;
  /** Einigkeit der Knoten, siehe `consensus`. */
  consensus: Consensus;
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

/**
 * Einigkeit der Knoten über die Kette:
 * - `agreed`: alle Knoten haben denselben Tip.
 * - `spreading`: Einige Knoten hängen nur hinterher, ihr Tip liegt auf der besten Kette
 *   (ein neuer Block ist unterwegs). `have` Knoten kennen schon den besten Tip.
 * - `fork`: Mindestens ein Knoten hat einen Tip, der nicht auf der besten Kette liegt,
 *   z. B. zwei verschiedene Blöcke auf gleicher Höhe (Gabelung).
 */
export type Consensus =
  | { kind: 'agreed'; total: number }
  | { kind: 'spreading'; have: number; total: number }
  | { kind: 'fork'; have: number; total: number };

export function consensus(world: World): Consensus {
  const ref = referenceNode(world);
  const refTip = ref.blocks[ref.tip]!;
  const nodes = Object.values(world.nodes).filter(isChainNode);
  let have = 0;
  let fork = false;
  for (const n of nodes) {
    if (n.tip === ref.tip) {
      have++;
      continue;
    }
    const h = n.blocks[n.tip]!.height;
    if (h >= refTip.height) {
      fork = true;
      continue;
    }
    let b = refTip;
    while (b.height > h) b = ref.blocks[b.prevHash]!;
    if (b.hash !== n.tip) fork = true;
  }
  if (have === nodes.length) return { kind: 'agreed', total: nodes.length };
  return { kind: fork ? 'fork' : 'spreading', have, total: nodes.length };
}

export function stats(world: World): WorldStats {
  const ref = referenceNode(world);
  const tip = ref.blocks[ref.tip]!;
  let first = tip;
  while (first.height > 0 && tip.height - first.height < 20) first = ref.blocks[first.prevHash]!;
  const nodes = Object.values(world.nodes);
  const chainNodes = nodes.filter(isChainNode);
  return {
    height: tip.height,
    difficulty: nextDifficulty(tip, (h) => ref.blocks[h], world.params),
    totalHashrate: nodes.reduce((s, n) => s + (n.kind === 'miner' ? n.hashrate : 0), 0),
    meanBlockInterval: tip.height > first.height ? (tip.timestampTick - first.timestampTick) / (tip.height - first.height) : null,
    coinsInCirculation: Object.values(ref.utxo).reduce((s, o) => s + o.value, 0),
    mempoolSize: Object.keys(ref.mempool).length,
    distinctTips: new Set(chainNodes.map((n) => n.tip)).size,
    consensus: consensus(world),
  };
}

