import { sha256 } from '@noble/hashes/sha2.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export { bytesToHex, hexToBytes };

/** Eingabe für Hashfunktionen: Text (wird als UTF-8 kodiert) oder rohe Bytes. */
export type HashInput = string | Uint8Array;

function toBytes(input: HashInput): Uint8Array {
  return typeof input === 'string' ? utf8ToBytes(input) : input;
}

/** Berechnet SHA-256 und liefert die rohen 32 Byte. */
export function sha256Bytes(input: HashInput): Uint8Array {
  return sha256(toBytes(input));
}

/** Berechnet doppeltes SHA-256 (SHA-256 von SHA-256) und liefert die rohen 32 Byte. */
export function sha256dBytes(input: HashInput): Uint8Array {
  return sha256(sha256(toBytes(input)));
}

/** Berechnet HASH160 = RIPEMD-160(SHA-256(x)) und liefert die rohen 20 Byte. */
export function hash160Bytes(input: HashInput): Uint8Array {
  return ripemd160(sha256(toBytes(input)));
}

/** SHA-256 als Hex-String; Strings werden als UTF-8-Text gehasht, nicht als Hex. */
export function sha256Hex(input: HashInput): string {
  return bytesToHex(sha256Bytes(input));
}

/** Doppeltes SHA-256 als Hex-String, wie Bitcoin es für TxIDs und Blockhashes nutzt. */
export function sha256dHex(input: HashInput): string {
  return bytesToHex(sha256dBytes(input));
}

/** RIPEMD-160 als Hex-String. */
export function ripemd160Hex(input: HashInput): string {
  return bytesToHex(ripemd160(toBytes(input)));
}

/** HASH160 (RIPEMD-160 von SHA-256) als Hex-String, Grundlage von P2PKH-Adressen. */
export function hash160Hex(input: HashInput): string {
  return bytesToHex(hash160Bytes(input));
}

/** Dreht die Byte-Reihenfolge eines Hex-Strings um (z. B. interne Reihenfolge ↔ Anzeige). */
export function reverseHex(hex: string): string {
  return bytesToHex(hexToBytes(hex).reverse());
}

/** Wandelt einen Hex-String in eine Folge aus Nullen und Einsen um (4 Bit je Hex-Zeichen). */
export function toBitString(hex: string): string {
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error(`Kein gültiger Hex-String: ${hex}`);
  return Array.from(hex, (c) => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
}

/** Zählt, in wie vielen Bits sich zwei gleich lange Hex-Strings unterscheiden. */
export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) throw new Error('Hex-Strings müssen gleich lang sein.');
  const bitsA = toBitString(a);
  const bitsB = toBitString(b);
  let distance = 0;
  for (let i = 0; i < bitsA.length; i++) if (bitsA[i] !== bitsB[i]) distance++;
  return distance;
}
