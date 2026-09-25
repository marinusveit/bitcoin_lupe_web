import { describe, expect, it } from 'vitest';
import type { MinerNode, World } from './types';
import { PRESETS, type PresetSpec } from './presets';
import {
  addMiner,
  bestChain,
  btcToSats,
  chainNodeOf,
  confirmations,
  consensus,
  createWorld,
  forceBlock,
  isChainNode,
  removeNode,
  sendTransaction,
  setHashrate,
  spendableBalance,
  startDishonestAttack,
  startDoubleSpend,
  stats,
  step,
  subsidy,
  walletBalance,
} from './index';
import { hexLeadingZeroBits } from './block';

const NO_MINING = { difficulty: 1e12 };

function chainNodes(world: World) {
  return Object.values(world.nodes).filter(isChainNode);
}

function run(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(world);
}

function runUntil(world: World, done: () => boolean, maxTicks: number): void {
  for (let i = 0; i < maxTicks && !done(); i++) step(world);
}

/** Ein Miner an einem Full Node, sonst nichts. */
function soloPreset(hashrate: number, params: PresetSpec['params']): PresetSpec {
  return {
    name: 'solo',
    params,
    genesis: [['alice', 50]],
    nodes: [
      { id: 'n1', name: 'Knoten 1', kind: 'full', pos: { x: 0, y: 0 } },
      { id: 'm1', name: 'M1', kind: 'miner', pos: { x: 1, y: 0 }, hashrate },
    ],
    links: [{ a: 'm1', b: 'n1', latencyTicks: 1 }],
  };
}

describe('Genesis', () => {
  it('gibt Alice 50, Bob 20 und Carol 10 BTC auf jedem Knoten', () => {
    const world = createWorld('normal', 1);
    for (const node of chainNodes(world)) {
      const chain = bestChain(node);
      expect(chain).toHaveLength(1);
      const byAddress = Object.values(node.utxo).reduce<Record<string, number>>((acc, o) => {
        acc[o.address] = (acc[o.address] ?? 0) + o.value;
        return acc;
      }, {});
      expect(byAddress).toEqual({ alice: btcToSats(50), bob: btcToSats(20), carol: btcToSats(10) });
    }
    expect(walletBalance(world, 'alice')).toMatchObject({ confirmed: btcToSats(50), unconfirmed: 0 });
    expect(hexLeadingZeroBits(world.genesisHash)).toBeGreaterThanOrEqual(12);
  });
});

describe('Transaktionen', () => {
  it('verbreitet Alice → Bob 5 BTC in jeden Mempool genau einmal, Bob unbestätigt +5', () => {
    const world = createWorld('normal', 1, NO_MINING);
    const res = sendTransaction(world, 'alice', 'bob', btcToSats(5));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.events[0]!.text).toBe('Alice sendet 5 BTC an Bob');
    run(world, 30);
    for (const node of chainNodes(world)) {
      expect(Object.keys(node.mempool)).toEqual([res.value]);
    }
    const accepted = world.log.filter((e) => e.kind === 'tx-accepted' && e.txid === res.value);
    expect(accepted).toHaveLength(chainNodes(world).length);
    expect(walletBalance(world, 'bob')).toMatchObject({ confirmed: btcToSats(20), unconfirmed: btcToSats(5) });
    const fee = world.params.defaultFee;
    expect(walletBalance(world, 'alice')).toMatchObject({ confirmed: btcToSats(50), unconfirmed: -btcToSats(5) - fee });
  });

  it('lehnt eine zweite Zahlung ab, solange das Guthaben unbestätigt ist', () => {
    const world = createWorld('normal', 1, NO_MINING);
    expect(sendTransaction(world, 'carol', 'bob', btcToSats(8)).ok).toBe(true);
    const second = sendTransaction(world, 'carol', 'bob', btcToSats(1));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/Guthaben reicht nicht/);
  });

  it('verfügbarer Betrag zählt gesperrte UTXOs nicht mit, bis das Rückgeld bestätigt ist', () => {
    const world = createWorld('normal', 3, NO_MINING);
    expect(spendableBalance(world, 'alice')).toBe(btcToSats(50));
    expect(sendTransaction(world, 'alice', 'bob', btcToSats(2)).ok).toBe(true);
    expect(spendableBalance(world, 'alice')).toBe(0);
    run(world, 10);
    expect(spendableBalance(world, 'alice')).toBe(0);
    expect(sendTransaction(world, 'alice', 'bob', btcToSats(1)).ok).toBe(false);
    forceBlock(world, 'm1');
    run(world, 10);
    const change = btcToSats(48) - world.params.defaultFee;
    expect(spendableBalance(world, 'alice')).toBe(change);
    expect(sendTransaction(world, 'alice', 'bob', btcToSats(1)).ok).toBe(true);
  });

  it('bestätigt eine Transaktion in einem Block und zahlt die Gebühr an den Miner', () => {
    const world = createWorld('normal', 3, NO_MINING);
    const res = sendTransaction(world, 'alice', 'bob', btcToSats(5));
    if (!res.ok) throw new Error(res.error);
    run(world, 10);
    forceBlock(world, 'm1');
    run(world, 10);
    const block = bestChain(chainNodeOf(world, 'bob')!).at(-1)!;
    expect(block.txs.map((t) => t.txid)).toContain(res.value);
    expect(block.txs[0]!.outputs[0]!.value).toBe(subsidy(1, world.params) + world.params.defaultFee);
    expect(walletBalance(world, 'bob')).toMatchObject({ confirmed: btcToSats(25), unconfirmed: 0 });
    for (const node of chainNodes(world)) {
      expect(node.mempool).toEqual({});
      expect(confirmations(node, res.value)).toBe(1);
    }
  });
});

