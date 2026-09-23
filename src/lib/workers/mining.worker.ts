import { mineHeader, mineText as mineTextChunk, type BlockHeader } from '../block';
import type { MiningWorkerRequest, MiningWorkerResponse } from '../mining-client';

/** Web Worker: mint in Abschnitten, meldet Fortschritt und reagiert zwischen den Abschnitten auf „stop“. */

interface WorkerScope {
  postMessage(message: MiningWorkerResponse): void;
  onmessage: ((event: MessageEvent<MiningWorkerRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
let runId = 0;

function mine(header: BlockHeader, chunkSize: number, startNonce: number, target: bigint | undefined, id: number): void {
  let nonce = startNonce;
  let total = 0;
  const zeroHist = new Array<number>(17).fill(0);
  const step = (): void => {
    if (id !== runId) return;
    const r = mineHeader(header, { maxIterations: chunkSize, startNonce: nonce, target });
    total += r.iterations;
    nonce = r.nextNonce;
    r.zeroHist.forEach((c, z) => (zeroHist[z]! += c));
    const hist = [...zeroHist];
    if (r.found) {
      scope.postMessage({ type: 'found', iterations: total, hash: r.hash, nonce: r.nonce, zeroHist: hist });
    } else if (r.exhausted) {
      scope.postMessage({ type: 'exhausted', iterations: total, hash: r.hash, nonce: r.nonce, zeroHist: hist });
    } else {
      scope.postMessage({ type: 'progress', iterations: total, hash: r.hash, nonce: r.nonce, zeroHist: hist });
      setTimeout(step, 0);
    }
  };
  step();
}

/** Demo-Variante: SHA-256 über `prefix + nonce`, Treffer bei `zeros` führenden Null-Hexzeichen. */
function mineText(prefix: string, zeros: number, chunkSize: number, startNonce: number, id: number): void {
  let nonce = startNonce;
  let total = 0;
  const step = (): void => {
    if (id !== runId) return;
    const r = mineTextChunk(prefix, zeros, { maxIterations: chunkSize, startNonce: nonce });
    total += r.iterations;
    nonce = r.nextNonce;
    if (r.found) {
      scope.postMessage({ type: 'found', iterations: total, hash: r.hash, nonce: r.nonce });
      return;
    }
    scope.postMessage({ type: 'progress', iterations: total, hash: r.hash, nonce: r.nonce });
    setTimeout(step, 0);
  };
  step();
}

scope.onmessage = (event) => {
  const msg = event.data;
  runId++;
  if (msg.type === 'start') {
    mine(msg.header, msg.chunkSize ?? 20_000, msg.startNonce ?? msg.header.nonce, msg.target, runId);
  } else if (msg.type === 'start-text') {
    mineText(msg.prefix, msg.zeros, msg.chunkSize ?? 5_000, msg.startNonce ?? 0, runId);
  }
};
