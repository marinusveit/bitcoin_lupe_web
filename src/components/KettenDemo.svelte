<script lang="ts">
  import { fmtNumber, leadingZeroHexDigits, sha256Hex, startTextMining, ZERO_HASH, type MiningHandle } from '../lib';

  /** Ein Block speichert Daten und Nonce. Sein Zeiger ist immer der aktuelle Hash des Vorgängers. */
  interface Block {
    data: string;
    nonce: number;
  }

  const ZEROS = '0000';
  /** Eine Nonce ist eine ganze Zahl ab 0; leere, negative und gebrochene Eingaben werden so gelesen. */
  const cleanNonce = (nonce: number | null) => Math.max(0, Math.trunc(nonce || 0));
  const hashOf = (height: number, prev: string, data: string, nonce: number | null) =>
    sha256Hex(`${height}|${prev}|${data}|${cleanNonce(nonce)}`);

  // Vorab gefundene Nonces, damit die Kette beim Laden sofort gültig ist.
  const START_DATA: Block[] = [
    { data: 'Coinbase: 50 BTC an Alice', nonce: 65131 },
    { data: 'Alice zahlt Bob 10 BTC', nonce: 16662 },
    { data: 'Bob zahlt Carol 3 BTC', nonce: 65293 },
    { data: 'Carol zahlt Alice 1 BTC', nonce: 39468 },
  ];

  const startChain = (): Block[] => START_DATA.map((b) => ({ ...b }));

  let blocks: Block[] = $state(startChain());
  let mining: number | null = $state(null);
  let tries = $state(0);
  let handle: MiningHandle | null = null;

  /**
   * Pro Block: Zeiger (Hash des Vorgängers), eigener Hash, Arbeitsnachweis und Gültigkeit.
   * Weil der Zeiger aus dem Vorgänger abgeleitet wird, ändert eine Änderung an einem Block die
   * Hashes aller Nachfolger mit (wie in der Arbeit, Abschnitt Verkettung). Gültig ist ein Block
   * nur, wenn sein Hash mit den Nullen beginnt und sein Vorgänger gültig ist.
   */
  const chain = $derived.by(() => {
    const out: { prev: string; hash: string; pow: boolean; prevValid: boolean; valid: boolean }[] = [];
    blocks.forEach((b, i) => {
      const prev = i === 0 ? ZERO_HASH : out[i - 1]!.hash;
      const prevValid = i === 0 ? true : out[i - 1]!.valid;
      const hash = hashOf(i + 1, prev, b.data, b.nonce);
      const pow = hash.startsWith(ZEROS);
      out.push({ prev, hash, pow, prevValid, valid: pow && prevValid });
    });
    return out;
  });

  const firstInvalid = $derived(chain.findIndex((c) => !c.valid));
  /** Ab dem ersten ungültigen Block ist die ganze Kette dahinter betroffen. */
  const affected = $derived(firstInvalid < 0 ? 0 : blocks.length - firstInvalid);

  /** Sucht wie ein Miner ab Nonce 0 eine Nonce, mit der der Hash die Nullen erreicht. */
  function mine(i: number) {
    if (mining !== null) return;
    const block = blocks[i]!;
    mining = i;
    tries = 0;
    // Die Suche läuft im Web Worker, damit die Seite bedienbar bleibt.
    const h = startTextMining(`${i + 1}|${chain[i]!.prev}|${block.data}|`, ZEROS.length, (p) => (tries = p.iterations));
    handle = h;
    h.promise.then((outcome) => {
      if (handle !== h) return;
      handle = null;
      mining = null;
      if (outcome.status === 'found') block.nonce = outcome.nonce;
    });
  }

  function stop() {
    handle?.cancel();
    handle = null;
    mining = null;
  }

  function reset() {
    stop();
    tries = 0;
    blocks = startChain();
  }

  // Beim Verlassen der Seite laufendes Minen abbrechen (nur im Browser).
  $effect(() => stop);
</script>

