<script lang="ts">
  import { leadingZeroHexDigits, mineText } from '../lib/block';
  import { fmtNumber } from '../lib/format';
  import { sha256Hex } from '../lib/hash';

  const START_TEXT = 'Bitcoin unter der Lupe';
  const ZIEL_NULLEN = 3;
  const MAX_VERSUCHE = 1_000_000;

  let text = $state(START_TEXT);
  let versuche = $state<number | null>(null);

  const hex = $derived(sha256Hex(text));
  const nullen = $derived(leadingZeroHexDigits(hex));

  /** Hängt eine Zahl an den Text an, bis der Hash mit ZIEL_NULLEN Nullen beginnt (im Mittel 4096 Versuche). */
  function sucheNullen() {
    const prefix = `${text.replace(/ #\d+$/, '')} #`;
    const result = mineText(prefix, ZIEL_NULLEN, { maxIterations: MAX_VERSUCHE, startNonce: 1 });
    if (!result.found) return;
    text = prefix + result.nonce;
    versuche = result.iterations;
  }

  function reset() {
    text = START_TEXT;
    versuche = null;
  }
</script>

<div class="hash-hero">
  <label class="eingabe" for="hash-hero-input">Tipp etwas ein</label>
  <input
    id="hash-hero-input"
    type="text"
    bind:value={text}
    oninput={() => (versuche = null)}
    spellcheck="false"
    autocomplete="off"
  />

  <p class="hinweis">Ändere einen Buchstaben und sieh zu, wie sich der ganze Fingerabdruck ändert.</p>

  <p class="label" id="hash-hero-label">SHA-256 deiner Eingabe</p>
  <p class="hex" aria-labelledby="hash-hero-label">
    {#if nullen > 0}<span class="nullen">{hex.slice(0, nullen)}</span>{/if}{hex.slice(nullen)}
  </p>

  <p class="status" aria-live="polite">
    {#if nullen === 0}
      Keine führende Null. Miner suchen Eingaben, deren Hash mit vielen Nullen beginnt.
    {:else if versuche !== null}
      {nullen} führende {nullen === 1 ? 'Null' : 'Nullen'} nach {fmtNumber(versuche)} Versuchen.
      Genau diese Suche ist Mining.
    {:else}
      {nullen} führende {nullen === 1 ? 'Null' : 'Nullen'}. Miner suchen genau solche Hashwerte.
    {/if}
  </p>

  <div class="knoepfe">
    <button type="button" onclick={sucheNullen} disabled={versuche !== null}>Zahl anhängen, bis {ZIEL_NULLEN} Nullen vorne stehen</button>
    <button type="button" onclick={reset}>Zurücksetzen</button>
  </div>
</div>

<style>
  .hash-hero { max-width: 46rem; }
  .eingabe { display: block; margin-bottom: 0.3rem; font-weight: 600; color: var(--fg); font-size: 1rem; }
  input {
    width: 100%;
    font-size: 1.15rem;
    padding: 0.6rem 0.75rem;
  }
  .hinweis { margin: 0.5rem 0 1.4rem; color: var(--fg-muted); font-size: 0.95rem; }
  .label {
    margin: 0 0 0.3rem;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    color: var(--fg-muted);
  }
  .hex {
    margin: 0;
    font-family: var(--font-mono);
    font-size: clamp(1.15rem, 3.4vw, 1.9rem);
    line-height: 1.35;
    letter-spacing: 0.02em;
    overflow-wrap: anywhere;
    word-break: break-all;
  }
  .status { margin: 0.8rem 0 1rem; font-size: 0.95rem; color: var(--fg-muted); min-height: 1.6em; }
  .knoepfe { display: flex; flex-wrap: wrap; gap: 0.5rem; }
</style>
