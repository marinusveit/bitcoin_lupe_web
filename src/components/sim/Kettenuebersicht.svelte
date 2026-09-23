<script lang="ts">
  import { chainHashes, isChainNode, referenceNode, type Block, type World } from '../../lib/sim';
  import Kettenansicht from './Kettenansicht.svelte';
  import { minerColor, shortName, type Highlight } from './helpers';

  interface Props {
    world: World;
    version: number;
    highlight: Highlight;
    onhighlight: (h: Highlight) => void;
  }
  let { world, version, highlight, onhighlight }: Props = $props();

  const data = $derived.by(() => {
    void version;
    const all: Record<string, Block> = {};
    const active = new Set<string>();
    const privateSet = new Set<string>();
    const tips: Record<string, string[]> = {};
    const minerNames: Record<string, string> = {};
    const miners: { id: string; name: string }[] = [];
    for (const n of Object.values(world.nodes)) {
      if (!isChainNode(n)) continue;
      Object.assign(all, n.blocks);
      for (const h of chainHashes(n.blocks, n.tip)) active.add(h);
      (tips[n.tip] ??= []).push(shortName(n));
      if (n.kind === 'miner') {
        minerNames[n.id] = n.name;
        miners.push({ id: n.id, name: n.name });
        for (const b of n.privateChain) {
          all[b.hash] = b;
          privateSet.add(b.hash);
        }
      }
    }
    // Blöcke entfernter Miner behalten einen lesbaren Namen.
    for (const b of Object.values(all)) minerNames[b.minerId] ??= b.minerId.toUpperCase();
    const ref = referenceNode(world);
    const best = new Set(chainHashes(ref.blocks, ref.tip));
    // Tip-Beschriftung: „alle Knoten“, wenn sich das Netz einig ist, sonst Namen in Zeilen zu je drei.
    const chainCount = Object.values(world.nodes).filter(isChainNode).length;
    const tipLines: Record<string, string[]> = {};
    for (const [h, names] of Object.entries(tips)) {
      if (names.length === chainCount) tipLines[h] = ['alle Knoten'];
      else for (let i = 0; i < names.length; i += 3) (tipLines[h] ??= []).push(names.slice(i, i + 3).join(' '));
    }
    const blocks = Object.values(all);
    const orphans = blocks.filter((b) => !active.has(b.hash) && !privateSet.has(b.hash)).length;
    return { blocks, best, active, privateSet, tips: tipLines, minerNames, miners, orphans, hasPrivate: privateSet.size > 0 };
  });
</script>

<section class="card uebersicht" aria-labelledby="kette-titel">
  <h3 id="kette-titel">Kettenübersicht</h3>
  <p class="erkl">
    Alle Blöcke, die irgendein Knoten kennt. Die dick umrandete Reihe ist die beste Kette (die mit der meisten Arbeit).
    Unter einem Block steht, welche Knoten ihn gerade als Spitze ihrer Kette haben.
  </p>
  <Kettenansicht
    blocks={data.blocks}
    best={data.best}
    active={data.active}
    privateSet={data.privateSet}
    tips={data.tips}
    minerNames={data.minerNames}
    {highlight}
    {onhighlight}
    maxCols={30}
    label="Block-Graph aller bekannten Blöcke"
  />
  <ul class="legende" aria-label="Legende">
    {#each data.miners as m (m.id)}
      <li><span class="sw" style="background: {minerColor(m.id)}"></span>{m.name}</li>
    {/each}
    <li><span class="sw best"></span>beste Kette</li>
    <li><span class="sw side"></span>Nebenzweig, noch umkämpft</li>
    <li><span class="sw orphan"></span>verwaist ({data.orphans})</li>
    {#if data.hasPrivate}
      <li><span class="sw private"></span>geheim zurückgehalten</li>
    {/if}
  </ul>
</section>

<style>
  .uebersicht {
    min-width: 0;
  }
  h3 {
    margin: 0 0 0.3rem;
    font-size: 1.05rem;
  }
  .erkl {
    font-size: 0.9rem;
    color: var(--fg-muted);
    margin-bottom: 0.6rem;
  }
  .legende {
    list-style: none;
    padding: 0;
    margin: 0.6rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1rem;
    font-size: 0.85rem;
  }
  .legende li {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .sw {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: var(--radius-sm);
  }
  .sw.best {
    border: 2.5px solid var(--fg);
  }
  .sw.side {
    border: 1.5px solid var(--fg-muted);
  }
  .sw.orphan {
    background: var(--bg-muted);
    border: 1.5px solid var(--border);
  }
  .sw.private {
    border: 2px dashed var(--danger);
  }
</style>
