<script lang="ts">
  import { sha256Hex, startTextMining, type MiningHandle } from '../lib';

  /** Ein Block speichert neben Daten und Nonce den Hash, auf den er zeigt (wie `previous_block_id`). */
  interface Block {
    data: string;
    nonce: number;
    prev: string;
  }

  const ZEROS = '0000';
  const GENESIS_PREV = '0'.repeat(64);
  const hashOf = (height: number, prev: string, data: string, nonce: number) =>
    sha256Hex(`${height}|${prev}|${data}|${nonce}`);

  // Vorab gefundene Nonces, damit die Kette beim Laden sofort gültig ist. Die Zeiger werden
  // beim Start aus den Hashes abgeleitet.
  const START_DATA: { data: string; nonce: number }[] = [
    { data: 'Coinbase: 50 BTC an Alice', nonce: 65131 },
    { data: 'Alice zahlt Bob 10 BTC', nonce: 16662 },
    { data: 'Bob zahlt Carol 3 BTC', nonce: 65293 },
    { data: 'Carol zahlt Alice 1 BTC', nonce: 39468 },
  ];

  function startChain(): Block[] {
    const out: Block[] = [];
    let prev = GENESIS_PREV;
    START_DATA.forEach((b, i) => {
      out.push({ ...b, prev });
      prev = hashOf(i + 1, prev, b.data, b.nonce);
    });
    return out;
  }

  let blocks: Block[] = $state(startChain());
  let mining: number | null = $state(null);
  let tries = $state(0);
  let handle: MiningHandle | null = null;

  /** Pro Block: Hash, Arbeitsnachweis erfüllt, Zeiger passt zum Vorgänger, beides zusammen. */
  const chain = $derived.by(() => {
    const out: { hash: string; pow: boolean; linked: boolean; valid: boolean; expectedPrev: string }[] = [];
    blocks.forEach((b, i) => {
      const expectedPrev = i === 0 ? GENESIS_PREV : out[i - 1]!.hash;
      const hash = hashOf(i + 1, b.prev, b.data, b.nonce);
      const pow = hash.startsWith(ZEROS);
      const linked = b.prev === expectedPrev;
      out.push({ hash, pow, linked, valid: pow && linked, expectedPrev });
    });
    return out;
  });

  const firstInvalid = $derived(chain.findIndex((c) => !c.valid));
  /** Ab dem ersten ungültigen Block ist die ganze Kette dahinter betroffen. */
  const affected = $derived(firstInvalid < 0 ? 0 : blocks.length - firstInvalid);

  const leadingZeros = (hash: string) => hash.match(/^0*/)![0].length;

  /**
   * Repariert den Zeiger auf den Vorgänger und sucht ab der aktuellen Nonce weiter (wie ein
   * Miner, der hochzählt). Deshalb landet die Suche nie wieder bei der alten Nonce, und die
   * Folgeblöcke bleiben sichtbar ungültig.
   */
  function mine(i: number) {
    if (mining !== null) return;
    const block = blocks[i]!;
    block.prev = chain[i]!.expectedPrev;
    mining = i;
    tries = 0;
    // Die Suche läuft im Web Worker, damit die Seite bedienbar bleibt.
    const h = startTextMining(`${i + 1}|${block.prev}|${block.data}|`, ZEROS.length, (p) => (tries = p.iterations), {
      startNonce: block.nonce + 1,
    });
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
  <div class="status">
    <p class="count" class:ok={affected === 0} role="status">
      {#if affected === 0}
        Alle Blöcke sind gültig.
      {:else if affected === 1}
        Block {firstInvalid + 1} muss neu gemined werden.
      {:else}
        Block {firstInvalid + 1} und alle danach müssen neu gemined werden, einer nach dem anderen.
      {/if}
    </p>
    <button onclick={reset}>Zurücksetzen</button>
  </div>

  <ol class="chain">
    {#each blocks as block, i (i)}
      {@const c = chain[i]!}
      {@const z = leadingZeros(c.hash)}
      {@const behind = c.valid && firstInvalid >= 0 && i > firstInvalid}
      <li class="block" class:valid={c.valid && !behind} class:invalid={!c.valid} class:behind>
        <div class="top">
          <strong>Block {i + 1}</strong>
          <span class="state">{c.valid ? (behind ? 'Kette davor gebrochen' : 'gültig') : 'ungültig'}</span>
        </div>
        <label>Daten (Transaktionen)
          <textarea rows="2" bind:value={block.data} disabled={mining !== null}></textarea>
        </label>
        <label>Nonce
          <input type="number" bind:value={block.nonce} min="0" disabled={mining !== null} />
        </label>
        <div class="field">
          <span class="lbl">Zeigt auf (Hash des Vorgängers)</span>
          <span class="hash" class:broken={!c.linked}>{block.prev}</span>
          {#if !c.linked}
            <span class="why">Block {i} hat inzwischen einen anderen Hash. Der Zeiger ist veraltet.</span>
          {/if}
        </div>
        <div class="field">
          <span class="lbl">Eigener Hash</span>
          <span class="hash"><span class="z" class:ok={c.pow}>{c.hash.slice(0, z)}</span>{c.hash.slice(z)}</span>
          {#if !c.pow}
            <span class="why">Beginnt nicht mit {ZEROS}. Die Nonce passt nicht mehr.</span>
          {/if}
        </div>
        <button
          onclick={() => mine(i)}
          disabled={mining !== null || c.valid || i !== firstInvalid}
          title={!c.valid && i !== firstInvalid ? 'Erst den Block davor neu minen' : undefined}
        >
          {mining === i ? `Suche … ${tries.toLocaleString('de-DE')} Versuche` : 'Block neu minen'}
        </button>
      </li>
    {/each}
  </ol>
  <p class="note">
    Jeder Hash wird aus Blockhöhe, dem Zeiger auf den Vorgänger, den Daten und der Nonce berechnet. Gültig ist
    ein Block, wenn sein Hash mit vier Nullen beginnt und sein Zeiger zum aktuellen Hash des Vorgängers passt.
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
  .block.behind { border-top-color: var(--warn); }
  .behind .state { color: var(--warn); }
  .top { display: flex; justify-content: space-between; align-items: baseline; }
  .state { font-size: 0.85rem; font-weight: 600; }
  .valid .state { color: var(--ok); }
  .invalid .state { color: var(--danger); }
  label, .field { display: grid; gap: 0.2rem; min-width: 0; }
  textarea, input { width: 100%; }
  textarea { resize: vertical; }
  .lbl { font-size: 0.85rem; color: var(--fg-muted); }
  .hash { font-size: 0.78rem; line-height: 1.4; }
  .hash.broken { color: var(--danger); text-decoration: line-through; text-decoration-thickness: 1px; }
  .z { font-weight: 700; color: var(--danger); }
  .z.ok { color: var(--accent-strong); }
  .why { font-size: 0.8rem; color: var(--danger); }
  .note { font-size: 0.92rem; color: var(--fg-muted); margin: 0; }
  @media (max-width: 1000px) { .chain { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .chain { grid-template-columns: 1fr; } }
</style>
