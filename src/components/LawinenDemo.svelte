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

  /** Bitunterschiede der bisherigen Zufallsänderungen, für den Mittelwert. */
  let history: number[] = $state([]);
  const mean = $derived(history.length ? history.reduce((a, b) => a + b, 0) / history.length : null);
  const meanText = $derived(mean === null ? '' : mean.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
  const lowest = $derived(history.length ? Math.min(...history) : null);
  const highest = $derived(history.length ? Math.max(...history) : null);

  /** Zuletzt per Knopf geändertes Zeichen (Position ab 1); `null` nach Handeingabe oder Zurücksetzen. */
  let lastChange = $state<{ pos: number; from: string; to: string } | null>(null);

  // Ausgangspunkt ist immer Text A: B unterscheidet sich danach in genau einem Zeichen von A.
  function changeOneChar() {
    const chars = Array.from(left);
    if (chars.length === 0) {
      right = ALPHABET[Math.floor(Math.random() * 26)]!;
      lastChange = null;
      return;
    }
    const pos = Math.floor(Math.random() * chars.length);
    const from = chars[pos]!;
    let to = from;
    while (to === from) {
      to = ALPHABET[Math.floor(Math.random() * ALPHABET.length)]!;
    }
    chars[pos] = to;
    right = chars.join('');
    lastChange = { pos: pos + 1, from, to };
    const newBits = toBitString(sha256Hex(right));
    const count = Array.from(bitsLeft, (b, i) => b !== newBits[i]).filter(Boolean).length;
    history = [...history, count];
  }

  /** Handeingabe: Zeichenänderung und Verlauf beziehen sich auf andere Texte und werden verworfen. */
  function onHandInput() {
    lastChange = null;
    history = [];
  }

  function reset() {
    lastChange = null;
    left = START_LEFT;
    right = START_RIGHT;
    history = [];
  }
</script>

<div class="demo">
  <div class="pair">
    {#each [{ id: 'l', label: 'Text A', bits: bitsLeft }, { id: 'r', label: 'Text B', bits: bitsRight }] as side (side.id)}
      <div class="side">
        <label class="field">
          <span>{side.label}</span>
          {#if side.id === 'l'}
            <input type="text" bind:value={left} oninput={onHandInput} spellcheck="false" autocomplete="off" />
          {:else}
            <input type="text" bind:value={right} oninput={onHandInput} spellcheck="false" autocomplete="off" />
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
    <strong>{diffCount} von 256 Bits</strong> unterschiedlich ({percent}&nbsp;%)
    {#if lastChange}
      <span class="change">Text B = Text A mit geändertem Zeichen {lastChange.pos}: <span class="hash">„{lastChange.from}“ → „{lastChange.to}“</span></span>
    {/if}
    {#if mean !== null}
      <span class="stat">Nach {history.length} {history.length === 1 ? 'Änderung' : 'Änderungen'}: im Mittel {meanText} Bits, kleinster Wert {lowest}, größter Wert {highest}</span>
    {/if}
  </p>
  <p class="hint">
    Farbig markiert sind die Bits, die sich unterscheiden. Schon ein einziges geändertes Zeichen kippt
    im Schnitt etwa die Hälfte aller Bits. Man nennt das Lawineneffekt.
  </p>

  <div class="aktionen">
    <button type="button" class="primary" onclick={changeOneChar}>Ein Zeichen von Text A ändern</button>
    <button type="button" class="reset" onclick={reset}>Zurücksetzen</button>
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
  .change { display: block; font-size: 0.95rem; margin-top: 0.2rem; }
  .change .hash { color: var(--accent-strong); font-weight: 700; white-space: pre; }
  .stat { display: block; font-size: 0.9rem; color: var(--fg-muted); margin-top: 0.2rem; }
  .hint { margin: 0; color: var(--fg-muted); font-size: 0.92rem; }
</style>
