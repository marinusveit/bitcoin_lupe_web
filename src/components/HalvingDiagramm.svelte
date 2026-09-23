<script lang="ts">
  import { blockSubsidy, HALVING_INTERVAL, SATOSHI_PER_BTC, totalSupply } from '../lib';

  const MAX_HEIGHT = 6_930_000;
  const TODAY = 920_000;
  const ERAS = Math.ceil(MAX_HEIGHT / HALVING_INTERVAL);

  let width = $state(720);
  let hover: number | null = $state(null);
  let pinned = $state(TODAY);

  const W = $derived(Math.max(300, width));
  const M = { left: 52, right: 14 };
  const PANEL = 150;
  const TOP1 = 26;
  const TOP2 = TOP1 + PANEL + 46;
  const H = TOP2 + PANEL + 48;

  const x = (h: number) => M.left + (h / MAX_HEIGHT) * (W - M.left - M.right);
  const y1 = (btc: number) => TOP1 + PANEL - (btc / 50) * PANEL;
  const y2 = (mio: number) => TOP2 + PANEL - (mio / 21) * PANEL;

  const year = (h: number) => Math.floor(2009 + (h / HALVING_INTERVAL) * 4);
  const btc = (sat: number) => sat / SATOSHI_PER_BTC;

  // Treppe der Blockbelohnung: waagrecht je Epoche, senkrecht bei jeder Halbierung.
  const rewardPath = $derived.by(() => {
    let d = `M${x(0)},${y1(50)}`;
    for (let e = 0; e < ERAS; e++) {
      const end = Math.min((e + 1) * HALVING_INTERVAL, MAX_HEIGHT);
      d += `H${x(end)}`;
      if (end < MAX_HEIGHT) d += `V${y1(btc(blockSubsidy(end)))}`;
    }
    return d;
  });

  // Die Gesamtmenge wächst je Epoche linear, also reichen die Epochengrenzen als Stützpunkte.
  const supplyPoints = $derived.by(() => {
    const pts: [number, number][] = [[x(0), y2(0)]];
    for (let e = 1; e <= ERAS; e++) {
      const h = Math.min(e * HALVING_INTERVAL, MAX_HEIGHT) - 1;
      pts.push([x(h), y2(btc(totalSupply(h)) / 1e6)]);
    }
    return pts;
  });
  const supplyLine = $derived('M' + supplyPoints.map((p) => p.join(',')).join('L'));
  const supplyArea = $derived(`${supplyLine}L${x(MAX_HEIGHT)},${y2(0)}L${x(0)},${y2(0)}Z`);

  const xStep = $derived(W < 560 ? 2_100_000 : 1_050_000);
  const xTicks = $derived(Array.from({ length: Math.floor(MAX_HEIGHT / xStep) + 1 }, (_, i) => i * xStep));

  const active = $derived(hover ?? pinned);
  const readout = $derived({
    height: active,
    year: year(active),
    reward: btc(blockSubsidy(active)),
    supply: btc(totalSupply(active)),
  });

  const nf = (n: number, d = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: 0 });
  const heightLabel = (h: number) => (h === 0 ? '0' : `${nf(h / 1e6, 2)} Mio.`);

  function toHeight(event: PointerEvent): number {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * W;
    const h = ((px - M.left) / (W - M.left - M.right)) * MAX_HEIGHT;
    return Math.round(Math.min(MAX_HEIGHT, Math.max(0, h)));
  }

  const eraRows = Array.from({ length: 10 }, (_, e) => {
    const first = e * HALVING_INTERVAL;
    return {
      era: e + 1,
      first,
      year: 2009 + e * 4,
      reward: btc(blockSubsidy(first)),
      supplyEnd: btc(totalSupply(first + HALVING_INTERVAL - 1)),
    };
  });
</script>

