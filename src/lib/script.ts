import { bytesToHex, hash160Hex, hexToBytes, sha256Hex } from './hash';
import { verifySignature } from './keys';

/**
 * Mini-Interpreter für Bitcoin Script. Ein Skript ist eine Liste von Tokens: Opcodes wie
 * `OP_DUP` oder Datenpushes als Hex (z. B. ein Public Key). Der Stapel enthält Byte-Folgen,
 * in den Schritten als Hex dargestellt (leerer String = leere Byte-Folge = falsch/0).
 *
 * Wie Bitcoin Core (seit dem Fix zu CVE-2010-5141, interpreter.cpp `VerifyScript`) laufen
 * scriptSig und scriptPubKey als zwei getrennte Programme nacheinander; der Stapel nach dem
 * scriptSig wird an das scriptPubKey übergeben. Die Skripte werden nicht zu einem verkettet.
 *
 * Vereinfachungen gegenüber Bitcoin: Signaturen haben kein angehängtes Sighash-Typ-Byte;
 * OP_CHECKSIG prüft gegen `ctx.messageHash` (vereinfachte Sighash, siehe `sighash` in
 * `transaction.ts`).
 */

/** Kontext der Ausführung: der Hash, den OP_CHECKSIG als signierte Nachricht verwendet. */
export interface ScriptContext {
  messageHash: string;
}

/** Ein ausgeführter Schritt für die Animation. */
export interface ScriptStep {
  token: string;
  phase: 'scriptSig' | 'scriptPubKey';
  stackAfter: string[];
  note: string;
}

/** Ergebnis der Skriptausführung: gültig, alle Schritte und ggf. die Fehlermeldung. */
export interface ScriptResult {
  ok: boolean;
  steps: ScriptStep[];
  error?: string;
}

/** Alle unterstützten Opcodes. */
export const OPCODES = [
  'OP_0',
  ...Array.from({ length: 16 }, (_, i) => `OP_${i + 1}`),
  'OP_DUP',
  'OP_HASH160',
  'OP_SHA256',
  'OP_EQUAL',
  'OP_EQUALVERIFY',
  'OP_VERIFY',
  'OP_CHECKSIG',
  'OP_ADD',
  'OP_SUB',
  'OP_RETURN',
] as const;

class ScriptError extends Error {}

/** Kodiert eine Zahl wie Bitcoin Script (Little Endian, Vorzeichen im höchsten Bit) als Hex. */
export function encodeScriptNum(n: number): string {
  if (n === 0) return '';
  const bytes: number[] = [];
  let abs = Math.abs(n);
  while (abs > 0) {
    bytes.push(abs & 0xff);
    abs = Math.floor(abs / 256);
  }
  if (bytes[bytes.length - 1]! & 0x80) bytes.push(n < 0 ? 0x80 : 0);
  else if (n < 0) bytes[bytes.length - 1]! |= 0x80;
  return bytesToHex(new Uint8Array(bytes));
}

/** Dekodiert eine Script-Zahl aus Hex (höchstens 4 Byte wie in Bitcoin). */
export function decodeScriptNum(hex: string): number {
  const bytes = hexToBytes(hex);
  if (bytes.length > 4) throw new ScriptError('Zahl ist länger als 4 Byte.');
  if (bytes.length === 0) return 0;
  let n = 0;
  for (let i = bytes.length - 1; i >= 0; i--) n = n * 256 + bytes[i]!;
  const last = bytes[bytes.length - 1]!;
  if (last & 0x80) return -(n - 0x80 * 256 ** (bytes.length - 1));
  return n;
}

function isTrue(hex: string): boolean {
  const bytes = hexToBytes(hex);
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) return !(i === bytes.length - 1 && bytes[i] === 0x80);
  }
  return false;
}

function isData(token: string): boolean {
  return /^([0-9a-fA-F]{2})+$/.test(token);
}

/** Zerlegt einen Skript-Text an Leerzeichen in Tokens. */
export function parseScript(text: string): string[] {
  return text.trim().split(/\s+/).filter((t) => t.length > 0);
}

/** Fügt Tokens zu einem Skript-Text zusammen. */
export function formatScript(tokens: string[]): string {
  return tokens.join(' ');
}

/** Sperr-Skript Pay-to-Public-Key: `<pub> OP_CHECKSIG`. */
export function p2pkScriptPubKey(pubHex: string): string[] {
  return [pubHex.toLowerCase(), 'OP_CHECKSIG'];
}

/** Entsperr-Skript für P2PK: nur die Signatur. */
export function p2pkScriptSig(sigHex: string): string[] {
  return [sigHex.toLowerCase()];
}

/** Sperr-Skript Pay-to-Public-Key-Hash; nimmt einen Public Key oder direkt dessen HASH160 (40 Hex). */
export function p2pkhScriptPubKey(pubOrHash: string): string[] {
  const hash = pubOrHash.length === 40 ? pubOrHash.toLowerCase() : hash160Hex(hexToBytes(pubOrHash));
  return ['OP_DUP', 'OP_HASH160', hash, 'OP_EQUALVERIFY', 'OP_CHECKSIG'];
}

