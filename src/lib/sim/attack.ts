import type { AttackState, MinerNode, Result, SimEvent, World } from './types';
import { buildPayment, formatBtc, makeTx, mempoolSpent, sumOutputs } from './tx';
import { confirmations } from './node';
import { isChainNode, label, makeEmitter, receiveBlock, receiveTx, type Emit } from './network';

function getMiner(world: World, id: string): MinerNode | null {
  const n = world.nodes[id];
  return n && n.kind === 'miner' ? n : null;
}

function isActiveAttacker(world: World, miner: MinerNode): boolean {
  return world.attack?.attackerId === miner.id && world.attack.status === 'running';
}

/**
 * Startet einen Double Spend: Der Angreifer zahlt öffentlich an das Opfer und mined
 * heimlich ab dem aktuellen Tip eine Kette, in der dieselben Coins an ihn selbst gehen.
 * `amount` und `fee` in Satoshi.
 */
export function startDoubleSpend(
  world: World,
  attackerMinerId: string,
  victimWalletId: string,
  amount: number,
  fee = world.params.defaultFee,
): Result<AttackState> & { events: SimEvent[] } {
  const events: SimEvent[] = [];
  const emit = makeEmitter(world, events);
  const attacker = getMiner(world, attackerMinerId);
  const victim = world.nodes[victimWalletId];
  if (!attacker) return { ok: false, error: 'Angreifer muss ein Miner sein', events };
  if (!victim || victim.kind !== 'wallet') return { ok: false, error: 'Opfer muss eine Wallet sein', events };
  if (world.attack && (world.attack.status === 'running' || world.attack.status === 'released')) {
    return { ok: false, error: 'Es läuft schon ein Angriff', events };
  }
  const pay = buildPayment(attacker.utxo, mempoolSpent(attacker.mempool), attacker.address, victim.address, amount, fee);
  if (!pay.ok) return { ok: false, error: pay.error, events };
  const publicTx = pay.tx;
  // Gleiche Inputs, alles (abzüglich Gebühr) zurück an den Angreifer.
  const privateTx = makeTx(publicTx.inputs, [{ value: sumOutputs(publicTx), address: attacker.address }]);

  attacker.dishonest = true;
  attacker.privateChain = [];
  attacker.privateBase = attacker.tip;
  const attack: AttackState = {
    attackerId: attacker.id,
    victimId: victim.id,
    amount,
    publicTx,
    privateTx,
    z: 0,
    status: 'running',
    startedAt: world.tick,
  };
  world.attack = attack;
  emit({
    kind: 'attack-start',
    text: `${label(attacker)} startet einen Double Spend: öffentlich ${formatBtc(amount)} an ${victim.name}, heimlich dieselben Coins an sich selbst`,
    nodeId: attacker.id,
    txid: publicTx.txid,
  });
  emit({ kind: 'tx-created', text: `${attacker.name} sendet ${formatBtc(amount)} an ${victim.name}`, nodeId: attacker.id, txid: publicTx.txid });
  receiveTx(world, attacker, publicTx, attacker.id, emit);
  return { ok: true, value: attack, events };
}

/** Schaltet einen Miner ehrlich/unehrlich. Unehrlich = Blöcke zurückhalten, bis die eigene Kette vorn liegt. */
export function setDishonest(world: World, minerId: string, dishonest: boolean): SimEvent[] {
  const events: SimEvent[] = [];
  const emit = makeEmitter(world, events);
  const miner = getMiner(world, minerId);
  if (!miner || miner.dishonest === dishonest) return events;
  if (dishonest) {
    miner.dishonest = true;
    miner.privateBase = miner.tip;
    miner.privateChain = [];
    emit({ kind: 'config', text: `${label(miner)} arbeitet jetzt unehrlich und hält Blöcke zurück`, nodeId: miner.id });
    return events;
  }
  if (miner.privateChain.length > 0 && privateWork(miner) > miner.work[miner.tip]!) {
    release(world, miner, emit);
  } else {
    miner.privateChain = [];
  }
  if (isActiveAttacker(world, miner)) {
    world.attack!.status = 'abandoned';
    emit({ kind: 'attack-abandoned', text: `Angriff abgebrochen: ${label(miner)} arbeitet wieder ehrlich`, nodeId: miner.id });
  }
  miner.dishonest = false;
  miner.privateBase = null;
  emit({ kind: 'config', text: `${label(miner)} arbeitet wieder ehrlich`, nodeId: miner.id });
  return events;
}

function privateWork(miner: MinerNode): number {
  return miner.work[miner.privateBase!]! + miner.privateChain.reduce((s, b) => s + b.difficulty, 0);
}

