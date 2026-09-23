import type { BlockHeader } from './block';

/** Nachricht an den Mining-Worker: starten (mit Header) oder stoppen. */
export type MiningWorkerRequest =
  | { type: 'start'; header: BlockHeader; chunkSize?: number; startNonce?: number; target?: bigint }
  | { type: 'stop' };

/** Nachricht vom Mining-Worker: Fortschritt, Treffer oder alle Nonces erfolglos probiert. */
export interface MiningWorkerResponse {
  type: 'progress' | 'found' | 'exhausted';
  /** Bisher insgesamt probierte Nonces. */
  iterations: number;
  /** Treffer bzw. zuletzt probierter Hash (Anzeige-Hex). */
  hash: string;
  nonce: number;
}

/** Endergebnis eines Mining-Laufs. */
export type MiningOutcome =
  | { status: 'found' | 'exhausted'; iterations: number; hash: string; nonce: number }
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
      settle({ status: msg.type, iterations: msg.iterations, hash: msg.hash, nonce: msg.nonce });
    }
  };
  const request: MiningWorkerRequest = { type: 'start', header, ...options };
  worker.postMessage(request);
  return {
    promise,
    cancel: () => {
      if (!done) worker.postMessage({ type: 'stop' } satisfies MiningWorkerRequest);
      settle({ status: 'cancelled' });
    },
  };
}
