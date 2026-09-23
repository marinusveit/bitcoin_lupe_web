<script lang="ts">
  import { sha256Hex, toBitString } from '../lib/hash';

  const START_LEFT = 'Hochschule München';
  const START_RIGHT = 'Hochschule Munchen';
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyzäöüABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ';

  let left = $state(START_LEFT);
  let right = $state(START_RIGHT);

  const bitsLeft = $derived(toBitString(sha256Hex(left)));
  const bitsRight = $derived(toBitString(sha256Hex(right)));
  const diff = $derived(Array.from(bitsLeft, (b, i) => b !== bitsRight[i]));
  const diffCount = $derived(diff.filter(Boolean).length);
  const percent = $derived(((diffCount / 256) * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 }));

  const ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

  function changeOneChar() {
    const chars = Array.from(right);
    if (chars.length === 0) {
      right = ALPHABET[Math.floor(Math.random() * 26)]!;
      return;
    }
    const pos = Math.floor(Math.random() * chars.length);
    let replacement = chars[pos]!;
    while (replacement === chars[pos]) {
      replacement = ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!;
    }
    chars[pos] = replacement;
    right = chars.join('');
  }

  function reset() {
    left = START_LEFT;
    right = START_RIGHT;
  }
</script>

<div class="demo">
  <div class="pair">
    {#each [{ id: 'l', label: 'Text A', bits: bitsLeft }, { id: 'r', label: 'Text B', bits: bitsRight }] as side (side.id)}
      <div class="side">
        <label class="field">
          <span>{side.label}</span>
          {#if side.id === 'l'}
            <input type="text" bind:value={left} spellcheck="false" autocomplete="off" />
          {:else}
            <input type="text" bind:value={right} spellcheck="false" autocomplete="off" />
          {/if}
        </label>
        <div class="bits hash" aria-label={`SHA-256 von ${side.label} als Bitmuster`}>
          {#each ROWS as r (r)}
            <div class="bit-row">
              {#each { length: 32 } as _, c (c)}
                {@const i = r * 32 + c}
                <span class:diff={diff[i]}>{side.bits[i]}</span>
              {/each}
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <p class="summary" aria-live="polite">
    <strong>{diffCount} von 256 Bits</strong> unterschiedlich ({percent} %)
  </p>
  <p class="hint">
    Farbig markiert sind die Bits, die sich unterscheiden. Schon ein einziges geändertes Zeichen kippt
    im Schnitt etwa die Hälfte aller Bits. Man nennt das Lawineneffekt.
  </p>

  <div class="actions">
    <button type="button" class="primary" onclick={changeOneChar}>Ein Zeichen ändern</button>
    <button type="button" onclick={reset}>Zurücksetzen</button>
  </div>
</div>

<style>
  .demo {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.2rem;
    display: grid;
    gap: 1rem;
  }
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 1.2rem; }
  .side { display: grid; gap: 0.6rem; align-content: start; min-width: 0; }
  .field { display: grid; gap: 0.3rem; }
  .field input { width: 100%; }
  .bits { display: grid; gap: 0.1rem; }
  .bit-row { display: grid; grid-template-columns: repeat(32, 1fr); font-size: clamp(0.58rem, 2.6vw, 0.78rem); }
  .bit-row span { text-align: center; color: var(--fg-muted); border-radius: 2px; }
  .bit-row span.diff { background: var(--accent-soft); color: var(--accent-strong); font-weight: 700; }
  .summary { margin: 0; font-size: 1.1rem; }
  .summary strong { color: var(--accent-strong); }
  .hint { margin: 0; color: var(--fg-muted); font-size: 0.92rem; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap; }
</style>