describe('Mining', () => {
  it('ein Miner erreicht in 500 Ticks mindestens Höhe 3, Coinbase-Guthaben = Summe der Subsidies', () => {
    const world = createWorld(soloPreset(1, { difficulty: 20 }), 7);
    run(world, 500);
    const miner = world.nodes.m1 as MinerNode;
    const tip = miner.blocks[miner.tip]!;
    expect(tip.height).toBeGreaterThanOrEqual(3);
    let expected = 0;
    for (let h = 1; h <= tip.height; h++) expected += subsidy(h, world.params);
    expect(walletBalance(world, 'm1')!.confirmed).toBe(expected);
    for (const b of bestChain(miner)) expect(hexLeadingZeroBits(b.hash)).toBeGreaterThanOrEqual(12);
  });

  it('Halving: Coinbase in Block 19 = 50 BTC, in Block 20 = 25 BTC', () => {
    const world = createWorld(soloPreset(1, { difficulty: 5, displayZeroBits: 8 }), 5);
    const miner = world.nodes.m1 as MinerNode;
    runUntil(world, () => miner.blocks[miner.tip]!.height >= 20, 5000);
    const chain = bestChain(miner);
    expect(chain[19]!.txs[0]!.outputs[0]!.value).toBe(btcToSats(50));
    expect(chain[20]!.txs[0]!.outputs[0]!.value).toBe(btcToSats(25));
  });

  it('Retarget: Hashrate 6, Ziel 60 Ticks → mittlerer Blockabstand über 200 Blöcke zwischen 40 und 80', () => {
    // Start-Difficulty absichtlich viermal zu leicht, die Anpassung muss das ausgleichen.
    const world = createWorld(soloPreset(6, { difficulty: 90, targetBlockTicks: 60, displayZeroBits: 8 }), 11);
    const miner = world.nodes.m1 as MinerNode;
    runUntil(world, () => miner.blocks[miner.tip]!.height >= 200, 40_000);
    const chain = bestChain(miner);
    expect(chain).toHaveLength(201);
    const mean = chain[200]!.timestampTick / 200;
    expect(mean).toBeGreaterThan(40);
    expect(mean).toBeLessThan(80);
    expect(chain[200]!.difficulty).toBeGreaterThan(90);
    expect(world.log.some((e) => e.kind === 'retarget')).toBe(true);
  });
});

