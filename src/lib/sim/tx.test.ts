import { describe, expect, it } from 'vitest';
import { applyTx, formatBtc, makeTx, outpointKey, validateTx } from './tx';
import { merkleRoot } from './block';
import type { UtxoSet } from './types';

const genesis = makeTx([], [{ value: 50, address: 'alice' }, { value: 20, address: 'bob' }], 'genesis');

function utxo(): UtxoSet {
  const set: UtxoSet = {};
  applyTx(set, genesis);
  return set;
}

describe('Transaktionsprüfung', () => {
  it('akzeptiert eine gültige Zahlung und berechnet eine stabile TxID', () => {
    const tx = makeTx([{ txid: genesis.txid, vout: 0 }], [{ value: 5, address: 'bob' }, { value: 44, address: 'alice' }]);
    expect(validateTx(tx, utxo())).toBeNull();
    expect(tx.txid).toMatch(/^[0-9a-f]{64}$/);
    expect(makeTx(tx.inputs, tx.outputs).txid).toBe(tx.txid);
  });

  it('meldet Fehler auf Deutsch', () => {
    const spendTooMuch = makeTx([{ txid: genesis.txid, vout: 1 }], [{ value: 21, address: 'alice' }]);
    expect(validateTx(spendTooMuch, utxo())).toBe('Outputs sind größer als Inputs');
    const unknown = makeTx([{ txid: genesis.txid, vout: 7 }], [{ value: 1, address: 'alice' }]);
    expect(validateTx(unknown, utxo())).toMatch(/ist nicht unverbraucht/);
    const zero = makeTx([{ txid: genesis.txid, vout: 1 }], [{ value: 0, address: 'alice' }]);
    expect(validateTx(zero, utxo())).toBe('Output-Wert muss größer als 0 sein');
    const ok = makeTx([{ txid: genesis.txid, vout: 1 }], [{ value: 1, address: 'alice' }]);
    expect(validateTx(ok, utxo(), new Set([outpointKey(genesis.txid, 1)]))).toMatch(/schon im Mempool ausgegeben/);
  });

  it('formatiert Beträge mit Dezimalkomma', () => {
    expect(formatBtc(200_000_000)).toBe('2 BTC');
    expect(formatBtc(250_000_000)).toBe('2,5 BTC');
    expect(formatBtc(10_000_000)).toBe('0,1 BTC');
  });

  it('Merkle-Root einer einzelnen Transaktion ist ihre TxID', () => {
    expect(merkleRoot([genesis.txid])).toBe(genesis.txid);
    expect(merkleRoot([genesis.txid, genesis.txid])).not.toBe(genesis.txid);
  });
});
