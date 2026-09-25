import { mineHeader, mineText as mineTextChunk, type BlockHeader } from '../block';
import type { MiningWorkerRequest, MiningWorkerResponse } from '../mining-client';

/**
 * Web Worker: mint in Abschnitten, meldet Fortschritt und reagiert zwischen den Abschnitten auf „stop“.
 * Ein Worker bedient alle Läufe der Seite; jeder Lauf hat eine `id`, gleichzeitige Läufe wechseln sich ab.
 */

interface WorkerScope {
  postMessage(message: MiningWorkerResponse): void;
  onmessage: ((event: MessageEvent<MiningWorkerRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;
/** Laufende Läufe; „stop“ entfernt die `id`, der nächste Abschnitt bricht dann ab. */
const active = new Set<number>();

// Abgabe zwischen Abschnitten über einen MessageChannel statt setTimeout(0): Verschachtelte Timer
// drosseln Browser auf mindestens 4 ms, Port-Nachrichten nicht. Stopp-Nachrichten kommen trotzdem dazwischen.
const channel = new MessageChannel();
const queue: (() => void)[] = [];
channel.port1.onmessage = () => queue.shift()?.();
function later(fn: () => void): void {
  queue.push(fn);
  channel.port2.postMessage(null);
}

function mine(header: BlockHeader, chunkSize: number, startNonce: number, target: bigint | undefined, id: number): void {
  let nonce = startNonce;
  let total = 0;
  // Zeit ab dem ersten Hash messen, damit das Laden des Workers die Rate nicht verfälscht.
  const t0 = performance.now();
  const zeroHist = new Array<number>(17).fill(0);
  const step = (): void => {
    if (!active.has(id)) return;
    const r = mineHeader(header, { maxIterations: chunkSize, startNonce: nonce, target });
    total += r.iterations;
    nonce = r.nextNonce;
    r.zeroHist.forEach((c, z) => (zeroHist[z]! += c));
    const type = r.found ? 'found' : r.exhausted ? 'exhausted' : 'progress';
    const elapsedMs = performance.now() - t0;
    scope.postMessage({ type, id, iterations: total, hash: r.hash, nonce: r.nonce, elapsedMs, zeroHist: [...zeroHist] });
    if (type === 'progress') later(step);
    else active.delete(id);
  };
  step();
}

/** Demo-Variante: SHA-256 über `prefix + nonce`, Treffer bei `zeros` führenden Null-Hexzeichen. */
function mineText(prefix: string, zeros: number, chunkSize: number, startNonce: number, id: number): void {
  let nonce = startNonce;
  let total = 0;
  const t0 = performance.now();
  const step = (): void => {
    if (!active.has(id)) return;
    const r = mineTextChunk(prefix, zeros, { maxIterations: chunkSize, startNonce: nonce });
    total += r.iterations;
    nonce = r.nextNonce;
    const type = r.found ? 'found' : 'progress';
    scope.postMessage({ type, id, iterations: total, hash: r.hash, nonce: r.nonce, elapsedMs: performance.now() - t0 });
    if (type === 'progress') later(step);
    else active.delete(id);
  };
  step();
}

scope.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === 'stop') {
    active.delete(msg.id);
    return;
  }
  active.add(msg.id);
  if (msg.type === 'start') {
    mine(msg.header, msg.chunkSize ?? 20_000, msg.startNonce ?? msg.header.nonce, msg.target, msg.id);
  } else {
    mineText(msg.prefix, msg.zeros, msg.chunkSize ?? 5_000, msg.startNonce ?? 0, msg.id);
  }
};