/** Entsperr-Skript für P2PKH: `<sig> <pub>`. */
export function p2pkhScriptSig(sigHex: string, pubHex: string): string[] {
  return [sigHex.toLowerCase(), pubHex.toLowerCase()];
}

function pop(stack: string[], token: string): string {
  const top = stack.pop();
  if (top === undefined) throw new ScriptError(`${token}: Der Stapel ist leer.`);
  return top;
}

function run(token: string, stack: string[], ctx: ScriptContext | undefined): string {
  if (isData(token)) {
    stack.push(token.toLowerCase());
    return `Daten (${token.length / 2} Byte) auf den Stapel legen.`;
  }
  const small = /^OP_(\d+)$/.exec(token);
  if (small) {
    const n = Number(small[1]);
    if (n > 16) throw new ScriptError(`Unbekannter Opcode: ${token}`);
    stack.push(encodeScriptNum(n));
    return `Zahl ${n} auf den Stapel legen.`;
  }
  switch (token) {
    case 'OP_DUP': {
      const top = pop(stack, token);
      stack.push(top, top);
      return 'Oberstes Element verdoppeln.';
    }
    case 'OP_HASH160':
      stack.push(hash160Hex(hexToBytes(pop(stack, token))));
      return 'Oberstes Element durch RIPEMD-160(SHA-256(x)) ersetzen.';
    case 'OP_SHA256':
      stack.push(sha256Hex(hexToBytes(pop(stack, token))));
      return 'Oberstes Element durch SHA-256(x) ersetzen.';
    case 'OP_EQUAL':
    case 'OP_EQUALVERIFY': {
      const b = pop(stack, token);
      const a = pop(stack, token);
      const equal = a === b;
      if (token === 'OP_EQUALVERIFY') {
        if (!equal) throw new ScriptError('OP_EQUALVERIFY: Die beiden obersten Elemente sind verschieden.');
        return 'Die beiden obersten Elemente sind gleich, weiter.';
      }
      stack.push(equal ? '01' : '');
      return equal ? 'Gleich: 1 (wahr) auf den Stapel.' : 'Verschieden: 0 (falsch) auf den Stapel.';
    }
    case 'OP_VERIFY':
      if (!isTrue(pop(stack, token))) throw new ScriptError('OP_VERIFY: Das oberste Element ist falsch.');
      return 'Oberstes Element ist wahr, weiter.';
    case 'OP_CHECKSIG': {
      const pub = pop(stack, token);
      const sig = pop(stack, token);
      if (!ctx) throw new ScriptError('OP_CHECKSIG: Kein Nachrichten-Hash im Kontext.');
      const valid = verifySignature(pub, ctx.messageHash, sig);
      stack.push(valid ? '01' : '');
      return valid
        ? 'Signatur passt zu Public Key und Transaktion: 1 (wahr).'
        : 'Signatur passt nicht zu Public Key und Transaktion: 0 (falsch).';
    }
    case 'OP_ADD':
    case 'OP_SUB': {
      const b = decodeScriptNum(pop(stack, token));
      const a = decodeScriptNum(pop(stack, token));
      const r = token === 'OP_ADD' ? a + b : a - b;
      stack.push(encodeScriptNum(r));
      return `${a} ${token === 'OP_ADD' ? '+' : '-'} ${b} = ${r}`;
    }
    case 'OP_RETURN':
      throw new ScriptError('OP_RETURN: Dieser Output kann nie ausgegeben werden.');
    default:
      throw new ScriptError(`Unbekannter Opcode: ${token}`);
  }
}

/** Führt scriptSig und danach scriptPubKey aus und protokolliert jeden Schritt. */
export function execute(
  scriptSig: string[] | string,
  scriptPubKey: string[] | string,
  ctx?: ScriptContext,
): ScriptResult {
  const phases: [ScriptStep['phase'], string[]][] = [
    ['scriptSig', typeof scriptSig === 'string' ? parseScript(scriptSig) : scriptSig],
    ['scriptPubKey', typeof scriptPubKey === 'string' ? parseScript(scriptPubKey) : scriptPubKey],
  ];
  const stack: string[] = [];
  const steps: ScriptStep[] = [];
  for (const [phase, tokens] of phases) {
    for (const raw of tokens) {
      const token = isData(raw) ? raw : raw.toUpperCase();
      try {
        const note = run(token, stack, ctx);
        steps.push({ token, phase, stackAfter: [...stack], note });
      } catch (e) {
        if (!(e instanceof ScriptError)) throw e;
        steps.push({ token, phase, stackAfter: [...stack], note: e.message });
        return { ok: false, steps, error: e.message };
      }
    }
  }
  if (stack.length === 0) return { ok: false, steps, error: 'Am Ende ist der Stapel leer.' };
  if (!isTrue(stack[stack.length - 1]!)) {
    return { ok: false, steps, error: 'Am Ende liegt „falsch“ oben auf dem Stapel.' };
  }
  return { ok: true, steps };
}
