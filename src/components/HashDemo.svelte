<script lang="ts">
  import { hash160Hex, sha256Hex, toBitString } from '../lib/hash';

  const START_TEXT = 'Hochschule München';

  let text = $state(START_TEXT);
  let view = $state<'hex' | 'bits'>('hex');

  const hex = $derived(sha256Hex(text));
  const bitRows = $derived.by(() => {
    const bits = toBitString(hex);
    return Array.from({ length: 8 }, (_, i) => bits.slice(i * 32, (i + 1) * 32));
  });
  const hex160 = $derived(hash160Hex(text));

  function reset() {
    text = START_TEXT;
    view = 'hex';
  }
</script>

<div class="demo">
  <label class="field">
    <span>Eingabe (beliebiger Text)</span>
    <input type="text" bind:value={text} spellcheck="false" autocomplete="off" />
  </label>

  <div class="result">
    <div class="result-head">
      <strong>SHA-256</strong>
      <div class="switch" role="group" aria-label="Darstellung wählen">
        <button type="button" aria-pressed={view === 'hex'} onclick={() => (view = 'hex')}>Hex</button>
        <button type="button" aria-pressed={view === 'bits'} onclick={() => (view = 'bits')}>Bits</button>
      </div>
    </div>

    {#if view === 'hex'}
      <p class="hash hex-out">{hex}</p>
    {:else}
      <div class="bits hash" aria-label="SHA-256 als 256 Bit in 8 Zeilen">
        {#each bitRows as row, r (r)}
          <div class="bit-row">
            {#each row as bit, i (i)}<span class:one={bit === '1'}>{bit}</span>{/each}
          </div>
        {/each}
      </div>
    {/if}
    <p class="count">Hex-Zeichen: 64, Bits: 256</p>
  </div>

  <div class="result">
    <div class="result-head"><strong>HASH160</strong> <span class="note">RIPEMD-160 von SHA-256</span></div>
    <p class="hash hex-out">{hex160}</p>
    <p class="count">Hex-Zeichen: 40, Bits: 160</p>
  </div>

  <p class="hint">
    Die Ausgabe hat immer dieselbe Länge, egal ob du ein Wort oder einen ganzen Roman eingibst.
    Leer lassen geht auch: Auch der leere Text hat einen Hash.
  </p>

  <div class="actions">
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
    gap: 1.1rem;
  }
  .field { display: grid; gap: 0.3rem; }
  .field input { width: 100%; font-size: 1.05rem; }
  .result { border-top: 1px solid var(--border); padding-top: 0.9rem; }
  .result-head { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
  .note { color: var(--fg-muted); font-size: 0.88rem; }
  .switch { margin-left: auto; display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .switch button { border: 0; border-radius: 0; padding: 0.25rem 0.8rem; background: transparent; color: var(--fg-muted); }
  .switch button[aria-pressed='true'] { background: var(--accent-soft); color: var(--fg); font-weight: 600; }
  .hex-out { margin: 0; font-size: 0.95rem; line-height: 1.5; }
  .bits { display: grid; gap: 0.1rem; max-width: 34rem; }
  .bit-row { display: grid; grid-template-columns: repeat(32, 1fr); font-size: clamp(0.6rem, 2.7vw, 0.9rem); }
  .bit-row span { text-align: center; color: var(--fg-muted); opacity: 0.55; }
  .bit-row span.one { color: var(--fg); opacity: 1; font-weight: 600; }
  .bit-row span:nth-child(4n):not(:last-child) { border-right: 1px solid var(--border); }
  .count { margin: 0.4rem 0 0; color: var(--fg-muted); font-size: 0.88rem; }
  .hint { margin: 0; color: var(--fg-muted); font-size: 0.92rem; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap; }
</style>