/** Vorsprung der privaten Kette in Blöcken gegenüber der öffentlichen Kette des Miners. */
export function privateLead(miner: MinerNode): number {
  if (miner.privateBase === null) return 0;
  const base = miner.blocks[miner.privateBase]!;
  const tip = miner.blocks[miner.tip]!;
  return miner.privateChain.length - (tip.height - base.height);
}

function release(world: World, miner: MinerNode, emit: Emit): void {
  const blocks = miner.privateChain;
  miner.privateChain = [];
  const n = blocks.length;
  emit({
    kind: 'attack-release',
    text: `${label(miner)} veröffentlicht ${n} ${n === 1 ? 'zurückgehaltenen Block' : 'zurückgehaltene Blöcke'} auf einmal`,
    nodeId: miner.id,
    blockHash: blocks.at(-1)?.hash,
  });
  for (const b of blocks) receiveBlock(world, miner, b, miner.id, emit, true);
}

/** Pro Tick: Vorsprung melden, private Kette veröffentlichen oder aufgeben, Erfolg prüfen. */
export function attackTick(world: World, emit: Emit): void {
  for (const node of Object.values(world.nodes)) {
    if (node.kind !== 'miner' || !node.dishonest || node.privateBase === null) continue;
    const attacking = isActiveAttacker(world, node);
    const z = privateLead(node);
    if (attacking && world.attack!.z !== z) {
      world.attack!.z = z;
      emit({
        kind: 'attack-lead',
        text: z >= 0 ? `Private Kette des Angreifers: Vorsprung ${z} ${z === 1 ? 'Block' : 'Blöcke'}` : `Private Kette des Angreifers: Rückstand ${-z} ${-z === 1 ? 'Block' : 'Blöcke'}`,
        nodeId: node.id,
      });
    }
    if (z < -world.params.attackGiveUpDeficit) {
      node.privateChain = [];
      if (attacking) {
        world.attack!.status = 'abandoned';
        node.dishonest = false;
        node.privateBase = null;
        emit({ kind: 'attack-abandoned', text: `Angriff aufgegeben: ${label(node)} liegt ${-z} Blöcke zurück`, nodeId: node.id });
      } else {
        node.privateBase = node.tip;
      }
      continue;
    }
    const confirmed = !attacking || confirmations(node, world.attack!.publicTx.txid) >= world.params.attackConfirmations;
    if (node.privateChain.length > 0 && confirmed && privateWork(node) > node.work[node.tip]!) {
      release(world, node, emit);
      if (attacking) {
        world.attack!.status = 'released';
        node.dishonest = false;
        node.privateBase = null;
      } else {
        node.privateBase = node.tip;
      }
    }
  }
  checkAttackSuccess(world, emit);
}

/**
 * Nach der Veröffentlichung: Angriff gelungen, wenn alle ehrlichen Knoten die geheime statt der
 * öffentlichen Zahlung bestätigt haben. Gescheitert, wenn alle Knoten (auch der Angreifer) die
 * öffentliche Zahlung in ihrer besten Kette haben und kein Block mehr unterwegs ist: Dann baut
 * niemand mehr auf der veröffentlichten Kette weiter.
 */
function checkAttackSuccess(world: World, emit: Emit): void {
  const attack = world.attack;
  if (!attack || attack.status !== 'released') return;
  let succeeded = true;
  let failed = !world.messagesInFlight.some((m) => m.kind === 'block');
  for (const node of Object.values(world.nodes)) {
    if (!isChainNode(node)) continue;
    const hasPublic = Boolean(node.txIndex[attack.publicTx.txid]);
    const hasPrivate = Boolean(node.txIndex[attack.privateTx.txid]);
    if (!hasPublic || hasPrivate) failed = false;
    if (node.id !== attack.attackerId && (!hasPrivate || hasPublic)) succeeded = false;
  }
  if (failed) {
    attack.status = 'failed';
    emit({
      kind: 'attack-failed',
      text: 'Angriff gescheitert: die ehrliche Kette bleibt vorn, die Zahlung an das Opfer ist weiter bestätigt',
      nodeId: attack.attackerId,
      txid: attack.publicTx.txid,
    });
    return;
  }
  if (!succeeded) return;
  attack.status = 'succeeded';
  const victim = world.nodes[attack.victimId];
  emit({
    kind: 'attack-success',
    text: `Angriff gelungen: Die Zahlung an ${victim?.name ?? 'das Opfer'} ist aus der besten Kette verschwunden, die Coins gehören wieder dem Angreifer`,
    nodeId: attack.attackerId,
    txid: attack.publicTx.txid,
  });
}
