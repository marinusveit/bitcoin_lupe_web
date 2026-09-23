import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Tx, TxInput, TxOutput, UtxoSet } from './types';

export const SATS_PER_BTC = 100_000_000;

export function sha256dHex(data: string | Uint8Array): string {
  const bytes = typeof data === 'string' ? utf8ToBytes(data) : data;
  return bytesToHex(sha256(sha256(bytes)));
}

/** Kanonische Serialisierung: feste Feldreihenfolge, ohne `txid`. */
export function serializeTx(tx: Omit<Tx, 'txid'>): string {
  return JSON.stringify({
    inputs: tx.inputs.map((i) => ({ txid: i.txid, vout: i.vout })),
    outputs: tx.outputs.map((o) => ({ value: o.value, address: o.address })),
    coinbase: tx.coinbase ?? null,
  });
}

export function computeTxid(tx: Omit<Tx, 'txid'>): string {
  return sha256dHex(serializeTx(tx));
}

export function makeTx(inputs: TxInput[], outputs: TxOutput[], coinbase?: string): Tx {
  const body: Omit<Tx, 'txid'> = coinbase === undefined ? { inputs, outputs } : { inputs, outputs, coinbase };
  return { txid: computeTxid(body), ...body };
}

export function outpointKey(txid: string, vout: number): string {
  return `${txid}:${vout}`;
}

export function isCoinbase(tx: Tx): boolean {
  return tx.inputs.length === 0;
}

export function sumOutputs(tx: Tx): number {
  return tx.outputs.reduce((s, o) => s + o.value, 0);
}

/** Gebühr = Inputs minus Outputs; setzt voraus, dass alle Inputs in `utxo` liegen. */
export function txFee(tx: Tx, utxo: UtxoSet): number {
  let inSum = 0;
  for (const i of tx.inputs) inSum += utxo[outpointKey(i.txid, i.vout)]?.value ?? 0;
  return inSum - sumOutputs(tx);
}

/** Menge der Outpoints, die Transaktionen im Mempool bereits ausgeben. */
export function mempoolSpent(mempool: Record<string, Tx>): Set<string> {
  const spent = new Set<string>();
  for (const tx of Object.values(mempool)) for (const i of tx.inputs) spent.add(outpointKey(i.txid, i.vout));
  return spent;
}

/**
 * Prüft eine normale Transaktion gegen eine UTXO-Menge. Liefert `null` bei Erfolg,
 * sonst eine deutsche Fehlermeldung. `spent` enthält zusätzlich gesperrte Outpoints.
 */
export function validateTx(tx: Tx, utxo: UtxoSet, spent?: Set<string>): string | null {
  if (tx.txid !== computeTxid(tx)) return 'TxID passt nicht zum Inhalt';
  if (tx.inputs.length === 0) return 'Transaktion hat keine Inputs';
  if (tx.outputs.length === 0) return 'Transaktion hat keine Outputs';
  const seen = new Set<string>();
  let inSum = 0;
  for (const i of tx.inputs) {
    const key = outpointKey(i.txid, i.vout);
    if (seen.has(key)) return 'Input doppelt verwendet';
    seen.add(key);
    const out = utxo[key];
    if (!out) return `Input ${shortHash(i.txid)}:${i.vout} ist nicht unverbraucht`;
    if (spent?.has(key)) return `Input ${shortHash(i.txid)}:${i.vout} wird schon im Mempool ausgegeben`;
    inSum += out.value;
  }
  for (const o of tx.outputs) {
    if (!Number.isSafeInteger(o.value) || o.value <= 0) return 'Output-Wert muss größer als 0 sein';
  }
  if (sumOutputs(tx) > inSum) return 'Outputs sind größer als Inputs';
  return null;
}

/** Wendet eine (bereits geprüfte) Transaktion auf die UTXO-Menge an. */
export function applyTx(utxo: UtxoSet, tx: Tx): void {
  for (const i of tx.inputs) delete utxo[outpointKey(i.txid, i.vout)];
  tx.outputs.forEach((o, vout) => {
    utxo[outpointKey(tx.txid, vout)] = { value: o.value, address: o.address };
  });
}

/**
 * Baut eine Zahlung: wählt unverbrauchte Outputs von `fromAddress` (größte zuerst),
 * zahlt `amount` an `toAddress` und das Wechselgeld zurück.
 */
export function buildPayment(
  utxo: UtxoSet,
  locked: Set<string>,
  fromAddress: string,
  toAddress: string,
  amount: number,
  fee: number,
): { ok: true; tx: Tx } | { ok: false; error: string } {
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false, error: 'Betrag muss größer als 0 sein' };
  if (!Number.isSafeInteger(fee) || fee < 0) return { ok: false, error: 'Gebühr darf nicht negativ sein' };
  const candidates = Object.entries(utxo)
    .filter(([key, o]) => o.address === fromAddress && !locked.has(key))
    .sort(([ka, a], [kb, b]) => b.value - a.value || (ka < kb ? -1 : 1));
  const inputs: TxInput[] = [];
  let sum = 0;
  for (const [key, o] of candidates) {
    if (sum >= amount + fee) break;
    const sep = key.lastIndexOf(':');
    inputs.push({ txid: key.slice(0, sep), vout: Number(key.slice(sep + 1)) });
    sum += o.value;
  }
  if (sum < amount + fee) {
    return {
      ok: false,
      error: `Guthaben reicht nicht: verfügbar ${formatBtc(sum)}, nötig ${formatBtc(amount + fee)} (unbestätigte Beträge sind noch nicht ausgebbar)`,
    };
  }
  const outputs: TxOutput[] = [{ value: amount, address: toAddress }];
  if (sum - amount - fee > 0) outputs.push({ value: sum - amount - fee, address: fromAddress });
  return { ok: true, tx: makeTx(inputs, outputs) };
}

export function btcToSats(btc: number): number {
  return Math.round(btc * SATS_PER_BTC);
}

/** Formatiert Satoshi als BTC mit deutschem Dezimalkomma, z. B. „2,5 BTC“. */
export function formatBtc(sats: number): string {
  const text = (sats / SATS_PER_BTC).toFixed(8).replace(/\.?0+$/, '').replace('.', ',');
  return `${text} BTC`;
}

export function shortHash(hash: string, len = 6): string {
  return `${hash.slice(0, len)}…`;
}
