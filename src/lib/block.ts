import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { bytesToHex, hexToBytes, sha256dBytes } from './hash';
import { toInternal } from './merkle';
import { NULL_TXID } from './transaction';

/**
 * Blockheader, Schwierigkeit, Mining und Geldmenge wie in Bitcoin. `prevHash`, `merkleRoot`
 * und Blockhashes sind Hex in Anzeige-Reihenfolge (wie im Block-Explorer). Geldbeträge sind
 * ganze Satoshi als `number` (die Gesamtmenge liegt unter 2^53, also exakt darstellbar).
 */

/** Die sechs Felder eines Bitcoin-Blockheaders. */
export interface BlockHeader {
  version: number;
  prevHash: string;
  merkleRoot: string;
  timestamp: number;
  nBits: number;
  nonce: number;
}

/** Optionen für einen Mining-Abschnitt. */
export interface MineOptions {
  maxIterations: number;
  startNonce?: number;
  /** Überschreibt das Ziel aus `header.nBits`, z. B. für eine leichte Demo. */
  target?: bigint;
}

/** Ergebnis eines Mining-Abschnitts; `nonce`/`hash` sind der Treffer oder der zuletzt probierte Wert. */
export interface MineResult {
  found: boolean;
  nonce: number;
  hash: string;
  iterations: number;
  /** Nonce, mit der der nächste Abschnitt weitermacht. */
  nextNonce: number;
  /** true, wenn alle 2^32 Nonces durchprobiert sind. */
  exhausted: boolean;
  /**
   * Verteilung der probierten Hashes nach führenden Null-Hexzeichen: `zeroHist[z]` ist die
   * Zahl der Hashes mit genau z Nullen vorne (z von 0 bis 16). Für Diagramme in Demos.
   */
  zeroHist: number[];
}

/** Zählt die führenden Null-Hexzeichen eines Hashes (Anzeige-Reihenfolge), höchstens 16. */
export function leadingZeroNibbles(hash: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < 8; i++) {
    const b = hash[i]!;
    if (b === 0) {
      n += 2;
      continue;
    }
    if (b < 16) n += 1;
    break;
  }
  return n;
}

/** Zählt die führenden Null-Hexzeichen eines Hex-Strings (ohne Obergrenze). */
export function leadingZeroHexDigits(hex: string): number {
  return hex.match(/^0*/)![0].length;
}

/** Ziel für eine Demo-Schwierigkeit: der größte Hash mit `n` führenden Null-Hexzeichen (n Nullen, danach lauter f). */
export function targetForZeroNibbles(n: number): bigint {
  return 2n ** BigInt(256 - 4 * n) - 1n;
}

/** Hat der Hash (Bytes in Anzeige-Reihenfolge) mindestens `zeros` führende Null-Hexzeichen? */
function hasLeadingZeroNibbles(hash: Uint8Array, zeros: number): boolean {
  const full = zeros >> 1;
  for (let i = 0; i < full; i++) if (hash[i] !== 0) return false;
  return zeros % 2 === 0 || hash[full]! < 16;
}

/** Null-Hash (64 Nullen), z. B. als Vorgänger des ersten Blocks. */
export const ZERO_HASH = NULL_TXID;
/** Satoshi pro Bitcoin. */
export const SATOSHI_PER_BTC = 100_000_000;
/** Blockbelohnung der ersten Epoche in Satoshi (50 BTC). */
export const INITIAL_SUBSIDY_SAT = 5_000_000_000;
/** Obergrenze der Geldmenge in BTC (gerundet, genau sind es knapp 21 Mio.). */
export const MAX_SUPPLY_BTC = 21_000_000;
/** Blöcke zwischen zwei Halbierungen der Blockbelohnung. */
export const HALVING_INTERVAL = 210_000;
/** nBits der Mindestschwierigkeit 1 (Genesis-Block). */
export const MAX_TARGET_NBITS = 0x1d00ffff;
/** Soll-Dauer einer Schwierigkeitsperiode: 2016 Blöcke à 10 Minuten in Sekunden. */
export const EXPECTED_RETARGET_SECONDS = 1_209_600;

