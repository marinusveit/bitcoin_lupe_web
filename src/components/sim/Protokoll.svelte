<script lang="ts">
  import type { EventKind, World } from '../../lib/sim';
  import { isHighlightedBlock, isHighlightedTx, type Highlight } from './helpers';

  interface Props {
    world: World;
    version: number;
    limit: number;
    highlight: Highlight;
    onhighlight: (h: Highlight) => void;
  }
  let { world, version, limit, highlight, onhighlight }: Props = $props();

  let hideRelay = $state(false);
  const uid = Math.random().toString(36).slice(2, 8);

  /** Weiterleitungen: ein Knoten übernimmt etwas, das schon unterwegs war. */
  const RELAY: EventKind[] = ['tx-accepted', 'block-accepted'];

  function tone(kind: EventKind): string {
    if (kind.startsWith('attack') || kind === 'reorg' || kind.endsWith('rejected') || kind === 'tx-dropped') return 'alarm';
    if (kind.startsWith('block') || kind === 'retarget') return 'block';
    if (kind.startsWith('tx')) return 'tx';
    return 'neutral';
  }

  // Stabile Schlüssel je Ereignisobjekt, auch wenn das Protokoll vorne gekürzt wird.
  const ids = new WeakMap<object, number>();
  let nextId = 0;
  function idOf(e: object): number {
    let id = ids.get(e);
    if (id === undefined) {
      id = nextId++;
      ids.set(e, id);
    }
    return id;
  }

  const rows = $derived.by(() => {
    void version;
    const out = [];
    for (let i = world.log.length - 1; i >= 0 && out.length < limit; i--) {
      const e = world.log[i]!;
      if (hideRelay && RELAY.includes(e.kind)) continue;
      out.push({ key: idOf(e), e, tone: tone(e.kind) });
    }
    return out;
  });
</script>

<section class="card protokoll" aria-labelledby="log-titel-{uid}">
  <div class="kopf">
    <h3 id="log-titel-{uid}">Ereignisse</h3>
    <label class="filter"><input type="checkbox" bind:checked={hideRelay} /> Weiterleitungen ausblenden</label>
  </div>
  {#if rows.length === 0}
    <p class="leer">Noch nichts passiert. Drücke Start oder sende eine Transaktion.</p>
  {/if}
  <ol role="log" aria-live="polite" aria-relevant="additions" aria-labelledby="log-titel-{uid}">
    {#each rows as r (r.key)}
      <li class={r.tone}>
        <span class="tick mono">{r.e.tick}</span>
        <span class="text">
          {r.e.text}
          {#if r.e.txid}
            <button
              type="button"
              class="kuerzel"
              class:aktiv={isHighlightedTx(highlight, r.e.txid)}
              aria-pressed={isHighlightedTx(highlight, r.e.txid)}
              title="Transaktion auf Karte und in der Kette hervorheben"
              onclick={() => onhighlight({ kind: 'tx', id: r.e.txid! })}>Tx {r.e.txid.slice(0, 6)}</button
            >
          {/if}
          {#if r.e.blockHash}
            <button
              type="button"
              class="kuerzel"
              class:aktiv={isHighlightedBlock(highlight, r.e.blockHash)}
              aria-pressed={isHighlightedBlock(highlight, r.e.blockHash)}
              title="Block auf Karte und in der Kette hervorheben"
              onclick={() => onhighlight({ kind: 'block', id: r.e.blockHash! })}>Block {r.e.blockHash.slice(0, 6)}</button
            >
          {/if}
        </span>
      </li>
    {/each}
  </ol>
</section>

<style>
  .protokoll {
    min-width: 0;
  }
  .kopf {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.3rem 1rem;
    margin-bottom: 0.4rem;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  .filter {
    font-size: 0.85rem;
  }
  .leer {
    font-size: 0.9rem;
    color: var(--fg-muted);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 26rem;
    overflow-y: auto;
    font-size: 0.87rem;
  }
  li {
    display: grid;
    grid-template-columns: 3.2rem minmax(0, 1fr);
    gap: 0.5rem;
    padding: 0.25rem 0.3rem 0.25rem 0.5rem;
    border-left: 3px solid var(--border);
    border-bottom: 1px solid var(--bg-muted);
    line-height: 1.4;
  }
  li.tx {
    border-left-color: var(--msg-tx);
  }
  li.block {
    border-left-color: var(--msg-block);
  }
  li.alarm {
    border-left-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 7%, transparent);
  }
  .tick {
    color: var(--fg-muted);
    font-size: 0.8rem;
    text-align: right;
  }
  .text {
    overflow-wrap: anywhere;
  }
  .kuerzel {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    padding: 0 0.4em;
    margin-left: 0.25rem;
    border-radius: 4px;
    background: var(--bg-muted);
  }
  .kuerzel.aktiv {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
</style>
