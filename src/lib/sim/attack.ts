import type { AttackState, MinerNode, Result, SimEvent, World } from './types';
import { btcToSats, buildPayment, formatBtc, makeTx, mempoolSpent, sumOutputs } from './tx';
import { PRESETS } from './presets';
import { confirmations } from './node';
import { collectEvents, isChainNode, label, receiveBlock, receiveTx, withEvents, type Emit } from './network';

function getMiner(world: World, id: string): MinerNode | null {
  const n = world.nodes[id];
  return n && n.kind === 'miner' ? n : null;
}

/** Ist der Miner der Angreifer eines Angriffs, der noch heimlich läuft (Status `running`)? */
export function isActiveAttacker(world: World, miner: MinerNode): boolean {
  return world.attack?.attackerId === miner.id && world.attack.status === 'running';
}

/** Läuft der Angriff noch (heimlich oder schon veröffentlicht, aber nicht entschieden)? */
export function attackInProgress(attack: AttackState | null | undefined): attack is AttackState {
  return attack?.status === 'running' || attack?.status === 'released';
}

/** Miner geht in den privaten Modus: hält ab seinem Tip Blöcke zurück. */
export function goPrivate(miner: MinerNode): void {
  miner.dishonest = true;
  miner.privateBase = miner.tip;
  miner.privateChain = [];
}

