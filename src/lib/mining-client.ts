import type { BlockHeader } from './block';

/** Nachricht an den Mining-Worker: starten (mit Header) oder stoppen. */
export type MiningWorkerRequest =
  | { type: 'start'; header: BlockHeader; chunkSize?: number; startNonce?: number; target?: bigint }
  | { type: 'start-text'; prefix: string; zeros: number; chunkSize?: number; startNonce?: number }
  | { type: 'stop' };

/** Nachricht vom Mining-Worker: Fortschritt, Treffer oder alle Nonces erfolglos probiert. */
export interface MiningWorkerResponse {
  type: 'progress' | 'found' | 'exhausted';
  /** Bisher insgesamt probierte Nonces. */
  iterations: number;
  /** Treffer bzw. zuletzt probierter Hash (Anzeige-Hex). */
  hash: string;
  nonce: number;
  /** Bisherige Verteilung der Hashes nach führenden Null-Hexzeichen (nur beim Header-Mining). */
  zeroHist?: number[];
}

/** Endergebnis eines Mining-Laufs. */
export type MiningOutcome =
  | { status: 'found' | 'exhausted'; iterations: number; hash: string; nonce: number; zeroHist?: number[] }
  | { status: 'cancelled' };

/** Weitere Optionen für `startMining`. */
export interface StartMiningOptions {
  chunkSize?: number;
  startNonce?: number;
  /** Überschreibt das Ziel aus `header.nBits`. */
  target?: bigint;
}

/** Handle eines laufenden Mining-Laufs. */
export interface MiningHandle {
  promise: Promise<MiningOutcome>;
  cancel: () => void;
}

/** Startet Mining in einem Web Worker; `onProgress` erhält nach jedem Abschnitt den Zwischenstand. */
export function startMining(
  header: BlockHeader,
  onProgress: (progress: MiningWorkerResponse) => void,
  options: StartMiningOptions = {},
): MiningHandle {
  return runWorker({ type: 'start', header, ...options }, onProgress);
}

/**
 * Vereinfachtes Mining für Lehr-Demos: sucht eine Nonce, sodass SHA-256(prefix + nonce) mit
 * `zeros` Null-Hexzeichen beginnt. Läuft ebenfalls im Web Worker.
 */
export function startTextMining(
  prefix: string,
  zeros: number,
  onProgress: (progress: MiningWorkerResponse) => void,
  options: Pick<StartMiningOptions, 'chunkSize' | 'startNonce'> = {},
): MiningHandle {
  return runWorker({ type: 'start-text', prefix, zeros, ...options }, onProgress);
}

function runWorker(request: MiningWorkerRequest, onProgress: (progress: MiningWorkerResponse) => void): MiningHandle {
  const worker = new Worker(new URL('./workers/mining.worker.ts', import.meta.url), { type: 'module' });
  let settle: (outcome: MiningOutcome) => void = () => {};
  let done = false;
  const promise = new Promise<MiningOutcome>((resolve, reject) => {
    settle = (outcome) => {
      if (done) return;
      done = true;
      worker.terminate();
      resolve(outcome);
    };
    worker.onerror = (event) => {
      if (done) return;
      done = true;
      worker.terminate();
      reject(new Error(event.message || 'Fehler im Mining-Worker.'));
    };
  });
  worker.onmessage = (event: MessageEvent<MiningWorkerResponse>) => {
    const msg = event.data;
    onProgress(msg);
    if (msg.type !== 'progress') {
      settle({ status: msg.type, iterations: msg.iterations, hash: msg.hash, nonce: msg.nonce, zeroHist: msg.zeroHist });
    }
  };
  worker.postMessage(request);
  return {
    promise,
    cancel: () => {
      if (!done) worker.postMessage({ type: 'stop' } satisfies MiningWorkerRequest);
      settle({ status: 'cancelled' });
    },
  };
}
