<script lang="ts">
  import { isChainNode, type SimNode, type World } from '../../lib/sim';
  import { minerColor, type Highlight } from './helpers';

  interface Props {
    world: World;
    version: number;
    frac: number;
    selectedId: string | null;
    highlight: Highlight;
    /** Kapitel-Fassung ohne Knotentafel: Knoten sind nicht wählbar, der Hinweis darauf entfällt. */
    compact?: boolean;
    onselect: (id: string) => void;
  }
  let { world, version, frac, selectedId, highlight, compact = false, onselect }: Props = $props();

  const R = 26;
  const PAD = 90;
  /** Latenz, ab der eine Verbindung als langsam (gestrichelt) gilt. */
  const SLOW = 10;

  function hexPoints(r: number): string {
    const pts: string[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k + Math.PI / 6;
      pts.push(`${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
  }

  interface NodeView {
    node: SimNode;
    x: number;
    y: number;
    height: number | null;
    tipMiner: string | null;
    mempool: number;
    hashShare: number;
    dishonest: boolean;
    knows: boolean;
    label: string;
  }

  const view = $derived.by(() => {
    void version;
    const nodes = Object.values(world.nodes);
    const maxRate = Math.max(1, ...nodes.map((n) => (n.kind === 'miner' ? n.hashrate : 0)));
    const xs = nodes.map((n) => n.pos.x);
    const ys = nodes.map((n) => n.pos.y);
    const minX = Math.min(...xs) - PAD;
    const minY = Math.min(...ys) - PAD;
    const w = Math.max(...xs) + PAD - minX;
    const h = Math.max(...ys) + PAD + 20 - minY;
    const list: NodeView[] = nodes.map((n) => {
      const chain = isChainNode(n);
      const tip = chain ? n.blocks[n.tip] : undefined;
      let knows = false;
      if (chain && highlight) {
        knows = highlight.kind === 'tx' ? !!(n.mempool[highlight.id] || n.txIndex[highlight.id]) : !!n.blocks[highlight.id];
      }
      const kindText = n.kind === 'wallet' ? 'Wallet' : n.kind === 'full' ? 'Full Node' : 'Miner';
      return {
        node: n,
        x: n.pos.x,
        y: n.pos.y,
        height: tip ? tip.height : null,
        tipMiner: tip && tip.height > 0 ? tip.minerId : null,
        mempool: chain ? Object.keys(n.mempool).length : 0,
        hashShare: n.kind === 'miner' ? n.hashrate / maxRate : 0,
        dishonest: n.kind === 'miner' && n.dishonest,
        knows,
        label: `${n.name}, ${kindText}${tip ? `, Kettenhöhe ${tip.height}` : ''}${n.kind === 'miner' ? `, Hashrate ${n.hashrate}` : ''}`,
      };
    });
    const links = world.links
      .map((l) => ({ l, a: world.nodes[l.a], b: world.nodes[l.b] }))
      .filter((x): x is { l: (typeof world.links)[number]; a: SimNode; b: SimNode } => !!x.a && !!x.b);
    const hasSlow = links.some((x) => x.l.latencyTicks >= SLOW);
    return { viewBox: `${minX} ${minY} ${w} ${h}`, w, list, links, hasSlow };
  });

  // Auf schmalen Bildschirmen wird die Karte stark verkleinert; Knoten und Schrift wachsen
  // dann in SVG-Einheiten mit, damit sie lesbar bleiben.
  let figWidth = $state(0);
  const k = $derived(figWidth > 0 ? Math.min(1.9, Math.max(1, view.w / figWidth / 1.5)) : 1);
  const r = $derived(R * k);
  const HEX = $derived(hexPoints(r));
  const HEX_RING = $derived(hexPoints(r + 7 * k));

  const messages = $derived.by(() => {
    void version;
    const now = world.tick + frac;
    return world.messagesInFlight.flatMap((m) => {
      const a = world.nodes[m.from];
      const b = world.nodes[m.to];
      if (!a || !b) return [];
      const span = Math.max(1, m.arrivesAt - m.sentAt);
      const p = Math.min(1, Math.max(0, (now - m.sentAt) / span));
      const hl =
        highlight !== null &&
        ((highlight.kind === 'tx' && m.kind === 'tx' && m.payload.txid === highlight.id) ||
          (highlight.kind === 'block' && m.kind === 'block' && m.payload.hash === highlight.id));
      return [{ id: m.id, kind: m.kind, x: a.pos.x + (b.pos.x - a.pos.x) * p, y: a.pos.y + (b.pos.y - a.pos.y) * p, hl }];
    });
  });

  /** Im Kapitel sind Knoten nur Bild (role="img"), sonst Umschaltknöpfe für die Knotentafel. */
  function nodeAttrs(id: string) {
    if (compact) return { role: 'img' };
    return {
      role: 'button',
      tabindex: 0,
      'aria-pressed': id === selectedId,
      onclick: () => onselect(id),
      onkeydown: (e: KeyboardEvent) => onKey(e, id),
    };
  }

  function onKey(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onselect(id);
    }
  }
</script>

<figure class="karte" bind:clientWidth={figWidth} style="--k: {k}">
  <svg viewBox={view.viewBox} role="group" aria-label="Netzkarte: Knoten, Verbindungen und Nachrichten">
    <g class="links">
      {#each view.links as { l, a, b } (`${l.a}-${l.b}`)}
        <line x1={a.pos.x} y1={a.pos.y} x2={b.pos.x} y2={b.pos.y} class:slow={l.latencyTicks >= SLOW}>
          <title>Verbindung {a.name} und {b.name}: {l.latencyTicks} {l.latencyTicks === 1 ? 'Tick' : 'Ticks'} Laufzeit</title>
        </line>
      {/each}
    </g>

    <!-- Nachrichten unter den Knoten, damit sie die Knotenkürzel nicht verdecken (k7-11). -->
    <g class="msgs" aria-hidden="true">
      {#each messages as m (m.id)}
        <circle class="msg {m.kind}" class:hl={m.hl} cx={m.x} cy={m.y} r={(m.hl ? 9 : 6.5) * k} />
      {/each}
    </g>

    <g class="nodes">
      {#each view.list as v (v.node.id)}
        <g
          class="node {v.node.kind}"
          class:selected={v.node.id === selectedId}
          class:dishonest={v.dishonest}
          class:knows={v.knows}
          class:waehlbar={!compact}
          transform="translate({v.x} {v.y})"
          aria-label={v.label}
          {...nodeAttrs(v.node.id)}
          style={v.node.kind === 'miner' ? `--mc: ${minerColor(v.node.id)}` : undefined}
        >
          {#if v.node.kind === 'wallet'}
            {#if v.knows || v.node.id === selectedId}<circle class="ring" r={r + 7 * k} />{/if}
            <circle class="shape" r={r - 2} />
            <text class="initial" dy="0.35em">{v.node.name.slice(0, 1)}</text>
          {:else}
            {#if v.knows || v.node.id === selectedId}<polygon class="ring" points={HEX_RING} />{/if}
            <polygon class="shape" points={HEX} />
            {#if v.node.kind === 'miner'}
              <text class="initial small" dy="0.35em">{v.node.name}</text>
            {:else}
              <text class="initial small" dy="0.35em">{v.node.name.replace(/^Knoten\s*/, 'K')}</text>
            {/if}
          {/if}

          {#if v.node.kind === 'miner'}
            <rect class="bar-bg" x={-r} y={r + 5 * k} width={r * 2} height={6 * k} rx="3" />
            <rect class="bar" x={-r} y={r + 5 * k} width={Math.max(3, r * 2 * v.hashShare)} height={6 * k} rx="3" />
          {/if}

          {#if v.mempool > 0}
            <g class="mempool" transform="translate({r - 2} {-r + 2}) scale({k})">
              <circle r="11" />
              <text dy="0.35em">{v.mempool}</text>
            </g>
          {/if}

          {#if v.node.kind === 'wallet'}
            <text class="name" y={r + 21 * k}>{v.node.name}</text>
          {/if}
          {#if v.height !== null}
            <g class="height" transform="translate(0 {v.node.kind === 'miner' ? r + 32 * k : r + 22 * k})">
              {#if v.tipMiner}
                <rect x={-38 * k} y={-11 * k} width={11 * k} height={11 * k} rx="2" style="fill: {minerColor(v.tipMiner)}" />
              {/if}
              <text x={-23 * k} y="0" class="hoehe">Höhe {v.height}</text>
            </g>
          {/if}
        </g>
      {/each}
    </g>

  </svg>
  <figcaption>
    <span class="key"><svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" class="msg tx" /></svg>Transaktion</span>
    <span class="key"><svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" class="msg block" /></svg>Block</span>
    <span class="key"><svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" class="mp" /></svg>Tx im Mempool</span>
    <span class="key"><svg viewBox="0 0 12 12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="2" style="fill: var(--miner-1)" /></svg>Kästchen bei „Höhe“: Farbe = Miner des obersten Blocks</span>
    {#if view.hasSlow}
      <span class="key"><svg viewBox="0 0 24 12" aria-hidden="true"><line x1="0" y1="6" x2="24" y2="6" class="slowkey" /></svg>langsame Verbindung</span>
    {/if}
    {#if !compact}
      <span class="hint">Klicke auf einen Knoten für Details.</span>
    {/if}
  </figcaption>
</figure>

<style>
  .karte {
    margin: 0;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.4rem 0.4rem 0.6rem;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    font-family: var(--font-sans);
  }
  .links line {
    stroke: var(--border);
    stroke-width: 3;
  }
  .links line.slow {
    stroke-dasharray: 8 7;
  }
  .node {
    outline: none;
  }
  .node.waehlbar {
    cursor: pointer;
  }
  .node .shape {
    fill: var(--bg-elevated);
    stroke: var(--fg-muted);
    stroke-width: 2;
  }
  .node.wallet .shape {
    fill: var(--bg-muted);
    stroke: var(--fg);
  }
  .node.miner .shape {
    fill: color-mix(in srgb, var(--mc) 22%, var(--bg-elevated));
    stroke: var(--mc);
    stroke-width: 3;
  }
  .node.dishonest .shape {
    stroke: var(--danger);
    stroke-width: 4;
    stroke-dasharray: 6 3;
  }
  .node .ring {
    fill: none;
    stroke: var(--fg);
    stroke-width: 2;
  }
  .node.knows .ring {
    stroke: var(--accent);
    stroke-width: 3;
  }
  .node.selected .ring {
    stroke: var(--fg);
    stroke-width: 2.5;
  }
  .node:focus-visible .shape {
    stroke: var(--accent);
    stroke-width: 4;
  }
  .node.waehlbar:hover .shape {
    filter: brightness(1.05);
  }
  text {
    fill: var(--fg);
    text-anchor: middle;
    pointer-events: none;
  }
  .initial {
    font-weight: 700;
    font-size: calc(23px * var(--k));
  }
  .initial.small {
    font-size: calc(17px * var(--k));
  }
  .name {
    font-size: calc(18px * var(--k));
  }
  .hoehe {
    font-size: calc(16px * var(--k));
    fill: var(--fg-muted);
    text-anchor: start;
  }
  .bar-bg {
    fill: var(--bg-muted);
    stroke: var(--border);
  }
  .bar {
    fill: var(--mc);
  }
  .mempool circle,
  .mp {
    fill: var(--accent-soft);
    stroke: var(--accent);
    stroke-width: 2;
  }
  .mempool text {
    font-size: 13px;
    font-weight: 700;
  }
  .msg {
    stroke: var(--bg-elevated);
    stroke-width: 2;
  }
  .msg.tx {
    fill: var(--msg-tx);
  }
  .msg.block {
    fill: var(--msg-block);
  }
  .msg.hl {
    stroke: var(--fg);
    stroke-width: 3;
  }
  figcaption {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1rem;
    padding: 0 0.5rem;
    font-size: 0.85rem;
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  .key svg {
    width: 12px;
    height: 12px;
  }
  .key svg[viewBox='0 0 24 12'] {
    width: 24px;
  }
  .slowkey {
    stroke: var(--fg-muted);
    stroke-width: 2;
    stroke-dasharray: 4 3;
  }
  .hint {
    margin-left: auto;
  }
</style>