/** Serialisiert den Header in die 80 Byte, die Bitcoin hasht (Zahlen Little Endian). */
export function serializeHeader(header: BlockHeader): Uint8Array {
  const out = new Uint8Array(80);
  const view = new DataView(out.buffer);
  view.setInt32(0, header.version, true);
  out.set(toInternal(header.prevHash), 4);
  out.set(toInternal(header.merkleRoot), 36);
  view.setUint32(68, header.timestamp, true);
  view.setUint32(72, header.nBits, true);
  view.setUint32(76, header.nonce, true);
  return out;
}

/** Berechnet den Blockhash (doppeltes SHA-256) in Anzeige-Reihenfolge. */
export function headerHash(header: BlockHeader): string {
  return bytesToHex(sha256dBytes(serializeHeader(header)).reverse());
}

/** Wandelt das kompakte nBits-Format in das volle 256-Bit-Ziel um. */
export function nBitsToTarget(nBits: number): bigint {
  const exponent = nBits >>> 24;
  const mantissa = nBits & 0x007fffff;
  if (nBits & 0x00800000) throw new Error('Negative Ziele werden nicht unterstützt.');
  const m = BigInt(mantissa);
  return exponent <= 3 ? m >> BigInt(8 * (3 - exponent)) : m << BigInt(8 * (exponent - 3));
}

/** Wandelt ein Ziel in das kompakte nBits-Format um (verliert Genauigkeit wie in Bitcoin). */
export function targetToNBits(target: bigint): number {
  if (target < 0n) throw new Error('Das Ziel darf nicht negativ sein.');
  let size = target === 0n ? 0 : target.toString(16).length;
  size = Math.ceil(size / 2);
  let compact = size <= 3 ? target << BigInt(8 * (3 - size)) : target >> BigInt(8 * (size - 3));
  if (compact & 0x00800000n) {
    compact >>= 8n;
    size++;
  }
  return ((size << 24) | Number(compact)) >>> 0;
}

/** Ergebnis eines Text-Mining-Abschnitts (Lehr-Demos): Treffer oder zuletzt probierte Nonce. */
export interface TextMineResult {
  found: boolean;
  nonce: number;
  hash: string;
  iterations: number;
  nextNonce: number;
}

/**
 * Vereinfachtes Mining für Demos: probiert ab `startNonce` bis zu `maxIterations` Nonces, bis
 * SHA-256(prefix + nonce) mit `zeros` Null-Hexzeichen beginnt. In Abschnitten aufrufbar.
 * Der gleichbleibende Präfix wird nur einmal gehasht (Midstate), Hex nur für das Ergebnis gebildet.
 */
export function mineText(
  prefix: string,
  zeros: number,
  options: { maxIterations: number; startNonce?: number },
): TextMineResult {
  const midstate = sha256.create().update(utf8ToBytes(prefix));
  let nonce = options.startNonce ?? 0;
  let last: Uint8Array | null = null;
  let iterations = 0;
  while (iterations < options.maxIterations) {
    last = midstate.clone().update(utf8ToBytes(String(nonce))).digest();
    iterations++;
    if (hasLeadingZeroNibbles(last, zeros)) return { found: true, nonce, hash: bytesToHex(last), iterations, nextNonce: nonce + 1 };
    nonce++;
  }
  return { found: false, nonce: nonce - 1, hash: last ? bytesToHex(last) : '', iterations, nextNonce: nonce };
}

/** Größtes erlaubtes Ziel (Schwierigkeit 1). */
export const MAX_TARGET = nBitsToTarget(MAX_TARGET_NBITS);

/** Schwierigkeit relativ zu 0x1d00ffff: wie viel mal kleiner das Ziel als das Maximalziel ist. */
export function difficulty(nBits: number): number {
  const target = nBitsToTarget(nBits);
  if (target === 0n) throw new Error('Ziel 0 hat keine endliche Schwierigkeit.');
  return Number(MAX_TARGET) / Number(target);
}

