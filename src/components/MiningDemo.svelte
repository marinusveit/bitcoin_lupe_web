<script lang="ts">
  import { onDestroy } from 'svelte';
  import { sha256dHex, startMining, targetToNBits, type BlockHeader, type MiningHandle } from '../lib';

  interface Find {
    zeros: number;
    iterations: number;
    seconds: number;
    nonce: number;
    hash: string;
  }

  const START_ZEROS = 4;
  // Ein fester Beispielblock; der Zeitstempel wird bei jedem Start neu gesetzt.
  const PREV = '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f';
  const ROOT = sha256dHex('Werkstatt: Alice zahlt Bob 1 BTC');

  let zeros = $state(START_ZEROS);
  let running = $state(false);
  let iterations = $state(0);
  let rate = $state(0);
  let elapsed = $state(0);
  let currentHash = $state('');
  let currentNonce = $state(0);
  let lastFind: Find | null = $state(null);
  let history: Find[] = $state([]);
  let error = $state('');

  let handle: MiningHandle | null = null;
  let startedAt = 0;

  const target = $derived(2n ** BigInt(256 - 4 * zeros) - 1n);
  const expected = $derived(16 ** zeros);

  /** Target als 64 Hex-Zeichen: n Nullen, danach lauter f. */
  const targetHex = (n: number) => '0'.repeat(n) + 'f'.repeat(64 - n);

  const fmt = (n: number, digits = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: digits });

  function start() {
    error = '';
    iterations = 0;
    rate = 0;
    elapsed = 0;
    currentHash = '';
    lastFind = null;
    const n = zeros;
    const t = target;
    const header: BlockHeader = {
      version: 1,
      prevHash: PREV,
      merkleRoot: ROOT,
      timestamp: Math.floor(Date.now() / 1000),
      nBits: targetToNBits(t),
      nonce: 0,
    };
    startedAt = performance.now();
    running = true;
    const h = startMining(
      header,
      (p) => {
        iterations = p.iterations;
        currentHash = p.hash;
        currentNonce = p.nonce;
        elapsed = (performance.now() - startedAt) / 1000;
        rate = elapsed > 0 ? p.iterations / elapsed : 0;
      },
      { target: t, chunkSize: 20_000 },
    );
    handle = h;
    h.promise
      .then((outcome) => {
        if (handle !== h) return;
        running = false;
        handle = null;
        if (outcome.status === 'found') {
          const seconds = (performance.now() - startedAt) / 1000;
          const find = { zeros: n, iterations: outcome.iterations, seconds, nonce: outcome.nonce, hash: outcome.hash };
          lastFind = find;
          // Anzeige auf den Endstand setzen; der letzte Fortschrittsbericht liegt vor dem Treffer.
          iterations = outcome.iterations;
          elapsed = seconds;
          rate = seconds > 0 ? outcome.iterations / seconds : 0;
          currentNonce = outcome.nonce;
          currentHash = outcome.hash;
          history = [find, ...history].slice(0, 10);
        } else if (outcome.status === 'exhausted') {
          error = 'Alle 4,3 Milliarden Nonces probiert, kein Treffer. Starte neu, dann gilt ein neuer Zeitstempel.';
        }
      })
      .catch((e: unknown) => {
        running = false;
        handle = null;
        error = `Fehler im Mining-Worker: ${e instanceof Error ? e.message : String(e)}`;
      });
  }

  function stop() {
    const h = handle;
    handle = null;
    running = false;
    h?.cancel();
  }

  function toggle() {
    if (running) stop();
    else start();
  }

  function reset() {
    stop();
    zeros = START_ZEROS;
    iterations = 0;
    rate = 0;
    elapsed = 0;
    currentHash = '';
    lastFind = null;
    history = [];
    error = '';
  }

  onDestroy(stop);
</script>

