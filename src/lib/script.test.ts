import { describe, expect, it } from 'vitest';
import { sha256dHex } from './hash';
import { publicKey, signMessage } from './keys';
import {
  decodeScriptNum,
  encodeScriptNum,
  execute,
  p2pkhScriptPubKey,
  p2pkhScriptSig,
  p2pkScriptPubKey,
  p2pkScriptSig,
  parseScript,
} from './script';

const PRIV = '1e99423a4ed27608a15a2616a2b0e9e52ced330ac530edcc32c8ffc6a526aedd';
const OTHER = '0000000000000000000000000000000000000000000000000000000000000001';
const pub = publicKey(PRIV);
const ctx = { messageHash: sha256dHex('vereinfachte Transaktion') };
const sig = signMessage(PRIV, ctx.messageHash);

describe('script', () => {
  it('P2PK mit echter Signatur ist gültig', () => {
    const r = execute(p2pkScriptSig(sig), p2pkScriptPubKey(pub), ctx);
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => s.token)).toEqual([sig, pub, 'OP_CHECKSIG']);
    expect(r.steps.at(-1)!.stackAfter).toEqual(['01']);
  });

  it('P2PKH mit echter Signatur ist gültig', () => {
    const r = execute(p2pkhScriptSig(sig, pub), p2pkhScriptPubKey(pub), ctx);
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.steps).toHaveLength(7);
    expect(r.steps[0]!.phase).toBe('scriptSig');
    expect(r.steps[2]!.phase).toBe('scriptPubKey');
  });

  it('P2PKH mit falschem Public Key scheitert an OP_EQUALVERIFY', () => {
    const r = execute(p2pkhScriptSig(sig, publicKey(OTHER)), p2pkhScriptPubKey(pub), ctx);
    expect(r.ok).toBe(false);
    expect(r.steps.at(-1)!.token).toBe('OP_EQUALVERIFY');
    expect(r.error).toContain('OP_EQUALVERIFY');
  });

  it('falsche Signatur: OP_CHECKSIG liefert falsch', () => {
    const wrongSig = signMessage(OTHER, ctx.messageHash);
    const r = execute(p2pkhScriptSig(wrongSig, pub), p2pkhScriptPubKey(pub), ctx);
    expect(r.ok).toBe(false);
    expect(r.steps.at(-1)!.token).toBe('OP_CHECKSIG');
    expect(r.steps.at(-1)!.stackAfter).toEqual(['']);
    const tampered = execute(p2pkScriptSig(sig), p2pkScriptPubKey(pub), { messageHash: sha256dHex('andere') });
    expect(tampered.ok).toBe(false);
  });

  it('OP_ADD: 2 + 3 = 5', () => {
    const r = execute('OP_2 OP_3', 'OP_ADD OP_5 OP_EQUAL');
    expect(r.ok).toBe(true);
    expect(r.steps[2]!.stackAfter).toEqual(['05']);
    expect(r.steps[2]!.note).toBe('2 + 3 = 5');
  });

  it('OP_SUB, OP_VERIFY, OP_RETURN und unbekannte Opcodes', () => {
    expect(execute('OP_3 OP_5', 'OP_SUB').steps[2]!.note).toBe('3 - 5 = -2');
    expect(execute('OP_0', 'OP_VERIFY OP_1').ok).toBe(false);
    expect(execute('', 'OP_RETURN').error).toContain('OP_RETURN');
    expect(execute('', 'OP_FOO').error).toContain('Unbekannter Opcode');
    expect(execute('', 'OP_DUP').error).toContain('leer');
  });

  it('erklärt Dezimalzahlen, ungerade Hex-Längen und OP_RETURN verständlich', () => {
    expect(execute('2 3', '').error).toBe('Unbekannter Opcode: 2. Zahlen als OP_2 schreiben.');
    expect(execute('OP_17', '').error).toContain('OP_0 bis OP_16');
    expect(execute('abc', '').error).toContain('Hex-Daten brauchen eine gerade Zahl an Zeichen');
    expect(execute('OP_1 OP_RETURN', '').error).toBe('OP_RETURN beendet das Skript immer als ungültig.');
  });

  it('Script-Zahlen hin und zurück', () => {
    for (const n of [0, 1, -1, 127, 128, -128, 255, 32767, -32768]) {
      expect(decodeScriptNum(encodeScriptNum(n))).toBe(n);
    }
    expect(encodeScriptNum(-1)).toBe('81');
    expect(encodeScriptNum(128)).toBe('8000');
  });

  it('parseScript trennt an Leerzeichen', () => {
    expect(parseScript('  OP_DUP   OP_HASH160 ab ')).toEqual(['OP_DUP', 'OP_HASH160', 'ab']);
  });
});
