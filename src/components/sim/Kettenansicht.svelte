<script lang="ts">
  import { formatBtc, type Block } from '../../lib/sim';
  import { blockHasTx, isHighlightedBlock, minerColor, type Highlight } from './helpers';

  interface Props {
    blocks: Block[];
    /** Blöcke der hervorgehobenen besten Kette. */
    best: Set<string>;
    /** Blöcke, die noch Teil irgendeiner Knotenkette sind (sonst grau = verwaist). Standard: `best`. */
    active?: Set<string>;
    /** Zurückgehaltene Blöcke eines Angreifers. */
    privateSet?: Set<string>;
    /** Beschriftungszeilen je Blockhash (welche Knoten ihn als Tip haben). */
    tips?: Record<string, string[]>;
    minerNames: Record<string, string>;
    highlight: Highlight;
    onhighlight: (h: Highlight) => void;
    /** Höchstens so viele Höhen (Spalten) anzeigen, die neuesten. */
    maxCols?: number;
    label: string;
  }
  let {
    blocks,
    best,
    active,
    privateSet,
    tips,
    minerNames,
    highlight,
    onhighlight,
    maxCols = 24,
    label,
  }: Props = $props();

  const W = 78;
  const H = 40;
  const GAP_X = 22;
  const GAP_Y = 30;
  const PAD = 6;

  interface Placed {
    b: Block;
    x: number;
    y: number;
    lane: number;
    cls: 'best' | 'side' | 'orphan' | 'private';
  }

  const layout = $derived.by(() => {
    const act = active ?? best;
    const maxH = blocks.reduce((m, b) => Math.max(m, b.height), 0);
    const minH = Math.max(0, maxH - maxCols + 1);
    const shown = blocks.filter((b) => b.height >= minH).sort((a, b) => a.height - b.height || a.timestampTick - b.timestampTick);
    const lane: Record<string, number> = {};
    // Welche Spur ist an einer Höhe schon belegt?
    const used = new Set<string>();
    let nextLane = 1;
    for (const b of shown) if (best.has(b.hash)) {
      lane[b.hash] = 0;
      used.add(`${b.height}:0`);
    }
    for (const b of shown) {
      if (lane[b.hash] !== undefined) continue;
      const parentLane = lane[b.prevHash];
      if (parentLane !== undefined && parentLane > 0 && !used.has(`${b.height}:${parentLane}`)) {
        lane[b.hash] = parentLane;
      } else {
        lane[b.hash] = nextLane++;
      }
      used.add(`${b.height}:${lane[b.hash]}`);
    }
    const tipLines = tips ? Math.max(1, ...shown.map((b) => tips[b.hash]?.length ?? 0)) : 0;
    const rowH = H + GAP_Y - 10 + tipLines * 13;
    const placed: Placed[] = shown.map((b) => ({
      b,
      lane: lane[b.hash]!,
      x: PAD + (b.height - minH) * (W + GAP_X),
      y: PAD + lane[b.hash]! * rowH,
      cls: privateSet?.has(b.hash) ? 'private' : best.has(b.hash) ? 'best' : act.has(b.hash) ? 'side' : 'orphan',
    }));
    const byHash: Record<string, Placed> = {};
    for (const p of placed) byHash[p.b.hash] = p;
    const edges = placed.flatMap((p) => {
      const parent = byHash[p.b.prevHash];
      if (!parent) return [];
      const x1 = parent.x + W;
      const y1 = parent.y + H / 2;
      const x2 = p.x;
      const y2 = p.y + H / 2;
      const mx = (x1 + x2) / 2;
      return [{ id: p.b.hash, d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, cls: p.cls }];
    });
    const cols = maxH - minH + 1;
    const lanes = Math.max(1, nextLane);
    return {
      placed,
      edges,
      width: PAD * 2 + cols * W + (cols - 1) * GAP_X,
      height: PAD * 2 + (lanes - 1) * rowH + H + tipLines * 13 + 2,
      skipped: minH,
    };
  });

  let scroller: HTMLDivElement | undefined = $state();
  // Nur bei neuer Spalte ans rechte Ende springen, nicht bei jedem Tick.
  const width = $derived(layout.width);
  $effect(() => {
    void width;
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  });

  function pick(b: Block) {
    onhighlight({ kind: 'block', id: b.hash });
  }
  function onKey(e: KeyboardEvent, b: Block) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(b);
    }
  }
  function title(b: Block, cls: Placed['cls']): string {
    const state = { best: 'beste Kette', side: 'Nebenzweig, noch umkämpft', orphan: 'verwaist', private: 'geheim, noch nicht veröffentlicht' }[cls];
    const reward = b.txs[0]?.outputs[0]?.value ?? 0;
    return b.height === 0
      ? `Genesis-Block ${b.hash}`
      : `Block ${b.height} von ${minerNames[b.minerId] ?? b.minerId} (${state})\nHash ${b.hash}\n${b.txs.length - 1} Transaktionen, Belohnung ${formatBtc(reward)}\nGefunden in Tick ${b.timestampTick}`;
  }