describe('Konsens', () => {
  it('gleichzeitiger Fund: zwei Tipps gleicher Höhe, nach einem weiteren Block ein gemeinsamer Tip', () => {
    const world = createWorld('fork', 1, NO_MINING);
    const a = forceBlock(world, 'm1')[0]!.blockHash!;
    const b = forceBlock(world, 'm2')[0]!.blockHash!;
    run(world, 25);
    const nodes = chainNodes(world);
    for (const node of nodes) {
      expect(node.blocks[a]).toBeDefined();
      expect(node.blocks[b]).toBeDefined();
      expect(node.blocks[node.tip]!.height).toBe(1);
    }
    expect(new Set(nodes.map((n) => n.tip))).toEqual(new Set([a, b]));
    expect(stats(world).distinctTips).toBe(2);

    forceBlock(world, 'm1');
    run(world, 50);
    expect(stats(world).distinctTips).toBe(1);
    for (const node of nodes) {
      expect(node.blocks[node.tip]!.height).toBe(2);
      expect(bestChain(node)[1]!.hash).toBe(a);
    }
    expect(world.log.some((e) => e.kind === 'reorg' && /1 Block verworfen/.test(e.text))).toBe(true);
  });

  it('Reorganisation legt Transaktionen verworfener Blöcke zurück in den Mempool', () => {
    const world = createWorld('fork', 2, NO_MINING);
    const res = sendTransaction(world, 'alice', 'carol', btcToSats(3));
    if (!res.ok) throw new Error(res.error);
    run(world, 3);
    const left = forceBlock(world, 'm1')[0]!.blockHash!;
    expect((world.nodes.m1 as MinerNode).blocks[left]!.txs.map((t) => t.txid)).toContain(res.value);
    forceBlock(world, 'm2');
    forceBlock(world, 'm2');
    run(world, 60);
    const n1 = world.nodes.n1 as MinerNode;
    expect(n1.blocks[n1.tip]!.height).toBe(2);
    expect(n1.txIndex[res.value]).toBeUndefined();
    expect(n1.mempool[res.value]).toBeDefined();
    expect(walletBalance(world, 'carol')).toMatchObject({ confirmed: btcToSats(10), unconfirmed: btcToSats(3) });
  });

  it('Reorganisation behält eine Zahlung aus unbestätigtem Rückgeld einer verworfenen Transaktion', () => {
    const world = createWorld('fork', 2, NO_MINING);
    const first = sendTransaction(world, 'alice', 'bob', btcToSats(5));
    if (!first.ok) throw new Error(first.error);
    run(world, 3);
    forceBlock(world, 'm1');
    run(world, 2);
    const second = sendTransaction(world, 'alice', 'carol', btcToSats(1));
    if (!second.ok) throw new Error(second.error);
    run(world, 3);
    const n1 = world.nodes.n1 as MinerNode;
    const top = forceBlock(world, 'm1')[0]!.blockHash!;
    const m1 = world.nodes.m1 as MinerNode;
    expect(confirmations(m1, first.value)).toBe(2);
    expect(confirmations(m1, second.value)).toBe(1);
    // Konkurrenzzweig ab Genesis mit mehr Arbeit in der anderen Netzhälfte.
    forceBlock(world, 'm2');
    forceBlock(world, 'm2');
    forceBlock(world, 'm2');
    run(world, 60);
    expect(n1.blocks[top]).toBeDefined();
    expect(n1.blocks[n1.tip]!.height).toBe(3);
    for (const node of [n1, m1]) {
      expect(node.txIndex[first.value]).toBeUndefined();
      expect(node.mempool[first.value]).toBeDefined();
      expect(node.mempool[second.value]).toBeDefined();
    }
    expect(world.log.some((e) => e.kind === 'tx-dropped' && e.txid === second.value)).toBe(false);
    const fee = world.params.defaultFee;
    expect(walletBalance(world, 'alice')).toMatchObject({ confirmed: btcToSats(50), unconfirmed: -btcToSats(6) - 2 * fee });
    forceBlock(world, 'm1');
    run(world, 5);
    expect(confirmations(n1, first.value)).toBe(1);
    expect(confirmations(n1, second.value)).toBe(1);
  });

  it('lehnt einen manipulierten Block mit deutscher Meldung ab', () => {
    const world = createWorld('normal', 1, NO_MINING);
    const hash = forceBlock(world, 'm1')[0]!.blockHash!;
    const block = (world.nodes.m1 as MinerNode).blocks[hash]!;
    const forged = { ...block, txs: [{ ...block.txs[0]!, outputs: [{ value: btcToSats(1000), address: 'm1' }] }] };
    world.messagesInFlight.push({ id: 999, kind: 'block', payload: forged, from: 'm2', to: 'n3', sentAt: 0, arrivesAt: 1 });
    // Der echte Block darf n3 noch nicht erreicht haben, sonst gilt der Hash als bekannt.
    const events = step(world);
    const rejected = events.find((e) => e.kind === 'block-rejected' && e.nodeId === 'n3');
    expect(rejected?.text).toMatch(/lehnt Block 1 .* ab: TxID der Coinbase passt nicht/);
  });

  it('ist deterministisch: gleicher Seed, gleiches Protokoll', () => {
    const a = createWorld('normal', 99);
    const b = createWorld('normal', 99);
    sendTransaction(a, 'alice', 'bob', btcToSats(2));
    sendTransaction(b, 'alice', 'bob', btcToSats(2));
    run(a, 400);
    run(b, 400);
    expect(a.log).toEqual(b.log);
    expect(stats(a)).toEqual(stats(b));
  });
});

