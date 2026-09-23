import { describe, expect, it } from 'vitest';
import {
  EXPECTED_RETARGET_SECONDS,
  MAX_TARGET,
  SATOSHI_PER_BTC,
  blockSubsidy,
  difficulty,
  headerHash,
  leadingZeroNibbles,
  meetsTarget,
  mineHeader,
  mineText,
  nBitsToTarget,
  retarget,
  serializeHeader,
  targetToNBits,
  totalSupply,
  type BlockHeader,
} from './block';

const hexPairs = (hex: string) => hex.match(/../g)!.map((h) => parseInt(h, 16));

const genesis: BlockHeader = {
  version: 1,
  prevHash: '0'.repeat(64),
  merkleRoot: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b',
  timestamp: 1231006505,
  nBits: 0x1d00ffff,
  nonce: 2083236893,
};
const GENESIS_HASH = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';

describe('block', () => {
  it('Genesis-Header: 80 Byte und bekannter Hash', () => {
    expect(serializeHeader(genesis)).toHaveLength(80);
    expect(headerHash(genesis)).toBe(GENESIS_HASH);
    expect(meetsTarget(GENESIS_HASH, nBitsToTarget(genesis.nBits))).toBe(true);
  });

  it('nBits ↔ Target', () => {
    expect(nBitsToTarget(0x1d00ffff)).toBe(0xffffn << 208n);
    expect(nBitsToTarget(0x1d00ffff).toString(16).padStart(64, '0')).toBe('00000000ffff' + '0'.repeat(52));
    expect(targetToNBits(nBitsToTarget(0x1d00ffff))).toBe(0x1d00ffff);
    // Block 100000
    expect(targetToNBits(nBitsToTarget(0x1b04864c))).toBe(0x1b04864c);
    expect(targetToNBits(0x80n)).toBe(0x02008000);
  });

  it('Schwierigkeit relativ zu 0x1d00ffff', () => {
    expect(difficulty(0x1d00ffff)).toBe(1);
    expect(difficulty(0x1b04864c)).toBeCloseTo(14484.162361225399, 6);
  });

  it('mineHeader findet mit leichtem Ziel eine gültige Nonce', () => {
    const easy = { ...genesis, nBits: 0x1f00ffff, nonce: 0 };
    const r = mineHeader(easy, { maxIterations: 100_000 });
    expect(r.found).toBe(true);
    expect(r.iterations).toBeLessThan(100_000);
    expect(headerHash({ ...easy, nonce: r.nonce })).toBe(r.hash);
    expect(meetsTarget(r.hash, nBitsToTarget(easy.nBits))).toBe(true);
  });

  it('mineHeader lässt sich in Abschnitten fortsetzen und findet die Genesis-Nonce', () => {
    const start = genesis.nonce - 5;
    const first = mineHeader(genesis, { maxIterations: 3, startNonce: start });
    expect(first).toMatchObject({ found: false, iterations: 3, nextNonce: start + 3 });
    const second = mineHeader(genesis, { maxIterations: 10, startNonce: first.nextNonce });
    expect(second).toMatchObject({ found: true, nonce: genesis.nonce, hash: GENESIS_HASH, iterations: 3 });
    const end = mineHeader(genesis, { maxIterations: 10, startNonce: 0xfffffffe, target: 0n });
    expect(end).toMatchObject({ found: false, iterations: 2, exhausted: true });
  });

  it('zählt führende Null-Hexzeichen und sammelt sie beim Mining', () => {
    expect(leadingZeroNibbles(new Uint8Array(32))).toBe(16);
    expect(leadingZeroNibbles(new Uint8Array([0, 0x0f, 1]))).toBe(3);
    expect(leadingZeroNibbles(new Uint8Array([0x10]))).toBe(0);
    const r = mineHeader(genesis, { maxIterations: 1000, startNonce: 0, target: 0n });
    expect(r.zeroHist).toHaveLength(17);
    expect(r.zeroHist.reduce((a, b) => a + b, 0)).toBe(1000);
    // Etwa 15/16 aller Hashes beginnen nicht mit einer Null.
    expect(r.zeroHist[0]).toBeGreaterThan(850);
    const hit = mineHeader(genesis, { maxIterations: 10, startNonce: genesis.nonce - 2 });
    expect(hit.found).toBe(true);
    expect(hit.zeroHist[leadingZeroNibbles(new Uint8Array(hexPairs(GENESIS_HASH)))]).toBe(1);
  });

  it('Blockbelohnung halbiert sich', () => {
    expect(blockSubsidy(0)).toBe(50 * SATOSHI_PER_BTC);
    expect(blockSubsidy(209_999)).toBe(50 * SATOSHI_PER_BTC);
    expect(blockSubsidy(210_000)).toBe(25 * SATOSHI_PER_BTC);
    expect(blockSubsidy(840_000)).toBe(3.125 * SATOSHI_PER_BTC);
    expect(blockSubsidy(64 * 210_000)).toBe(0);
  });

  it('Gesamtmenge konvergiert unter 21 Mio. BTC', () => {
    expect(totalSupply(0)).toBe(50 * SATOSHI_PER_BTC);
    expect(totalSupply(209_999)).toBe(210_000 * 50 * SATOSHI_PER_BTC);
    const final = totalSupply(10_000_000);
    expect(final).toBe(2_099_999_997_690_000);
    expect(final).toBeLessThan(21_000_000 * SATOSHI_PER_BTC);
  });

  it('retarget passt das Ziel an und begrenzt auf Faktor 4', () => {
    const t = nBitsToTarget(0x1b04864c);
    expect(retarget(t, EXPECTED_RETARGET_SECONDS)).toBe(t);
    expect(retarget(t, EXPECTED_RETARGET_SECONDS / 2)).toBe(t / 2n);
    expect(retarget(t, EXPECTED_RETARGET_SECONDS / 100)).toBe(t / 4n);
    expect(retarget(t, EXPECTED_RETARGET_SECONDS * 100)).toBe(t * 4n);
    expect(retarget(MAX_TARGET, EXPECTED_RETARGET_SECONDS * 2)).toBe(MAX_TARGET);
  });

  it('mineText: findet die Nonce ab Startwert und setzt Abschnitte fort', () => {
    // Nonces aus KettenDemo: 65131 ist die kleinste Nonce ab 0 für Block 1.
    const prefix = '1|' + '0'.repeat(64) + '|Coinbase: 50 BTC an Alice|';
    const first = mineText(prefix, 4, { maxIterations: 60_000 });
    expect(first.found).toBe(false);
    expect(first.nextNonce).toBe(60_000);
    const second = mineText(prefix, 4, { maxIterations: 60_000, startNonce: first.nextNonce });
    expect(second).toMatchObject({ found: true, nonce: 65131, iterations: 5132 });
    expect(second.hash.startsWith('0000')).toBe(true);
    // Ab 65132 findet die Suche eine andere Nonce, nie wieder die alte.
    const later = mineText(prefix, 4, { maxIterations: 1_000_000, startNonce: 65132 });
    expect(later.found).toBe(true);
    expect(later.nonce).toBeGreaterThan(65131);
  });
});
