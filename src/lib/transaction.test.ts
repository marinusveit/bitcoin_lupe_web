import { describe, expect, it } from 'vitest';
import {
  applyTx,
  coinbaseTx,
  fee,
  isCoinbase,
  outpointKey,
  sighash,
  txid,
  validateTx,
  type Transaction,
  type UtxoSet,
} from './transaction';

const alice = ['OP_DUP', 'OP_HASH160', 'aa'.repeat(20), 'OP_EQUALVERIFY', 'OP_CHECKSIG'];
const bob = ['OP_DUP', 'OP_HASH160', 'bb'.repeat(20), 'OP_EQUALVERIFY', 'OP_CHECKSIG'];

function setup(): { utxos: UtxoSet; cbId: string } {
  const cb = coinbaseTx(1, 5_000_000_000, 0, alice);
  return { utxos: applyTx(new Map(), cb), cbId: txid(cb) };
}

function spend(cbId: string, values: number[]): Transaction {
  return {
    inputs: [{ txid: cbId, vout: 0, scriptSig: ['sig', 'pub'] }],
    outputs: values.map((value) => ({ value, scriptPubKey: bob })),
  };
}

describe('transaction', () => {
  it('TxID ist deterministisch und unabhängig von der Schlüsselreihenfolge', () => {
    const a = coinbaseTx(5, 100, 2, alice);
    const reordered: Transaction = {
      outputs: a.outputs.map((o) => ({ scriptPubKey: o.scriptPubKey, value: o.value })),
      inputs: a.inputs,
    };
    expect(txid(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(txid(reordered)).toBe(txid(a));
    expect(txid(coinbaseTx(6, 100, 2, alice))).not.toBe(txid(a));
  });

  it('Sighash ignoriert scriptSigs, TxID nicht', () => {
    const { cbId } = setup();
    const t1 = spend(cbId, [100]);
    const t2 = { ...t1, inputs: [{ ...t1.inputs[0]!, scriptSig: ['anders'] }] };
    expect(sighash(t1)).toBe(sighash(t2));
    expect(txid(t1)).not.toBe(txid(t2));
  });

  it('gültige Transaktion: Gebühr und neue UTXO-Menge', () => {
    const { utxos, cbId } = setup();
    const tx = spend(cbId, [3_000_000_000, 1_999_990_000]);
    expect(validateTx(utxos, tx)).toEqual({ ok: true });
    expect(fee(utxos, tx)).toBe(10_000);
    const next = applyTx(utxos, tx);
    expect(next.has(outpointKey(cbId, 0))).toBe(false);
    expect(next.get(outpointKey(txid(tx), 1))?.value).toBe(1_999_990_000);
    expect(utxos.has(outpointKey(cbId, 0))).toBe(true);
  });

  it('Coinbase wird erkannt und enthält Subvention plus Gebühren', () => {
    const cb = coinbaseTx(840_000, 312_500_000, 12_345, alice);
    expect(isCoinbase(cb)).toBe(true);
    expect(cb.outputs[0]!.value).toBe(312_512_345);
    expect(validateTx(new Map(), cb).ok).toBe(true);
  });

  it('Fehler: keine Inputs', () => {
    const tx: Transaction = { inputs: [], outputs: [{ value: 1, scriptPubKey: bob }] };
    expect(validateTx(new Map(), tx)).toEqual({ ok: false, error: 'Die Transaktion hat keine Inputs.' });
  });

  it('Fehler: Input unbekannt', () => {
    const result = validateTx(new Map(), spend('cd'.repeat(32), [1]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('unbekannt oder bereits ausgegeben');
  });

  it('Fehler: Input bereits ausgegeben', () => {
    const { utxos, cbId } = setup();
    const after = applyTx(utxos, spend(cbId, [1000]));
    const result = validateTx(after, spend(cbId, [500]));
    expect(result.ok).toBe(false);
    expect(() => applyTx(after, spend(cbId, [500]))).toThrow(/bereits ausgegeben/);
  });

  it('Fehler: Summe der Outputs größer als Inputs', () => {
    const { utxos, cbId } = setup();
    const result = validateTx(utxos, spend(cbId, [5_000_000_001]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('größer als die Inputs');
  });

  it('Fehler: derselbe Input doppelt in einer Transaktion', () => {
    const { utxos, cbId } = setup();
    const tx = spend(cbId, [1]);
    tx.inputs.push({ ...tx.inputs[0]! });
    const result = validateTx(utxos, tx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('doppelt');
  });
});
