/**
 * Datentypen des Netzwerk-Simulators. Alles sind reine Datenobjekte (keine Klassen,
 * keine Closures, keine Map/Set), damit Svelte 5 den Zustand mit `$state` beobachten
 * und `structuredClone` ihn kopieren kann. Beträge sind ganze Satoshi (1 BTC = 1e8 sat).
 */

export type NodeKind = 'wallet' | 'full' | 'miner';

export interface Point {
  x: number;
  y: number;
}

export interface TxInput {
  txid: string;
  vout: number;
}

export interface TxOutput {
  /** Betrag in Satoshi. */
  value: number;
  address: string;
}

export interface Tx {
  txid: string;
  inputs: TxInput[];
  outputs: TxOutput[];
  /** Nur bei Coinbase und Genesis-Zuteilung gesetzt; macht die TxID eindeutig. */
  coinbase?: string;
}

export interface Block {
  height: number;
  prevHash: string;
  txs: Tx[];
  merkleRoot: string;
  nonce: number;
  minerId: string;
  timestampTick: number;
  /** Mining-Difficulty, unter der der Block entstand; zugleich seine „Arbeit“. */
  difficulty: number;
  hash: string;
}

/** Eintrag der UTXO-Menge, Schlüssel ist `txid:vout`. */
export type UtxoSet = Record<string, TxOutput>;

interface NodeBase {
  id: string;
  name: string;
  kind: NodeKind;
  peers: string[];
  pos: Point;
}

export interface WalletNode extends NodeBase {
  kind: 'wallet';
  /** Knoten, an dem die Wallet hängt. */
  via: string;
  address: string;
}

export interface FullNode extends NodeBase {
  kind: 'full';
  mempool: Record<string, Tx>;
  blocks: Record<string, Block>;
  /** Kumulierte Arbeit bis einschließlich Block. */
  work: Record<string, number>;
  tip: string;
  /** UTXO-Menge der besten Kette. */
  utxo: UtxoSet;
  /** TxID → Blockhash für alle Transaktionen der besten Kette. */
  txIndex: Record<string, string>;
  /** Blöcke, deren Vorgänger noch fehlt. */
  orphans: Record<string, Block>;
}

export interface MinerNode extends Omit<FullNode, 'kind'> {
  kind: 'miner';
  hashrate: number;
  dishonest: boolean;
  address: string;
  /** Zurückgehaltene Blöcke eines unehrlichen Miners, älteste zuerst. */
  privateChain: Block[];
  /** Block der öffentlichen Kette, auf dem die private Kette aufsetzt. */
  privateBase: string | null;
}

export type ChainNode = FullNode | MinerNode;
export type SimNode = WalletNode | ChainNode;

export interface Link {
  a: string;
  b: string;
  latencyTicks: number;
}

export type Message =
  | { id: number; kind: 'tx'; payload: Tx; from: string; to: string; sentAt: number; arrivesAt: number }
  | { id: number; kind: 'block'; payload: Block; from: string; to: string; sentAt: number; arrivesAt: number };

export type EventKind =
  | 'tx-created'
  | 'tx-accepted'
  | 'tx-rejected'
  | 'tx-dropped'
  | 'block-found'
  | 'block-found-private'
  | 'block-accepted'
  | 'block-rejected'
  | 'reorg'
  | 'retarget'
  | 'attack-start'
  | 'attack-lead'
  | 'attack-release'
  | 'attack-success'
  | 'attack-abandoned'
  | 'attack-failed'
  | 'node-added'
  | 'node-removed'
  | 'config';

export interface SimEvent {
  tick: number;
  kind: EventKind;
  text: string;
  nodeId?: string;
  txid?: string;
  blockHash?: string;
}

export interface SimParams {
  /** Start-Difficulty: Fundwahrscheinlichkeit je Tick = hashrate / difficulty. */
  difficulty: number;
  targetBlockTicks: number;
  retargetInterval: number;
  halvingInterval: number;
  /** Anfangs-Subsidy in Satoshi. */
  initialSubsidy: number;
  /** Höchstzahl normaler Transaktionen je Block (ohne Coinbase). */
  maxTxPerBlock: number;
  /** Führende Nullbits, die ein Blockhash zur Anzeige erfüllen muss. */
  displayZeroBits: number;
  /** Standardgebühr in Satoshi. */
  defaultFee: number;
  /** Bestätigungen der Opfer-Transaktion, bevor der Angreifer veröffentlicht. */
  attackConfirmations: number;
  /** Rückstand in Blöcken, ab dem ein Angreifer aufgibt. */
  attackGiveUpDeficit: number;
  /** Maximale Länge von `world.log`. */
  logLimit: number;
}

export interface RngState {
  state: number;
}

export type AttackStatus = 'running' | 'released' | 'succeeded' | 'failed' | 'abandoned';

export interface AttackState {
  attackerId: string;
  victimId: string;
  amount: number;
  /** Öffentliche Zahlung Angreifer → Opfer. */
  publicTx: Tx;
  /** Geheime Zahlung Angreifer → Angreifer (gibt dieselben Coins aus). */
  privateTx: Tx;
  /** Vorsprung der privaten Kette in Blöcken (negativ = Rückstand). */
  z: number;
  status: AttackStatus;
  startedAt: number;
}

export interface World {
  tick: number;
  seed: number;
  preset: string;
  nodes: Record<string, SimNode>;
  links: Link[];
  messagesInFlight: Message[];
  log: SimEvent[];
  params: SimParams;
  rng: RngState;
  attack: AttackState | null;
  nextMessageId: number;
  genesisHash: string;
}

export type Result<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
