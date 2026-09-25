import { sha256dHex } from './hash';

/**
 * Vereinfachtes Transaktionsmodell. Beträge sind ganze Satoshi als `number`
 * (21 Mio. BTC = 2,1·10^15 Satoshi liegen sicher unter 2^53). Skripte sind Token-Listen
 * wie in `script.ts`.
 *
 * Kanonische Serialisierung: JSON mit alphabetisch sortierten Schlüsseln, ohne Leerzeichen,
 * Arrays in ihrer Reihenfolge. Die TxID ist das doppelte SHA-256 dieses UTF-8-Texts als Hex,
 * ohne Byte-Drehung. Das ist absichtlich nicht das echte Bitcoin-Binärformat.
 */

/** Verweis auf einen früheren Output (`txid`, `vout`) plus Entsperr-Skript. */
export interface TxInput {
  txid: string;
  vout: number;
  scriptSig: string[];
}

/** Ein Output: Betrag in Satoshi und Sperr-Skript. */
export interface TxOutput {
  value: number;
  scriptPubKey: string[];
}

/** Eine Transaktion aus Inputs und Outputs. */
export interface Transaction {
  inputs: TxInput[];
  outputs: TxOutput[];
}

/** Menge der unverbrauchten Outputs, Schlüssel "txid:vout". */
export type UtxoSet = Map<string, TxOutput>;

/** Ergebnis der Prüfung einer Transaktion; `error` ist eine deutsche Meldung. */
export type ValidationResult = { ok: true } | { ok: false; error: string };

/** TxID-Platzhalter aus Nullen, den Coinbase-Inputs referenzieren. */
export const NULL_TXID = '0'.repeat(64);

/** vout-Wert eines Coinbase-Inputs. */
export const COINBASE_VOUT = 0xffffffff;

/** Bildet den Schlüssel "txid:vout" für die UTXO-Menge. */
export function outpointKey(txid: string, vout: number): string {
  return `${txid}:${vout}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Serialisiert eine Transaktion kanonisch (JSON mit sortierten Schlüsseln). */
export function serializeTx(tx: Transaction): string {
  return canonicalJson({
    inputs: tx.inputs.map(({ txid, vout, scriptSig }) => ({ txid, vout, scriptSig })),
    outputs: tx.outputs.map(({ value, scriptPubKey }) => ({ value, scriptPubKey })),
  });
}

/** Berechnet die TxID als doppeltes SHA-256 der kanonischen Serialisierung. */
export function txid(tx: Transaction): string {
  return sha256dHex(serializeTx(tx));
}

/** Vereinfachte Sighash: doppeltes SHA-256 der Serialisierung mit geleerten scriptSigs. */
export function sighash(tx: Transaction): string {
  return txid({ ...tx, inputs: tx.inputs.map((i) => ({ ...i, scriptSig: [] })) });
}

/** Prüft, ob die Transaktion eine Coinbase ist (ein Input ohne echten Vorgänger). */
export function isCoinbase(tx: Transaction): boolean {
  return tx.inputs.length === 1 && tx.inputs[0]!.txid === NULL_TXID && tx.inputs[0]!.vout === COINBASE_VOUT;
}

function heightToHex(height: number): string {
  let hex = '';
  let h = height;
  do {
    hex += (h & 0xff).toString(16).padStart(2, '0');
    h = Math.floor(h / 256);
  } while (h > 0);
  return hex;
}

/** Erzeugt eine Coinbase-Transaktion; die Blockhöhe im scriptSig macht die TxID eindeutig. */
export function coinbaseTx(height: number, subsidy: number, fees: number, scriptPubKey: string[]): Transaction {
  if (!Number.isSafeInteger(height) || height < 0) throw new Error('Die Blockhöhe muss eine ganze Zahl ≥ 0 sein.');
  return {
    inputs: [{ txid: NULL_TXID, vout: COINBASE_VOUT, scriptSig: [heightToHex(height)] }],
    outputs: [{ value: subsidy + fees, scriptPubKey }],
  };
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Prüft Struktur und Beträge einer Transaktion gegen die UTXO-Menge (Skripte prüft `script.ts`).
 * Eine Coinbase gilt hier nach der Betragsprüfung der Outputs als gültig: Dass sie die erste Transaktion
 * im Block ist und höchstens Blockzuschuss plus Gebühren auszahlt, muss der Aufrufer mit dem Blockkontext prüfen.
 */
export function validateTx(utxos: UtxoSet, tx: Transaction): ValidationResult {
  if (tx.outputs.length === 0) return { ok: false, error: 'Die Transaktion hat keine Outputs.' };
  for (const [i, out] of tx.outputs.entries()) {
    if (!Number.isSafeInteger(out.value) || out.value < 0) {
      return { ok: false, error: `Output ${i} hat keinen gültigen Betrag (ganze Satoshi ≥ 0).` };
    }
  }
  if (isCoinbase(tx)) return { ok: true };
  if (tx.inputs.length === 0) return { ok: false, error: 'Die Transaktion hat keine Inputs.' };
  const seen = new Set<string>();
  let inputSum = 0;
  for (const input of tx.inputs) {
    const key = outpointKey(input.txid, input.vout);
    if (seen.has(key)) return { ok: false, error: `Der Input ${key} wird doppelt verwendet.` };
    seen.add(key);
    const prev = utxos.get(key);
    if (!prev) return { ok: false, error: `Der Input ${key} ist unbekannt oder bereits ausgegeben.` };
    inputSum += prev.value;
  }
  const outputSum = sum(tx.outputs.map((o) => o.value));
  if (outputSum > inputSum) {
    return {
      ok: false,
      error: `Die Outputs (${outputSum} Satoshi) sind größer als die Inputs (${inputSum} Satoshi).`,
    };
  }
  return { ok: true };
}

/** Gebühr = Summe der Inputs minus Summe der Outputs; bei Coinbase 0. */
export function fee(utxos: UtxoSet, tx: Transaction): number {
  if (isCoinbase(tx)) return 0;
  const inputSum = sum(
    tx.inputs.map((i) => {
      const prev = utxos.get(outpointKey(i.txid, i.vout));
      if (!prev) throw new Error(`Der Input ${outpointKey(i.txid, i.vout)} ist unbekannt oder bereits ausgegeben.`);
      return prev.value;
    }),
  );
  return inputSum - sum(tx.outputs.map((o) => o.value));
}

/** Wendet eine gültige Transaktion an und liefert eine neue UTXO-Menge (die alte bleibt unverändert). */
export function applyTx(utxos: UtxoSet, tx: Transaction): UtxoSet {
  const result = validateTx(utxos, tx);
  if (!result.ok) throw new Error(result.error);
  const next = new Map(utxos);
  if (!isCoinbase(tx)) for (const i of tx.inputs) next.delete(outpointKey(i.txid, i.vout));
  const id = txid(tx);
  tx.outputs.forEach((out, vout) => next.set(outpointKey(id, vout), out));
  return next;
}