describe('Netz ändern', () => {
  it('neuer Miner übernimmt die Kette und findet Blöcke', () => {
    const world = createWorld('normal', 4, NO_MINING);
    forceBlock(world, 'm1');
    run(world, 10);
    const res = addMiner(world, { hashrate: 2 });
    if (!res.ok) throw new Error(res.error);
    const miner = world.nodes[res.value] as MinerNode;
    expect(miner.blocks[miner.tip]!.height).toBe(1);
    forceBlock(world, res.value);
    run(world, 10);
    expect(stats(world)).toMatchObject({ height: 2, distinctTips: 1 });
  });

  it('entfernt Miner, aber keinen Knoten mit angeschlossenen Wallets', () => {
    const world = createWorld('normal', 4);
    const blocked = removeNode(world, 'n1');
    expect(blocked.ok).toBe(false);
    expect(removeNode(world, 'm2').ok).toBe(true);
    expect(world.nodes.m2).toBeUndefined();
    expect(world.links.some((l) => l.a === 'm2' || l.b === 'm2')).toBe(false);
    run(world, 200);
  });
});

describe('Double Spend', () => {
  function attackWorld(seed: number, attacker: number, honest: [number, number]): World {
    const world = createWorld('attack', seed);
    setHashrate(world, 'm3', attacker);
    setHashrate(world, 'm1', honest[0]);
    setHashrate(world, 'm2', honest[1]);
    return world;
  }

  it('Preset attack: Angreifer hat 55 % der Hashrate, Opfer ist Bob', () => {
    const world = createWorld('attack', 1);
    expect(world.attack).toMatchObject({ attackerId: 'm3', victimId: 'bob', status: 'running' });
    expect(stats(world).totalHashrate).toBe(10);
    expect((world.nodes.m3 as MinerNode).hashrate).toBe(5.5);
    expect(PRESETS.attack.attack?.victimId).toBe('bob');
  });

  it('mit 60 % Hashrate gelingt der Angriff: Opfer-Tx verschwindet aus der besten Kette', () => {
    const world = attackWorld(1, 6, [2, 2]);
    const txid = world.attack!.publicTx.txid;
    let maxConf = 0;
    runUntil(
      world,
      () => {
        maxConf = Math.max(maxConf, confirmations(chainNodeOf(world, 'bob')!, txid));
        return world.attack!.status === 'succeeded' || world.attack!.status === 'abandoned';
      },
      20_000,
    );
    expect(world.attack!.status).toBe('succeeded');
    expect(maxConf).toBeGreaterThanOrEqual(world.params.attackConfirmations);
    expect(world.log.some((e) => e.kind === 'attack-success' && e.text.startsWith('Angriff gelungen'))).toBe(true);
    for (const node of chainNodes(world)) {
      if (node.id === 'm3') continue;
      expect(node.txIndex[txid]).toBeUndefined();
      expect(node.mempool[txid]).toBeUndefined();
    }
    expect(walletBalance(world, 'bob')).toMatchObject({ confirmed: btcToSats(20), unconfirmed: 0 });
  });

  // Stichprobe Seeds 1–40: mit 30 % gelingt der Angriff in 2000 Ticks bei 10 von 40 Seeds.
  // Seed 2 zeigt den typischen Fall, in dem er misslingt.
  it('mit 30 % Hashrate misslingt der Angriff in 2000 Ticks (Seed 2)', () => {
    const world = attackWorld(2, 3, [3.5, 3.5]);
    run(world, 2000);
    expect(world.attack!.status).not.toBe('succeeded');
    expect(world.log.some((e) => e.kind === 'attack-success')).toBe(false);
    const bob = chainNodeOf(world, 'bob')!;
    expect(confirmations(bob, world.attack!.publicTx.txid)).toBeGreaterThan(0);
  });

  // Seed 21 im Preset attack (wie im Simulator mit 10 Nullbits): Der Angreifer veröffentlicht in Tick 1001,
  // die ehrliche Kette bleibt trotzdem vorn. Der Angriff muss danach als gescheitert gelten.
  it('verliert die veröffentlichte Kette das Rennen, gilt der Angriff als gescheitert (Seed 21)', () => {
    const world = createWorld('attack', 21, { displayZeroBits: 10 });
    runUntil(world, () => world.log.some((e) => e.kind === 'attack-release'), 2000);
    expect(world.attack!.status).toBe('released');
    run(world, 3000);
    expect(world.attack!.status).toBe('failed');
    expect(world.log.some((e) => e.text.startsWith('Angriff gescheitert: die ehrliche Kette bleibt vorn'))).toBe(true);
    const bob = chainNodeOf(world, 'bob')!;
    expect(bob.txIndex[world.attack!.publicTx.txid]).toBeDefined();
    expect(bob.txIndex[world.attack!.privateTx.txid]).toBeUndefined();
    const again = startDoubleSpend(world, 'm3', 'bob', btcToSats(1));
    expect(again.ok).toBe(true);
    expect(world.attack!.status).toBe('running');
  });
});

