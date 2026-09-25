import type { BlockHeader } from './block';

/** Auftrag für einen Mining-Lauf: Header-Mining oder vereinfachtes Text-Mining. */
type StartRequest =
  | { type: 'start'; header: BlockHeader; chunkSize?: number; startNonce?: number; target?: bigint }
  | { type: 'start-text'; prefix: string; zeros: number; chunkSize?: number; startNonce?: number };

/** Nachricht an den Mining-Worker: Lauf `id` starten oder stoppen. Mehrere Läufe dürfen gleichzeitig laufen. */
export type MiningWorkerRequest = (StartRequest & { id: number }) | { type: 'stop'; id: number };

/** Nachricht vom Mining-Worker: Fortschritt, Treffer oder alle Nonces erfolglos probiert. */
export interface MiningWorkerResponse {
  type: 'progress' | 'found' | 'exhausted';
  /** Lauf, zu dem die Nachricht gehört. */
  id: number;
  /** Bisher insgesamt probierte Nonces. */
  iterations: number;
  /** Treffer bzw. zuletzt probierter Hash (Anzeige-Hex). */
  hash: string;
  nonce: number;
  /** Reine Rechenzeit im Worker seit Beginn des Laufs in Millisekunden (ohne Start des Workers). */
  elapsedMs: number;
  /** Bisherige Verteilung der Hashes nach führenden Null-Hexzeichen (nur beim Header-Mining). */
  zeroHist?: number[];
}

/** Endergebnis eines Mining-Laufs. */
export type MiningOutcome =
  | { status: 'found' | 'exhausted'; iterations: number; hash: string; nonce: number; elapsedMs: number; zeroHist?: number[] }
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

interface Run {
  onMessage: (msg: MiningWorkerResponse) => void;
  fail: (error: Error) => void;
}

/** Ein gemeinsamer Worker für alle Läufe der Seite, erst beim ersten Lauf geladen. */
let sharedWorker: Worker | null = null;
let lastRunId = 0;
/** Offene Läufe; Nachrichten zu beendeten oder abgebrochenen Läufen werden ignoriert. */
const runs = new Map<number, Run>();

function getWorker(): Worker {
  if (sharedWorker) return sharedWorker;
  const worker = new Worker(new URL('./workers/mining.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<MiningWorkerResponse>) => runs.get(event.data.id)?.onMessage(event.data);
  worker.onerror = (event) => {
    // Nach einem Fehler ist der Zustand des Workers unklar: alle offenen Läufe abbrechen, beim nächsten Lauf neu laden.
    worker.terminate();
    if (sharedWorker === worker) sharedWorker = null;
    const error = new Error(event.message || 'Fehler im Mining-Worker.');
    for (const run of [...runs.values()]) run.fail(error);
  };
  sharedWorker = worker;
  return worker;
}

function runWorker(request: StartRequest, onProgress: (progress: MiningWorkerResponse) => void): MiningHandle {
  const id = ++lastRunId;
  const worker = getWorker();
  let finish: (outcome: MiningOutcome) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const promise = new Promise<MiningOutcome>((resolve, reject) => {
    finish = (outcome) => {
      if (runs.delete(id)) resolve(outcome);
    };
    fail = (error) => {
      if (runs.delete(id)) reject(error);
    };
  });
  runs.set(id, {
    fail,
    onMessage: (msg) => {
      onProgress(msg);
      if (msg.type !== 'progress') {
        finish({
          status: msg.type,
          iterations: msg.iterations,
          hash: msg.hash,
          nonce: msg.nonce,
          elapsedMs: msg.elapsedMs,
          zeroHist: msg.zeroHist,
        });
      }
    },
  });
  worker.postMessage({ ...request, id } satisfies MiningWorkerRequest);
  return {
    promise,
    cancel: () => {
      if (runs.has(id)) worker.postMessage({ type: 'stop', id } satisfies MiningWorkerRequest);
      finish({ status: 'cancelled' });
    },
  };
}