/** Miner arbeitet wieder ehrlich; die private Kette muss vorher veröffentlicht oder verworfen sein. */
export function goHonest(miner: MinerNode): void {
  miner.dishonest = false;
  miner.privateBase = null;
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
  return withEvents(world, (emit): Result<AttackState> => {
    const attacker = getMiner(world, attackerMinerId);
    const victim = world.nodes[victimWalletId];
    if (!attacker) return { ok: false, error: 'Angreifer muss ein Miner sein' };
    if (!victim || victim.kind !== 'wallet') return { ok: false, error: 'Opfer muss eine Wallet sein' };
    if (attackInProgress(world.attack)) return { ok: false, error: 'Es läuft schon ein Angriff' };
    const pay = buildPayment(attacker.utxo, mempoolSpent(attacker.mempool), attacker.address, victim.address, amount, fee);
    if (!pay.ok) return { ok: false, error: pay.error };
    const publicTx = pay.tx;
    // Gleiche Inputs, alles (abzüglich Gebühr) zurück an den Angreifer.
    const privateTx = makeTx(publicTx.inputs, [{ value: sumOutputs(publicTx), address: attacker.address }]);

    goPrivate(attacker);
    const attack: AttackState = {
      attackerId: attacker.id,
      victimId: victim.id,
      amount,
      publicTx,
      privateTx,
      z: 0,
      conf: 0,
      status: 'running',
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
    return { ok: true, value: attack };
  });
}

/** Opfer des Double Spends, den der Haken „Unehrlich“ startet. */
export const DISHONEST_VICTIM = 'bob';

/**
 * Betrag in Satoshi, den ein Miner für einen Double Spend einsetzen kann: sein bestätigtes,
 * nicht schon im Mempool ausgegebenes Guthaben abzüglich Gebühr, höchstens der Betrag aus dem
 * Szenario „Double Spend“. 0, wenn er nichts hat.
 */
export function attackBudget(world: World, minerId: string): number {
  const miner = getMiner(world, minerId);
  if (!miner) return 0;
  const spent = mempoolSpent(miner.mempool);
  let sum = 0;
  for (const [key, o] of Object.entries(miner.utxo)) if (o.address === miner.address && !spent.has(key)) sum += o.value;
  const cap = btcToSats(PRESETS.attack.attack!.amount);
  return Math.max(0, Math.min(cap, sum - world.params.defaultFee));
}

/**
 * Haken „Unehrlich“: Der Miner startet einen Double Spend gegen Bob mit `attackBudget`. Ohne
 * Guthaben oder während eines laufenden Angriffs passiert nichts.
 */
export function startDishonestAttack(world: World, minerId: string): Result<AttackState> & { events: SimEvent[] } {
  const miner = getMiner(world, minerId);
  if (!miner) return { ok: false, error: 'Angreifer muss ein Miner sein', events: [] };
  const a = world.attack;
  if (attackInProgress(a)) {
    const who = world.nodes[a.attackerId];
    return { ok: false, error: `Es läuft schon ein Angriff${who ? ` von ${who.name}` : ''}`, events: [] };
  }
  const amount = attackBudget(world, minerId);
  if (amount <= 0) return { ok: false, error: 'braucht Guthaben: erst einen Block finden', events: [] };
  return startDoubleSpend(world, minerId, DISHONEST_VICTIM, amount);
}

/** „, wartet auf 2 Bestätigungen bei Bob (jetzt 0)“, solange der laufende Angriff noch warten muss, sonst leer. */
export function attackWaitText(world: World): string {
  const a = world.attack;
  if (!a || a.status !== 'running') return '';
  const attacker = getMiner(world, a.attackerId);
  if (!attacker) return '';
  const needed = world.params.attackConfirmations;
  const now = confirmations(attacker, a.publicTx.txid);
  if (now >= needed) return '';
  const victim = world.nodes[a.victimId];
  return `, wartet, bis die Zahlung an ${victim?.name ?? 'das Opfer'} ${needed} ${needed === 1 ? 'Bestätigung' : 'Bestätigungen'} hat (aus seiner Sicht jetzt ${now})`;
}

/** Schaltet einen Miner ehrlich/unehrlich. Unehrlich = Blöcke zurückhalten, bis die eigene Kette vorn liegt. */
export function setDishonest(world: World, minerId: string, dishonest: boolean): SimEvent[] {
  return collectEvents(world, (emit) => {
    const miner = getMiner(world, minerId);
    if (!miner || miner.dishonest === dishonest) return;
    if (dishonest) {
      goPrivate(miner);
      emit({ kind: 'config', text: `${label(miner)} arbeitet jetzt unehrlich und hält Blöcke zurück`, nodeId: miner.id });
      return;
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
    goHonest(miner);
    emit({ kind: 'config', text: `${label(miner)} arbeitet wieder ehrlich`, nodeId: miner.id });
  });
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

/** „Vorsprung 2 Blöcke“, „Gleichstand“ oder „Rückstand 1 Block“ für einen Vorsprung `z` in Blöcken. */
export function leadText(z: number): string {
  if (z === 0) return 'Gleichstand';
  const n = Math.abs(z);
  return `${z > 0 ? 'Vorsprung' : 'Rückstand'} ${n} ${n === 1 ? 'Block' : 'Blöcke'}`;
}

/** Bestätigungen der öffentlichen Zahlung aus Sicht des Knotens, an dem das Opfer hängt. */
function victimConfirmations(world: World, attack: AttackState): number {
  const victim = world.nodes[attack.victimId];
  const via = victim?.kind === 'wallet' ? world.nodes[victim.via] : victim;
  return isChainNode(via) ? confirmations(via, attack.publicTx.txid) : 0;
}

/** Pro Tick: Vorsprung melden, private Kette veröffentlichen oder aufgeben, Erfolg prüfen. */
export function attackTick(world: World, emit: Emit): void {
  for (const node of Object.values(world.nodes)) {
    if (node.kind !== 'miner' || !node.dishonest || node.privateBase === null) continue;
    const attacking = isActiveAttacker(world, node);
    const z = privateLead(node);
    const conf = attacking ? Math.min(confirmations(node, world.attack!.publicTx.txid), world.params.attackConfirmations) : 0;
    if (attacking && (world.attack!.z !== z || world.attack!.conf !== conf)) {
      world.attack!.z = z;
      world.attack!.conf = conf;
      emit({ kind: 'attack-lead', text: `Private Kette des Angreifers: ${leadText(z)}${attackWaitText(world)}`, nodeId: node.id });
    }
    if (z < -world.params.attackGiveUpDeficit) {
      node.privateChain = [];
      if (attacking) {
        world.attack!.status = 'abandoned';
        goHonest(node);
        emit({ kind: 'attack-abandoned', text: `Angriff aufgegeben: ${label(node)} liegt ${-z} Blöcke zurück`, nodeId: node.id });
      } else {
        node.privateBase = node.tip;
      }
      continue;
    }
    const confirmed = !attacking || confirmations(node, world.attack!.publicTx.txid) >= world.params.attackConfirmations;
    if (node.privateChain.length > 0 && confirmed && privateWork(node) > node.work[node.tip]!) {
      if (attacking) world.attack!.victimConfAtRelease = victimConfirmations(world, world.attack!);
      release(world, node, emit);
      if (attacking) {
        world.attack!.status = 'released';
        goHonest(node);
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
  const name = victim?.name ?? 'das Opfer';
  const conf = attack.victimConfAtRelease;
  const seen = conf ? `. ${name} hatte schon ${conf} ${conf === 1 ? 'Bestätigung' : 'Bestätigungen'} gesehen` : '';
  emit({
    kind: 'attack-success',
    text: `Angriff gelungen: Die Zahlung an ${name} ist aus der besten Kette verschwunden, die Coins gehören wieder dem Angreifer${seen}`,
    nodeId: attack.attackerId,
    txid: attack.publicTx.txid,
  });
}
