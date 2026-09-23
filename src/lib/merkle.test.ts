import { describe, expect, it } from 'vitest';
import { buildMerkleTree, merkleProof, merkleRoot, verifyMerkleProof } from './merkle';

// Block 100000
const txids = [
  '8c14f0db3df150123e6f3dbbf30f8b955a8249b62ac1d1ff16284aefa3d06d87',
  'fff2525b8931402dd09222c50775608f75787bd2b87e56995a7bdd30f79702c4',
  '6359f0868171b1d194cbee1af2f16ea598ae8fad666d9b012c8ed2b79a236ec4',
  'e9a66845e05d5abc0ad04ec80f774a7e585c6e8db975962d069a522137b80c1d',
];
const root100000 = 'f3e94742aca4b5ef85488dc37c06c3282295ffec960994b2c0d5ac2a25a95766';

describe('merkle', () => {
  it('berechnet die Wurzel von Block 100000', () => {
    expect(merkleRoot(txids)).toBe(root100000);
  });

  it('Einzel-Transaktion: Wurzel = TxID', () => {
    expect(merkleRoot([txids[0]!])).toBe(txids[0]);
  });

  it('ungerade Anzahl verdoppelt das letzte Element', () => {
    const three = txids.slice(0, 3);
    expect(merkleRoot(three)).toBe(merkleRoot([...three, three[2]!]));
    const tree = buildMerkleTree(three);
    expect(tree.levels.map((l) => l.length)).toEqual([3, 2, 1]);
  });

  it('leere Liste wirft einen Fehler', () => {
    expect(() => merkleRoot([])).toThrow();
  });

  it('Merkle-Beweise sind für jede Position gültig, auch bei ungerader Anzahl', () => {
    for (const list of [txids, txids.slice(0, 3)]) {
      const root = merkleRoot(list);
      list.forEach((txid, i) => {
        const proof = merkleProof(list, i);
        expect(verifyMerkleProof(txid, proof, root)).toBe(true);
      });
    }
  });

  it('manipulierter Beweis oder falsche TxID ist ungültig', () => {
    const proof = merkleProof(txids, 2);
    expect(verifyMerkleProof(txids[1]!, proof, root100000)).toBe(false);
    const flipped = proof.map((s, i) => (i === 0 ? { ...s, position: 'left' as const } : s));
    expect(verifyMerkleProof(txids[2]!, flipped, root100000)).toBe(false);
  });
});
