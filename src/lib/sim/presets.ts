import type { Link, Point, SimParams } from './types';
import { SATOSHI_PER_BTC } from '../block';

export const DEFAULT_PARAMS: SimParams = {
  difficulty: 360,
  targetBlockTicks: 60,
  retargetInterval: 10,
  halvingInterval: 20,
  initialSubsidy: 50 * SATOSHI_PER_BTC,
  maxTxPerBlock: 5,
  displayZeroBits: 12,
  defaultFee: SATOSHI_PER_BTC / 10,
  attackConfirmations: 2,
  attackGiveUpDeficit: 6,
  logLimit: 500,
};

export type NodeSpec =
  | { id: string; name: string; kind: 'wallet'; pos: Point; via: string; address: string }
  | { id: string; name: string; kind: 'full'; pos: Point }
  | { id: string; name: string; kind: 'miner'; pos: Point; hashrate: number; address?: string; dishonest?: boolean };

export interface PresetSpec {
  name: string;
  params?: Partial<SimParams>;
  /** Anfangsguthaben im Genesis-Block: [Adresse, BTC]. */
  genesis: [string, number][];
  nodes: NodeSpec[];
  /** Verbindungen zwischen Knoten; Wallets werden automatisch mit ihrem `via` verbunden (Latenz 1). */
  links: Link[];
  /** Startet beim Anlegen einen Double Spend (Beträge in BTC). */
  attack?: { attackerId: string; victimId: string; amount: number };
}

export type PresetName = 'normal' | 'fork' | 'attack';

const WALLETS: NodeSpec[] = [
  { id: 'alice', name: 'Alice', kind: 'wallet', pos: { x: 170, y: 110 }, via: 'n1', address: 'alice' },
  { id: 'bob', name: 'Bob', kind: 'wallet', pos: { x: 830, y: 110 }, via: 'n2', address: 'bob' },
  { id: 'carol', name: 'Carol', kind: 'wallet', pos: { x: 250, y: 540 }, via: 'n4', address: 'carol' },
];

const FULL_NODES: NodeSpec[] = [
  { id: 'n1', name: 'Knoten 1', kind: 'full', pos: { x: 350, y: 200 } },
  { id: 'n2', name: 'Knoten 2', kind: 'full', pos: { x: 650, y: 200 } },
  { id: 'n3', name: 'Knoten 3', kind: 'full', pos: { x: 650, y: 420 } },
  { id: 'n4', name: 'Knoten 4', kind: 'full', pos: { x: 350, y: 420 } },
];

/** Ring n1–n2–n3–n4 mit Querverbindung n1–n3, Miner an je zwei Knoten. */
const NORMAL_LINKS: Link[] = [
  { a: 'n1', b: 'n2', latencyTicks: 2 },
  { a: 'n2', b: 'n3', latencyTicks: 2 },
  { a: 'n3', b: 'n4', latencyTicks: 2 },
  { a: 'n4', b: 'n1', latencyTicks: 2 },
  { a: 'n1', b: 'n3', latencyTicks: 3 },
  { a: 'm1', b: 'n1', latencyTicks: 1 },
  { a: 'm1', b: 'n2', latencyTicks: 1 },
  { a: 'm2', b: 'n2', latencyTicks: 1 },
  { a: 'm2', b: 'n3', latencyTicks: 2 },
  { a: 'm3', b: 'n4', latencyTicks: 1 },
  { a: 'm3', b: 'n1', latencyTicks: 2 },
];

const GENESIS: [string, number][] = [
  ['alice', 50],
  ['bob', 20],
  ['carol', 10],
];

export const PRESETS: Record<PresetName, PresetSpec> = {
  normal: {
    name: 'normal',
    params: { difficulty: 6 * 60 },
    genesis: GENESIS,
    nodes: [
      ...WALLETS,
      ...FULL_NODES,
      { id: 'm1', name: 'M1', kind: 'miner', pos: { x: 500, y: 70 }, hashrate: 3 },
      { id: 'm2', name: 'M2', kind: 'miner', pos: { x: 860, y: 320 }, hashrate: 2 },
      { id: 'm3', name: 'M3', kind: 'miner', pos: { x: 140, y: 320 }, hashrate: 1 },
    ],
    links: NORMAL_LINKS,
  },
  fork: {
    name: 'fork',
    params: { difficulty: 6 * 60 },
    genesis: GENESIS,
    nodes: [
      WALLETS[0]!,
      { id: 'bob', name: 'Bob', kind: 'wallet', pos: { x: 830, y: 110 }, via: 'n3', address: 'bob' },
      { id: 'carol', name: 'Carol', kind: 'wallet', pos: { x: 170, y: 540 }, via: 'n2', address: 'carol' },
      { id: 'n1', name: 'Knoten 1', kind: 'full', pos: { x: 300, y: 200 } },
      { id: 'n2', name: 'Knoten 2', kind: 'full', pos: { x: 300, y: 420 } },
      { id: 'n3', name: 'Knoten 3', kind: 'full', pos: { x: 700, y: 200 } },
      { id: 'n4', name: 'Knoten 4', kind: 'full', pos: { x: 700, y: 420 } },
      { id: 'm1', name: 'M1', kind: 'miner', pos: { x: 120, y: 310 }, hashrate: 3 },
      { id: 'm2', name: 'M2', kind: 'miner', pos: { x: 880, y: 310 }, hashrate: 3 },
    ],
    links: [
      // Linke Hälfte
      { a: 'n1', b: 'n2', latencyTicks: 1 },
      { a: 'm1', b: 'n1', latencyTicks: 1 },
      { a: 'm1', b: 'n2', latencyTicks: 1 },
      // Rechte Hälfte
      { a: 'n3', b: 'n4', latencyTicks: 1 },
      { a: 'm2', b: 'n3', latencyTicks: 1 },
      { a: 'm2', b: 'n4', latencyTicks: 1 },
      // Langsame Verbindungen zwischen den Hälften
      { a: 'n1', b: 'n3', latencyTicks: 20 },
      { a: 'n2', b: 'n4', latencyTicks: 20 },
    ],
  },
  attack: {
    name: 'attack',
    params: { difficulty: 10 * 60 },
    genesis: [...GENESIS, ['m3', 30]],
    nodes: [
      ...WALLETS,
      ...FULL_NODES,
      { id: 'm1', name: 'M1', kind: 'miner', pos: { x: 500, y: 70 }, hashrate: 2.5 },
      { id: 'm2', name: 'M2', kind: 'miner', pos: { x: 860, y: 320 }, hashrate: 2 },
      { id: 'm3', name: 'M3', kind: 'miner', pos: { x: 140, y: 320 }, hashrate: 5.5 },
    ],
    links: NORMAL_LINKS,
    attack: { attackerId: 'm3', victimId: 'bob', amount: 10 },
  },
};
