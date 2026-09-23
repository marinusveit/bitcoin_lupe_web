import { bytesToHex, hexToBytes, sha256dBytes } from './hash';

/**
 * Merkle-Bäume wie in Bitcoin. Alle TxIDs und Hashes werden in Anzeige-Reihenfolge
 * übergeben und zurückgegeben (so wie Block-Explorer sie zeigen). Intern dreht der Code
 * die Byte-Reihenfolge, hasht zwei Knoten mit doppeltem SHA-256 und verdoppelt bei
 * ungerader Anzahl den letzten Knoten einer Ebene.
 */

/** Ein Schritt im Merkle-Beweis: der Geschwister-Hash und auf welcher Seite er steht. */
export interface MerkleProofStep {
  hash: string;
  position: 'left' | 'right';
}

/** Alle Ebenen des Baums; `levels[0]` sind die TxIDs, die letzte Ebene enthält nur die Wurzel. */
export interface MerkleTree {
  levels: string[][];
  root: string;
}

function toInternal(displayHex: string): Uint8Array {
  const bytes = hexToBytes(displayHex);
  if (bytes.length !== 32) throw new Error(`Hash muss 32 Byte lang sein: ${displayHex}`);
  return bytes.reverse();
}

/** Hasht zwei Knoten (Anzeige-Hex) zu ihrem Elternknoten (Anzeige-Hex). */
export function hashPair(left: string, right: string): string {
  const joined = new Uint8Array(64);
  joined.set(toInternal(left), 0);
  joined.set(toInternal(right), 32);
  return bytesToHex(sha256dBytes(joined).reverse());
}

function nextLevel(level: string[]): string[] {
  const parents: string[] = [];
  for (let i = 0; i < level.length; i += 2) {
    const left = level[i]!;
    const right = level[i + 1] ?? left;
    parents.push(hashPair(left, right));
  }
  return parents;
}

/** Baut alle Ebenen des Merkle-Baums; verdoppelte Knoten erscheinen nicht extra in den Ebenen. */
export function buildMerkleTree(txids: string[]): MerkleTree {
  if (txids.length === 0) throw new Error('Ein Merkle-Baum braucht mindestens eine Transaktion.');
  const levels: string[][] = [txids.map((t) => t.toLowerCase())];
  while (levels[levels.length - 1]!.length > 1) {
    levels.push(nextLevel(levels[levels.length - 1]!));
  }
  return { levels, root: levels[levels.length - 1]![0]! };
}

/** Berechnet die Merkle-Wurzel einer Liste von TxIDs. */
export function merkleRoot(txids: string[]): string {
  return buildMerkleTree(txids).root;
}

/** Erzeugt den Merkle-Beweis für die TxID an Position `index` (von unten nach oben). */
export function merkleProof(txids: string[], index: number): MerkleProofStep[] {
  if (!Number.isInteger(index) || index < 0 || index >= txids.length) {
    throw new Error(`Index ${index} liegt außerhalb der Liste.`);
  }
  const { levels } = buildMerkleTree(txids);
  const proof: MerkleProofStep[] = [];
  let i = index;
  for (const level of levels.slice(0, -1)) {
    if (i % 2 === 0) {
      proof.push({ hash: level[i + 1] ?? level[i]!, position: 'right' });
    } else {
      proof.push({ hash: level[i - 1]!, position: 'left' });
    }
    i = Math.floor(i / 2);
  }
  return proof;
}

/** Prüft, ob eine TxID mit dem Beweis zur angegebenen Merkle-Wurzel führt. */
export function verifyMerkleProof(txid: string, proof: MerkleProofStep[], root: string): boolean {
  let current = txid.toLowerCase();
  for (const step of proof) {
    current = step.position === 'left' ? hashPair(step.hash, current) : hashPair(current, step.hash);
  }
  return current === root.toLowerCase();
}
