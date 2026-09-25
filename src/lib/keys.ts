import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, hash160Bytes, hexToBytes, sha256dBytes } from './hash';

/**
 * Schlüssel und Signaturen auf secp256k1. Alle Schlüssel, Hashes und Signaturen sind
 * Hex-Strings. Signaturen sind ECDSA nach RFC 6979 (deterministisch, gleiche Eingabe
 * ergibt gleiche Signatur) mit niedrigem s-Wert wie in Bitcoin, standardmäßig DER-kodiert.
 * Der Nachrichten-Hash wird direkt signiert, also nicht noch einmal gehasht.
 */

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Ausgabeformat einer Signatur: DER (wie in Bitcoin-Transaktionen) oder kompakt (r‖s, 64 Byte). */
export type SignatureFormat = 'der' | 'compact';

/** Erzeugt einen zufälligen gültigen Private Key (32 Byte als Hex). */
export function randomPrivateKey(): string {
  return bytesToHex(secp256k1.utils.randomSecretKey());
}

/** Prüft einen Private Key in Hex und gibt ihn normalisiert (klein geschrieben) zurück. */
export function privateKeyFromHex(hex: string): string {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean) || !secp256k1.utils.isValidSecretKey(hexToBytes(clean))) {
    throw new Error('Ungültiger Private Key: erwartet werden 64 Hex-Zeichen zwischen 1 und n-1.');
  }
  return clean;
}

/** Berechnet den Public Key (komprimiert 33 Byte, sonst 65 Byte) als Hex. */
export function publicKey(privHex: string, compressed = true): string {
  return bytesToHex(secp256k1.getPublicKey(hexToBytes(privateKeyFromHex(privHex)), compressed));
}

/** Signiert einen 32-Byte-Nachrichten-Hash deterministisch und liefert die Signatur als Hex. */
export function signMessage(privHex: string, msgHashHex: string, format: SignatureFormat = 'der'): string {
  const sig = secp256k1.sign(hexToBytes(msgHashHex), hexToBytes(privateKeyFromHex(privHex)), {
    prehash: false,
    lowS: true,
    format,
  });
  return bytesToHex(sig);
}

/** Kodiert eine kompakte Signatur (r‖s, 128 Hex-Zeichen) ohne neue Kurvenrechnung in DER um. */
export function signatureToDer(compactHex: string): string {
  return bytesToHex(secp256k1.Signature.fromBytes(hexToBytes(compactHex), 'compact').toBytes('der'));
}

/** Koordinaten des Public Keys (komprimiert oder unkomprimiert in Hex) als Punkt auf der Kurve. */
export function publicKeyPoint(pubHex: string): { x: bigint; y: bigint } {
  return secp256k1.Point.fromHex(pubHex).toAffine();
}

/** Prüft eine Signatur (DER oder kompakt, automatisch erkannt); fehlerhafte Eingaben ergeben false. */
export function verifySignature(pubHex: string, msgHashHex: string, sigHex: string): boolean {
  try {
    const format: SignatureFormat = sigHex.length === 128 ? 'compact' : 'der';
    return secp256k1.verify(hexToBytes(sigHex), hexToBytes(msgHashHex), hexToBytes(pubHex), {
      prehash: false,
      format,
      // Bitcoin akzeptiert nach Konsens auch High-S-Signaturen (Low-S ist nur Standardregel).
      lowS: false,
    });
  } catch {
    return false;
  }
}

/** Kodiert Bytes in Base58 (führende Nullbytes werden zu „1“). */
export function base58Encode(bytes: Uint8Array): string {
  let num = 0n;
  for (const b of bytes) num = (num << 8n) | BigInt(b);
  let out = '';
  while (num > 0n) {
    out = BASE58_ALPHABET[Number(num % 58n)] + out;
    num /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

/** Dekodiert einen Base58-String in Bytes. */
export function base58Decode(text: string): Uint8Array {
  let num = 0n;
  for (const c of text) {
    const digit = BASE58_ALPHABET.indexOf(c);
    if (digit < 0) throw new Error(`Ungültiges Base58-Zeichen: ${c}`);
    num = num * 58n + BigInt(digit);
  }
  const body: number[] = [];
  while (num > 0n) {
    body.unshift(Number(num & 0xffn));
    num >>= 8n;
  }
  let zeros = 0;
  while (text[zeros] === '1') zeros++;
  return new Uint8Array([...new Array<number>(zeros).fill(0), ...body]);
}

/** Base58Check: hängt die ersten 4 Byte von SHA-256d als Prüfsumme an und kodiert Base58. */
export function base58CheckEncode(payload: Uint8Array): string {
  const checksum = sha256dBytes(payload).slice(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload, 0);
  full.set(checksum, payload.length);
  return base58Encode(full);
}

/** Dekodiert Base58Check und prüft die Prüfsumme; liefert die Nutzdaten ohne Prüfsumme. */
export function base58CheckDecode(text: string): Uint8Array {
  const full = base58Decode(text);
  if (full.length < 4) throw new Error('Base58Check-Daten sind zu kurz.');
  const payload = full.slice(0, -4);
  const expected = bytesToHex(sha256dBytes(payload).slice(0, 4));
  if (bytesToHex(full.slice(-4)) !== expected) throw new Error('Prüfsumme stimmt nicht.');
  return payload;
}

/** Bildet die P2PKH-Adresse (Mainnet, Versionsbyte 0x00) zu einem Public Key in Hex. */
export function addressP2PKH(pubHex: string): string {
  const payload = new Uint8Array(21);
  payload[0] = 0x00;
  payload.set(hash160Bytes(hexToBytes(pubHex)), 1);
  return base58CheckEncode(payload);
}

/** Kodiert einen Private Key im Wallet Import Format (Mainnet, Präfix 0x80). */
export function wif(privHex: string, compressed = true): string {
  const key = hexToBytes(privateKeyFromHex(privHex));
  const payload = new Uint8Array(compressed ? 34 : 33);
  payload[0] = 0x80;
  payload.set(key, 1);
  if (compressed) payload[33] = 0x01;
  return base58CheckEncode(payload);
}