<div class="demo">
  <div class="controls">
    <label class="slider">
      <span>Schwierigkeit: <strong>{zeros}</strong> führende Null{zeros === 1 ? '' : 'en'} im Hash</span>
      <input type="range" min="1" max="7" step="1" bind:value={zeros} disabled={running} />
      <span class="hint">Im Mittel {fmt(expected)} Versuche nötig (16 hoch {zeros}).</span>
    </label>
    <div class="actions">
      <button class="primary" onclick={toggle}>{running ? 'Mining stoppen' : 'Mining starten'}</button>
      <button onclick={reset}>Zurücksetzen</button>
    </div>
  </div>

  <div class="target">
    <span class="lbl">Target (Obergrenze): der Hash muss als Zahl kleiner oder gleich sein</span>
    <span class="hash"><span class="z">{'0'.repeat(zeros)}</span>{targetHex(zeros).slice(zeros)}</span>
  </div>

  <dl class="stats" aria-live="polite">
    <div><dt>Versuche</dt><dd>{fmt(iterations)}</dd></div>
    <div><dt>Versuche pro Sekunde</dt><dd>{fmt(rate)}</dd></div>
    <div><dt>Zeit</dt><dd>{fmt(elapsed, 1)} s</dd></div>
    <div class="wide">
      <dt>{running ? 'Aktueller Hash' : lastFind ? 'Gefundener Hash' : 'Hash'}</dt>
      <dd class="hash">{#if lastFind && !running}<span class="z">{lastFind.hash.slice(0, lastFind.zeros)}</span>{lastFind.hash.slice(lastFind.zeros)}{:else}{currentHash || '–'}{/if}</dd>
      {#if lastFind && !running}
        <dt>Target zum Vergleich</dt>
        <dd class="hash"><span class="z">{'0'.repeat(lastFind.zeros)}</span>{targetHex(lastFind.zeros).slice(lastFind.zeros)}</dd>
      {/if}
    </div>
  </dl>

  {#if lastFind && !running}
    <p class="found" role="status">
      Gefunden! Nonce {fmt(lastFind.nonce)} nach {fmt(lastFind.iterations)} Versuchen in {fmt(lastFind.seconds, 2)} Sekunden.
    </p>
  {:else if running}
    <p class="muted">Der Rechner probiert Nonce für Nonce (zuletzt {fmt(currentNonce)}) und hasht den Blockheader jedes Mal neu.</p>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if history.length}
    <table>
      <caption>Letzte Funde</caption>
      <thead><tr><th>Schwierigkeit</th><th class="num">erwartet</th><th class="num">Versuche</th><th class="num">Sekunden</th></tr></thead>
      <tbody>
        {#each history as f, i (i + ':' + f.nonce)}
          <tr><td>{f.zeros} Null{f.zeros === 1 ? '' : 'en'}</td><td class="num">{fmt(16 ** f.zeros)}</td><td class="num">{fmt(f.iterations)}</td><td class="num">{fmt(f.seconds, 2)}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <p class="note">
    Jede weitere Null macht die Suche im Mittel 16-mal aufwendiger. Ein echter Bitcoin-Block braucht 2026 etwa
    19 führende Null-Hexzeichen, das ist grob 280 Billionen Mal so viel Arbeit wie Stufe 7 hier (nur nach den führenden Nullen gezählt).
  </p>
</div>

<style>
  .demo { display: grid; gap: 1rem; }
  .controls { display: flex; flex-wrap: wrap; gap: 1rem 2rem; align-items: end; justify-content: space-between; }
  .slider { display: grid; gap: 0.3rem; flex: 1 1 18rem; color: var(--fg); }
  .slider input { width: 100%; accent-color: var(--accent); }
  .hint, .lbl { font-size: 0.86rem; color: var(--fg-muted); }
  .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
  .target { display: grid; gap: 0.2rem; }
  .z { color: var(--accent-strong); font-weight: 700; }
  .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.8rem 1rem; margin: 0; padding: 1rem; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius); }
  .stats .wide { grid-column: 1 / -1; }
  .stats dt { font-size: 0.85rem; color: var(--fg-muted); }
  .stats dd { margin: 0; font-size: 1.35rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .stats dd.hash { font-size: 0.85rem; font-weight: 400; min-height: 1.4em; }
  .found { color: var(--ok); font-weight: 600; margin: 0; }
  .error { color: var(--danger); margin: 0; }
  .muted { color: var(--fg-muted); margin: 0; }
  table { margin: 0; }
  caption { text-align: left; font-weight: 600; padding-bottom: 0.3rem; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .note { font-size: 0.92rem; color: var(--fg-muted); margin: 0; }
  @media (max-width: 480px) {
    .stats { grid-template-columns: 1fr 1fr; }
    .stats dd { font-size: 1.1rem; }
  }
</style>