<div class="demo">
  <div class="readout" aria-live="polite">
    <div><span class="lbl">Blockhöhe</span><strong>{nf(readout.height)}</strong></div>
    <div><span class="lbl">Jahr (ungefähr)</span><strong>{readout.year}</strong></div>
    <div><span class="lbl">Blockbelohnung</span><strong>{nf(readout.reward, 8)} BTC</strong></div>
    <div><span class="lbl">Bitcoin insgesamt</span><strong>{nf(readout.supply, 0)} BTC</strong><span class="lbl">{nf((readout.supply / 21e6) * 100, 2)} % von 21 Mio.</span></div>
  </div>

  <div class="chart" bind:clientWidth={width}>
    <svg
      viewBox="0 0 {W} {H}"
      width={W}
      height={H}
      role="img"
      aria-label="Blockbelohnung und Gesamtmenge an Bitcoin über der Blockhöhe"
      onpointermove={(e) => (hover = toHeight(e))}
      onpointerdown={(e) => (pinned = toHeight(e))}
      onpointerleave={() => (hover = null)}
    >
      <!-- Feld 1: Blockbelohnung -->
      <text class="title" x={M.left} y={TOP1 - 10}>Blockbelohnung je Block in BTC</text>
      {#each [0, 10, 20, 30, 40, 50] as t (t)}
        <line class="grid" x1={M.left} x2={W - M.right} y1={y1(t)} y2={y1(t)} />
        <text class="tick" x={M.left - 8} y={y1(t) + 4} text-anchor="end">{t}</text>
      {/each}
      <path class="series" d={rewardPath} />

      <!-- Feld 2: Gesamtmenge -->
      <text class="title" x={M.left} y={TOP2 - 10}>Bitcoin insgesamt in Millionen</text>
      {#each [0, 5, 10, 15, 21] as t (t)}
        <line class="grid" x1={M.left} x2={W - M.right} y1={y2(t)} y2={y2(t)} />
        <text class="tick" x={M.left - 8} y={y2(t) + 4} text-anchor="end">{t}</text>
      {/each}
      <path class="area" d={supplyArea} />
      <path class="series" d={supplyLine} />

      <!-- gemeinsame x-Achse -->
      <line class="axis" x1={M.left} x2={W - M.right} y1={TOP2 + PANEL} y2={TOP2 + PANEL} />
      {#each xTicks as t (t)}
        <text class="tick" x={x(t)} y={TOP2 + PANEL + 18} text-anchor={t === 0 ? 'start' : 'middle'}>{heightLabel(t)}</text>
        <text class="tick year" x={x(t)} y={TOP2 + PANEL + 34} text-anchor={t === 0 ? 'start' : 'middle'}>{year(t)}</text>
      {/each}
      <text class="tick" x={W - M.right} y={H - 2} text-anchor="end">Blockhöhe und Jahr</text>

      <!-- heute -->
      <line class="today" x1={x(TODAY)} x2={x(TODAY)} y1={TOP1} y2={TOP2 + PANEL} />
      <text class="today-label" x={x(TODAY) + 5} y={TOP1 + 12}>heute (2026)</text>

      <!-- aktuelle Position -->
      <line class="cross" x1={x(active)} x2={x(active)} y1={TOP1} y2={TOP2 + PANEL} />
      <circle class="dot" cx={x(active)} cy={y1(readout.reward)} r="4.5" />
      <circle class="dot" cx={x(active)} cy={y2(readout.supply / 1e6)} r="4.5" />
    </svg>
  </div>

  <div class="below">
    <p class="hint">Fahre über das Diagramm oder tippe hinein, um die Werte an einer Stelle zu sehen. Die Jahre sind eine Näherung: 210 000 Blöcke dauern etwa vier Jahre.</p>
    <button onclick={() => { pinned = TODAY; hover = null; }}>Zurücksetzen</button>
  </div>

  <details>
    <summary>Als Tabelle anzeigen (erste zehn Epochen)</summary>
    <table>
      <thead><tr><th>Epoche</th><th class="num">ab Block</th><th class="num">ab Jahr ≈</th><th class="num">Belohnung</th><th class="num">insgesamt am Ende</th></tr></thead>
      <tbody>
        {#each eraRows as r (r.era)}
          <tr><td>{r.era}</td><td class="num">{nf(r.first)}</td><td class="num">{r.year}</td><td class="num">{nf(r.reward, 8)} BTC</td><td class="num">{nf(r.supplyEnd, 0)} BTC</td></tr>
        {/each}
      </tbody>
    </table>
  </details>
</div>

<style>
  .demo { display: grid; gap: 0.8rem; }
  .readout { display: grid; grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr)); gap: 0.6rem 1rem; }
  .readout div { display: grid; }
  .readout strong { font-size: 1.15rem; font-variant-numeric: tabular-nums; }
  .lbl { font-size: 0.82rem; color: var(--fg-muted); }
  .chart { width: 100%; touch-action: pan-y; }
  svg { display: block; width: 100%; height: auto; user-select: none; }
  .grid { stroke: var(--border); stroke-width: 1; }
  .axis { stroke: var(--fg-muted); stroke-width: 1; }
  .tick { fill: var(--fg-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .tick.year { fill: var(--fg); }
  .title { fill: var(--fg); font-size: 13px; font-weight: 600; }
  .series { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .area { fill: var(--accent); opacity: 0.1; }
  .today { stroke: var(--fg-muted); stroke-width: 1; }
  .today-label { fill: var(--fg-muted); font-size: 12px; }
  .cross { stroke: var(--fg); stroke-width: 1; opacity: 0.6; }
  .dot { fill: var(--accent); stroke: var(--bg); stroke-width: 2; }
  .below { display: flex; justify-content: space-between; align-items: start; gap: 1rem; flex-wrap: wrap; }
  .hint { font-size: 0.88rem; color: var(--fg-muted); margin: 0; flex: 1 1 20rem; }
  summary { cursor: pointer; color: var(--fg-muted); }
  details table { font-size: 0.9rem; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  @media (max-width: 480px) { details table { font-size: 0.78rem; } details th, details td { padding: 0.35rem 0.3rem; } }
</style>