describe('Einigkeit', () => {
  it('unterscheidet einen sich verbreitenden Block von einer Gabelung', () => {
    const world = createWorld('fork', 1, NO_MINING);
    expect(consensus(world)).toEqual({ kind: 'agreed', total: 6 });
    forceBlock(world, 'm1');
    expect(consensus(world)).toEqual({ kind: 'spreading', have: 1, total: 6 });
    forceBlock(world, 'm2');
    run(world, 25);
    expect(consensus(world).kind).toBe('fork');
    forceBlock(world, 'm1');
    run(world, 50);
    expect(consensus(world)).toEqual({ kind: 'agreed', total: 6 });
  });
});

describe('Haken „Unehrlich“', () => {
  it('startet einen Double Spend gegen Bob nur, wenn der Miner Guthaben hat', () => {
    const world = createWorld('normal', 1, NO_MINING);
    const m1 = world.nodes.m1 as MinerNode;
    const without = startDishonestAttack(world, 'm1');
    expect(without).toMatchObject({ ok: false, error: 'braucht Guthaben: erst einen Block finden' });
    expect(world.attack).toBeNull();
    expect(m1.dishonest).toBe(false);

    forceBlock(world, 'm1');
    const withBalance = startDishonestAttack(world, 'm1');
    expect(withBalance.ok).toBe(true);
    expect(world.attack).toMatchObject({ attackerId: 'm1', victimId: 'bob', amount: btcToSats(10), status: 'running' });
    expect(m1.dishonest).toBe(true);

    forceBlock(world, 'm2');
    expect(startDishonestAttack(world, 'm2')).toMatchObject({ ok: false, error: 'Es läuft schon ein Angriff von M1' });
    expect(world.attack!.attackerId).toBe('m1');
  });

  it('startet im Szenario „Double Spend“ keinen zweiten Angriff', () => {
    const world = createWorld('attack', 1);
    expect(startDishonestAttack(world, 'm3')).toMatchObject({ ok: false, error: 'Es läuft schon ein Angriff von M3' });
    expect(world.attack).toMatchObject({ attackerId: 'm3', amount: btcToSats(10) });
  });
});