/** Prüft, ob ein Hash (Anzeige-Hex) als Zahl kleiner oder gleich dem Ziel ist. */
export function meetsTarget(hashHex: string, target: bigint): boolean {
  return BigInt('0x' + hashHex) <= target;
}

function targetBytes(target: bigint): Uint8Array {
  return hexToBytes(target.toString(16).padStart(64, '0').slice(-64));
}

/** Probiert ab `startNonce` bis zu `maxIterations` Nonces; in Abschnitten aufrufbar (Web Worker). */
export function mineHeader(header: BlockHeader, options: MineOptions): MineResult {
  const target = options.target ?? nBitsToTarget(header.nBits);
  const targetBe = targetBytes(target);
  const bytes = serializeHeader(header);
  const view = new DataView(bytes.buffer);
  let nonce = options.startNonce ?? header.nonce;
  let lastNonce = nonce;
  let lastHash: Uint8Array = new Uint8Array(32);
  let iterations = 0;
  const zeroHist = new Array<number>(17).fill(0);
  while (iterations < options.maxIterations && nonce <= 0xffffffff) {
    view.setUint32(76, nonce, true);
    const hash = sha256dBytes(bytes).reverse();
    iterations++;
    lastNonce = nonce;
    lastHash = hash;
    nonce++;
    zeroHist[leadingZeroNibbles(hash)]!++;
    let below = true;
    for (let i = 0; i < 32; i++) {
      if (hash[i] !== targetBe[i]) {
        below = hash[i]! < targetBe[i]!;
        break;
      }
    }
    if (below) {
      return { found: true, nonce: lastNonce, hash: bytesToHex(hash), iterations, nextNonce: nonce, exhausted: false, zeroHist };
    }
  }
  return {
    found: false,
    nonce: lastNonce,
    hash: bytesToHex(lastHash),
    iterations,
    nextNonce: nonce,
    exhausted: nonce > 0xffffffff,
    zeroHist,
  };
}

/** Blockbelohnung (Subvention) in Satoshi: 50 BTC, halbiert alle 210000 Blöcke, abgerundet. */
export function blockSubsidy(height: number): number {
  if (!Number.isSafeInteger(height) || height < 0) throw new Error('Die Blockhöhe muss eine ganze Zahl ≥ 0 sein.');
  const halvings = Math.floor(height / HALVING_INTERVAL);
  if (halvings >= 64) return 0;
  return Number(BigInt(INITIAL_SUBSIDY_SAT) >> BigInt(halvings));
}

/** Summe aller Subventionen der Blöcke 0 bis einschließlich `height` in Satoshi. */
export function totalSupply(height: number): number {
  if (!Number.isSafeInteger(height) || height < 0) throw new Error('Die Blockhöhe muss eine ganze Zahl ≥ 0 sein.');
  let total = 0;
  for (let era = 0; era * HALVING_INTERVAL <= height && era < 64; era++) {
    const first = era * HALVING_INTERVAL;
    const last = Math.min(height, first + HALVING_INTERVAL - 1);
    total += (last - first + 1) * blockSubsidy(first);
  }
  return total;
}

/**
 * Neues Ziel nach einer Periode: altes Ziel · tatsächliche Dauer / Soll-Dauer. Die Dauer wird
 * auf ein Viertel bis Vierfache der Soll-Dauer begrenzt, das Ergebnis auf `maxTarget`.
 */
export function retarget(
  oldTarget: bigint,
  actualSeconds: number,
  expectedSeconds = EXPECTED_RETARGET_SECONDS,
  maxTarget = MAX_TARGET,
): bigint {
  const clamped = Math.min(Math.max(actualSeconds, expectedSeconds / 4), expectedSeconds * 4);
  const next = (oldTarget * BigInt(Math.round(clamped))) / BigInt(Math.round(expectedSeconds));
  return next > maxTarget ? maxTarget : next;
}
