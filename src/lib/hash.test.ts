import { describe, expect, it } from 'vitest';
import {
  hammingDistanceHex,
  hash160Hex,
  hexToBytes,
  reverseHex,
  ripemd160Hex,
  sha256dHex,
  sha256Hex,
  toBitString,
} from './hash';

describe('hash', () => {
  it('SHA-256 von "abc" und ""', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('String- und Byte-Eingabe liefern dasselbe', () => {
    expect(sha256Hex(new Uint8Array([0x61, 0x62, 0x63]))).toBe(sha256Hex('abc'));
  });

  it('doppeltes SHA-256 von "hello"', () => {
    expect(sha256dHex('hello')).toBe('9595c9df90075148eb06860365df33584b75bff782a510c6cd4883a419833d50');
  });

  it('RIPEMD-160 von ""', () => {
    expect(ripemd160Hex('')).toBe('9c1185a5c5e9fc54612808977ee8f548b2258d31');
  });

  it('HASH160 eines komprimierten Public Keys (Mastering Bitcoin, Kap. 4)', () => {
    const pub = hexToBytes('03f028892bad7ed57d2fb57bf33081d5cfcf6f9ed3d3d7f159c2e2fff579dc341a');
    expect(hash160Hex(pub)).toBe('bbc1e42a39d05a4cc61752d6963b7f69d09bb27b');
  });

  it('reverseHex dreht Bytes, nicht Zeichen', () => {
    expect(reverseHex('0102ab')).toBe('ab0201');
  });

  it('toBitString und Hamming-Abstand', () => {
    expect(toBitString('a5')).toBe('10100101');
    expect(hammingDistanceHex('00', 'ff')).toBe(8);
    expect(hammingDistanceHex('a5', 'a5')).toBe(0);
    expect(() => hammingDistanceHex('00', '0000')).toThrow();
  });
});