</script>

<div class="scroller" bind:this={scroller}>
  {#if layout.skipped > 0}
    <p class="skip">Ältere Blöcke bis Höhe {layout.skipped - 1} ausgeblendet.</p>
  {/if}
  <svg width={layout.width} height={layout.height} viewBox="0 0 {layout.width} {layout.height}" role="group" aria-label={label}>
    {#each layout.edges as e (e.id)}
      <path class="edge {e.cls}" d={e.d} />
    {/each}
    {#each layout.placed as p (p.b.hash)}
      <g
        class="chip {p.cls}"
        class:genesis={p.b.height === 0}
        class:hl={isHighlightedBlock(highlight, p.b.hash) || blockHasTx(highlight, p.b.txs)}
        transform="translate({p.x} {p.y})"
        style="--mc: {p.b.height === 0 ? 'var(--fg-muted)' : minerColor(p.b.minerId)}"
        role="button"
        tabindex="0"
        aria-label={title(p.b, p.cls).split('\n')[0]}
        onclick={() => pick(p.b)}
        onkeydown={(e) => onKey(e, p.b)}
      >
        <title>{title(p.b, p.cls)}</title>
        <rect class="box" width={W} height={H} rx="6" />
        <rect class="stripe" width="6" height={H} rx="3" />
        <text x="12" y="16" class="top">
          {p.b.height === 0 ? 'Genesis' : `#${p.b.height} ${minerNames[p.b.minerId] ?? p.b.minerId}`}
        </text>
        <text x="12" y="32" class="hash">{p.b.hash.slice(0, 7)}</text>
        {#each tips?.[p.b.hash] ?? [] as line, i (i)}
          <text x={W / 2} y={H + 13 + i * 13} class="tips">{line}</text>
        {/each}
      </g>
    {/each}
  </svg>
</div>

<style>
  .scroller {
    overflow-x: auto;
    max-width: 100%;
    padding-bottom: 0.2rem;
  }
  .skip {
    font-size: 0.8rem;
    color: var(--fg-muted);
    margin: 0 0 0.3rem;
  }
  svg {
    display: block;
    font-family: var(--font-sans);
  }
  .edge {
    fill: none;
    stroke: var(--border);
    stroke-width: 2;
  }
  .edge.best {
    stroke: var(--fg-muted);
  }
  .edge.private {
    stroke: var(--danger);
    stroke-dasharray: 4 3;
  }
  .chip {
    cursor: pointer;
    outline: none;
  }
  .box {
    fill: color-mix(in srgb, var(--mc) 16%, var(--bg-elevated));
    stroke: var(--mc);
    stroke-width: 1.5;
  }
  .stripe {
    fill: var(--mc);
  }
  .chip.best .box {
    stroke: var(--fg);
    stroke-width: 2.5;
  }
  .chip.orphan .box {
    fill: var(--bg-muted);
    stroke: var(--border);
  }
  .chip.orphan .stripe {
    fill: var(--border);
  }
  .chip.orphan text {
    fill: var(--fg-muted);
  }
  .chip.private .box {
    stroke: var(--danger);
    stroke-width: 2;
    stroke-dasharray: 5 3;
  }
  .chip.genesis .box {
    fill: var(--bg-muted);
  }
  .chip.hl .box {
    stroke: var(--accent);
    stroke-width: 3.5;
  }
  .chip:focus-visible .box {
    stroke: var(--accent);
    stroke-width: 3.5;
  }
  text {
    fill: var(--fg);
    pointer-events: none;
  }
  .top {
    font-size: 12px;
    font-weight: 600;
  }
  .hash {
    font-family: var(--font-mono);
    font-size: 11px;
    fill: var(--fg-muted);
  }
  .tips {
    font-size: 10.5px;
    text-anchor: middle;
    fill: var(--fg-muted);
  }
</style>
