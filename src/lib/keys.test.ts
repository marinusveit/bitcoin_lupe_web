import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash';
import {
  addressP2PKH,
  base58CheckDecode,
  base58Decode,
  base58Encode,
  privateKeyFromHex,
  publicKey,
  randomPrivateKey,
  signMessage,
  verifySignature,
  wif,
} from './keys';

// Mastering Bitcoin, Kap. 4; Adressen und WIF mit bitcoinjs-lib gegengeprüft.
const PRIV = '1E99423A4ED27608A15A2616A2B0E9E52CED330AC530EDCC32C8FFC6A526AEDD';
const X = 'f028892bad7ed57d2fb57bf33081d5cfcf6f9ed3d3d7f159c2e2fff579dc341a';

describe('keys', () => {
  it('Public Key aus dem Private Key (komprimiert und unkomprimiert)', () => {
    expect(publicKey(PRIV)).toBe('03' + X);
    expect(publicKey(PRIV, false)).toBe(
      '04' + X + '07cf33da18bd734c600b96a72bbc4749d5141c90ec8ac328ae52ddfe2e505bdb',
    );
  });

  it('P2PKH-Adressen', () => {
    expect(addressP2PKH(publicKey(PRIV))).toBe('1J7mdg5rbQyUHENYdx39WVWK7fsLpEoXZy');
    expect(addressP2PKH(publicKey(PRIV, false))).toBe('1424C2F4bC9JidNjjTUZCbUxv6Sa1Mt62x');
  });

  it('WIF', () => {
    expect(wif(PRIV)).toBe('KxFC1jmwwCoACiCAWZ3eXa96mBM6tb3TYzGmf6YwgdGWZgawvrtJ');
    expect(wif(PRIV, false)).toBe('5J3mBbAH58CpQ3Y5RNJpUKPE62SQ5tfcvU2JpbnkeyhfsYB1Jcn');
  });

  it('Base58 mit führenden Nullen und Base58Check-Prüfsumme', () => {
    const bytes = new Uint8Array([0, 0, 1, 2, 255]);
    expect(base58Encode(bytes).startsWith('11')).toBe(true);
    expect(Array.from(base58Decode(base58Encode(bytes)))).toEqual(Array.from(bytes));
    expect(base58CheckDecode('1J7mdg5rbQyUHENYdx39WVWK7fsLpEoXZy')[0]).toBe(0);
    expect(() => base58CheckDecode('1J7mdg5rbQyUHENYdx39WVWK7fsLpEoXZz')).toThrow();
  });

  it('ungültige Private Keys werden abgelehnt', () => {
    expect(() => privateKeyFromHex('00'.repeat(32))).toThrow();
    expect(() => privateKeyFromHex('xyz')).toThrow();
    expect(privateKeyFromHex(randomPrivateKey())).toHaveLength(64);
  });

  it('Signatur ist deterministisch, verifiziert und scheitert bei manipulierter Nachricht', () => {
    const hash = sha256Hex('Alice zahlt Bob 1 BTC');
    const pub = publicKey(PRIV);
    const sig = signMessage(PRIV, hash);
    expect(sig.startsWith('30')).toBe(true);
    expect(signMessage(PRIV, hash)).toBe(sig);
    expect(verifySignature(pub, hash, sig)).toBe(true);
    expect(verifySignature(pub, sha256Hex('Alice zahlt Bob 9 BTC'), sig)).toBe(false);
    const compact = signMessage(PRIV, hash, 'compact');
    expect(compact).toHaveLength(128);
    expect(verifySignature(pub, hash, compact)).toBe(true);
    expect(verifySignature(publicKey(randomPrivateKey()), hash, sig)).toBe(false);
    expect(verifySignature(pub, hash, 'kaputt')).toBe(false);
  });
});