<div class="demo">
  <div class="aktionen">
    <p class="count" class:ok={affected === 0} role="status">
      {#if affected === 0}
        Alle Blöcke sind gültig.
      {:else if affected === 1}
        Block {firstInvalid + 1} muss neu gemined werden.
      {:else}
        Block {firstInvalid + 1} und alle danach müssen neu gemined werden, einer nach dem anderen.
      {/if}
    </p>
    <button class="reset" onclick={reset}>Zurücksetzen</button>
  </div>

  <div class="chain" role="list" aria-label="Blockkette">
    {#each blocks as block, i (i)}
      {@const c = chain[i]!}
      {@const z = leadingZeroHexDigits(c.hash)}
      {#if i > 0}
        <!-- Verbinder: der Hash des Vorgängers fließt in das Feld „Zeigt auf“ dieses Blocks. Die Beschriftung
             sagt, ob der Vorgänger gültig ist; der Zeiger selbst folgt in der Demo immer dessen Hash. -->
        <div class="link" class:broken={!c.prevValid} aria-hidden="true">
          <svg viewBox="0 0 60 40">
            <path class="line" d="M2 20 H44" />
            <path class="head" d="M40 12 L52 20 L40 28 Z" />
          </svg>
          <span class="link-lbl">{c.prevValid ? 'Vorgänger gültig' : 'Vorgänger ungültig'}</span>
        </div>
      {/if}
      <div class="block" class:valid={c.valid} class:invalid={!c.valid} role="listitem">
        <div class="top">
          <strong>Block {i + 1}</strong>
          <span class="state">{c.valid ? 'gültig' : 'ungültig'}</span>
        </div>
        <div class="field prev" class:bad={!c.prevValid}>
          <span class="lbl">Zeigt auf (Hash des Vorgängers)</span>
          <span class="hash">{i === 0 ? 'kein Vorgänger (Genesis, der erste Block)' : c.prev}</span>
          {#if !c.prevValid}
            <span class="why">Block {i} ist ungültig und hat einen neuen Hash. Dieser Zeiger ändert sich mit, und damit auch der eigene Hash.</span>
          {/if}
        </div>
        <label>Daten (Transaktionen)
          <textarea rows="2" bind:value={block.data} disabled={mining !== null}></textarea>
        </label>
        <label>Nonce
          <input type="number" bind:value={block.nonce} min="0" step="1" disabled={mining !== null} />
        </label>
        <div class="field own">
          <span class="lbl">Eigener Hash (aus Höhe, Zeiger, Daten und Nonce)</span>
          <span class="hash"><span class="z" class:ok={c.pow}>{c.hash.slice(0, z)}</span>{c.hash.slice(z)}</span>
          {#if !c.pow}
            <span class="why">Beginnt nicht mit {ZEROS}. Die Nonce passt nicht mehr zu Zeiger und Daten.</span>
          {:else if !c.prevValid}
            <span class="why">Beginnt zwar mit {ZEROS}, aber der Block baut auf einem ungültigen Vorgänger auf.</span>
          {/if}
        </div>
        <button
          onclick={() => mine(i)}
          disabled={mining !== null || c.valid || i !== firstInvalid}
          title={!c.valid && i !== firstInvalid ? 'Erst den Block davor neu minen' : undefined}
        >
          {mining === i ? `Suche … ${fmtNumber(tries)} Versuche` : 'Block neu minen'}
        </button>
      </div>
    {/each}
  </div>
  <p class="note">
    Jeder Hash wird aus Blockhöhe, dem Zeiger auf den Vorgänger, den Daten und der Nonce berechnet. Gültig ist
    ein Block, wenn sein Hash mit vier Nullen beginnt und sein Vorgänger gültig ist. Ändert sich ein Block, ändert
    sich sein Hash, damit der Zeiger im nächsten Block, damit dessen Hash, und so weiter bis zum Ende der Kette.
  </p>
</div>

<style>
  .demo { display: grid; gap: 1rem; }
  .count { margin: 0; font-size: 1.05rem; color: var(--danger); }
  .count.ok { color: var(--ok); }
  /* Vier Blöcke und drei Verbinder in einer Reihe; schmal: untereinander mit gedrehten Pfeilen. */
  .chain { display: grid; gap: 0.3rem; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr); align-items: stretch; }
  .link { display: grid; place-items: center; align-content: center; gap: 0.2rem; width: 3.4rem; color: var(--ok); }
  .link svg { width: 2.6rem; height: auto; display: block; }
  .link .line { fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; }
  .link .head { fill: currentColor; }
  .link.broken { color: var(--danger); }
  .link.broken .line { stroke-dasharray: 5 5; }
  .link-lbl { font-size: 0.68rem; text-align: center; line-height: 1.15; width: 3.4rem; }
  .block { display: grid; gap: 0.55rem; align-content: start; padding: 0.8rem; border: 1px solid var(--border); border-top: 4px solid; border-radius: var(--radius); background: var(--bg-elevated); min-width: 0; }
  .field.prev, .field.own { padding: 0.4rem 0.5rem; border-radius: var(--radius-sm); background: var(--bg-muted); }
  .field.own { border-left: 3px solid var(--accent); }
  .field.prev { border-left: 3px solid var(--ok); }
  .field.prev.bad { border-left-color: var(--danger); }
  .block.valid { border-top-color: var(--ok); }
  .block.invalid { border-top-color: var(--danger); background: color-mix(in srgb, var(--danger) 6%, var(--bg-elevated)); }
  .top { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0 0.5rem; }
  .top strong { white-space: nowrap; }
  .state { font-size: 0.85rem; font-weight: 600; text-align: right; }
  .valid .state { color: var(--ok); }
  .invalid .state { color: var(--danger); }
  label, .field { display: grid; gap: 0.2rem; min-width: 0; }
  textarea, input { width: 100%; }
  textarea { resize: vertical; }
  .lbl { font-size: 0.85rem; color: var(--fg-muted); }
  .hash { font-size: 0.78rem; line-height: 1.4; }
  .z { font-weight: 700; color: var(--danger); }
  .z.ok { color: var(--accent-strong); }
  .why { font-size: 0.8rem; color: var(--danger); }
  .note { font-size: 0.92rem; color: var(--fg-muted); margin: 0; }
  @media (max-width: 900px) {
    .chain { grid-template-columns: minmax(0, 1fr); gap: 0.4rem; }
    .link { width: auto; grid-auto-flow: column; justify-content: center; }
    .link svg { transform: rotate(90deg); width: 2.2rem; }
  }
</style>
