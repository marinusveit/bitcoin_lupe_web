<script lang="ts">
  import { sha256Hex } from '../lib';

  interface Block {
    data: string;
    nonce: number;
  }

  const ZEROS = '0000';
  const GENESIS_PREV = '0'.repeat(64);
  // Vorab gefundene Nonces, damit die Kette beim Laden sofort gültig ist.
  const START: Block[] = [
    { data: 'Coinbase: 50 BTC an Alice', nonce: 65131 },
    { data: 'Alice zahlt Bob 10 BTC', nonce: 16662 },
    { data: 'Bob zahlt Carol 3 BTC', nonce: 65293 },
    { data: 'Carol zahlt Alice 1 BTC', nonce: 39468 },
  ];

  let blocks: Block[] = $state(START.map((b) => ({ ...b })));
  let mining: number | null = $state(null);
  let tries = $state(0);
  let frame = 0;

  const hashOf = (height: number, prev: string, b: Block) => sha256Hex(`${height}|${prev}|${b.data}|${b.nonce}`);

  const chain = $derived.by(() => {
    const out: { prev: string; hash: string; valid: boolean }[] = [];
    let prev = GENESIS_PREV;
    blocks.forEach((b, i) => {
      const hash = hashOf(i + 1, prev, b);
      out.push({ prev, hash, valid: hash.startsWith(ZEROS) });
      prev = hash;
    });
    return out;
  });

  const invalidCount = $derived(chain.filter((c) => !c.valid).length);

  function mine(i: number) {
    if (mining !== null) return;
    mining = i;
    tries = 0;
    const prev = chain[i]!.prev;
    const data = blocks[i]!.data;
    let nonce = 0;
    // In Häppchen pro Bildschirm-Frame suchen, damit die Seite bedienbar bleibt.
    const step = () => {
      const end = nonce + 4000;
      for (; nonce < end; nonce++) {
        if (hashOf(i + 1, prev, { data, nonce }).startsWith(ZEROS)) {
          blocks[i]!.nonce = nonce;
          tries += nonce - (end - 4000) + 1;
          mining = null;
          return;
        }
      }
      tries += 4000;
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  function reset() {
    cancelAnimationFrame(frame);
    mining = null;
    tries = 0;
    blocks = START.map((b) => ({ ...b }));
  }

  // Beim Verlassen der Seite laufendes Minen abbrechen (nur im Browser).
  $effect(() => () => cancelAnimationFrame(frame));
</script>

<div class="demo">
  <div class="status">
    <p class="count" class:ok={invalidCount === 0} role="status">
      {#if invalidCount === 0}
        Alle Blöcke sind gültig.
      {:else}
        Blöcke neu zu minen: <strong>{invalidCount}</strong>
      {/if}
    </p>
    <button onclick={reset}>Zurücksetzen</button>
  </div>

  <ol class="chain">
    {#each blocks as block, i (i)}
      {@const c = chain[i]!}
      <li class="block" class:valid={c.valid} class:invalid={!c.valid}>
        <div class="top">
          <strong>Block {i + 1}</strong>
          <span class="state">{c.valid ? 'gültig' : 'ungültig'}</span>
        </div>
        <label>Daten (Transaktionen)
          <textarea rows="2" bind:value={block.data} disabled={mining === i}></textarea>
        </label>
        <label>Nonce
          <input type="number" bind:value={block.nonce} min="0" disabled={mining === i} />
        </label>
        <div class="field">
          <span class="lbl">Vorheriger Hash</span>
          <span class="hash" class:broken={i > 0 && !chain[i - 1]!.valid}>{c.prev}</span>
        </div>
        <div class="field">
          <span class="lbl">Hash</span>
          <span class="hash"><span class="z">{c.hash.slice(0, c.hash.match(/^0*/)![0].length)}</span>{c.hash.slice(c.hash.match(/^0*/)![0].length)}</span>
        </div>
        <button onclick={() => mine(i)} disabled={mining !== null || c.valid}>
          {mining === i ? `Suche … ${tries.toLocaleString('de-DE')} Versuche` : 'Block neu minen'}
        </button>
      </li>
    {/each}
  </ol>
  <p class="note">
    Jeder Hash wird aus Blockhöhe, vorherigem Hash, Daten und Nonce berechnet. Gültig ist ein Block, wenn sein Hash
    mit vier Nullen beginnt. Ändere die Daten in Block 2 und beobachte, was mit den Blöcken danach passiert.
  </p>
</div>

<style>
  .demo { display: grid; gap: 1rem; }
  .status { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .count { margin: 0; font-size: 1.05rem; color: var(--danger); }
  .count.ok { color: var(--ok); }
  .chain { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.9rem; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .block { display: grid; gap: 0.55rem; align-content: start; padding: 0.8rem; border: 1px solid var(--border); border-top: 4px solid; border-radius: var(--radius); background: var(--bg-elevated); min-width: 0; }
  .block.valid { border-top-color: var(--ok); }
  .block.invalid { border-top-color: var(--danger); background: color-mix(in srgb, var(--danger) 6%, var(--bg-elevated)); }
  .top { display: flex; justify-content: space-between; align-items: baseline; }
  .state { font-size: 0.85rem; font-weight: 600; }
  .valid .state { color: var(--ok); }
  .invalid .state { color: var(--danger); }
  label, .field { display: grid; gap: 0.2rem; min-width: 0; }
  textarea, input { width: 100%; }
  textarea { resize: vertical; }
  .lbl { font-size: 0.85rem; color: var(--fg-muted); }
  .hash { font-size: 0.78rem; line-height: 1.4; }
  .hash.broken { color: var(--danger); }
  .z { color: var(--accent-strong); font-weight: 700; }
  .note { font-size: 0.92rem; color: var(--fg-muted); margin: 0; }
  @media (max-width: 1000px) { .chain { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .chain { grid-template-columns: 1fr; } }
</style>
