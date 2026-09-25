<script lang="ts">
  import { onMount } from 'svelte';
  import { blockSubsidy, HALVING_INTERVAL, SATOSHI_PER_BTC, totalSupply } from '../lib';

  const MAX_HEIGHT = 6_930_000;
  /** Ausschnitt „bis 2048“: zehn Epochen. Dort sind die Stufen gut zu sehen; danach ist der Zuschuss kaum von 0 zu unterscheiden. */
  const SHORT_HEIGHT = 2_100_000;
  let range: 'short' | 'full' = $state('short');
  const maxH = $derived(range === 'short' ? SHORT_HEIGHT : MAX_HEIGHT);
  const ERAS = $derived(Math.ceil(maxH / HALVING_INTERVAL));

  /**
   * Blockhöhe „heute“ ohne Netzzugriff geschätzt: Block 840 000 kam am 20.04.2024, danach im Mittel
   * ein Block alle 10 Minuten (600 000 ms).
   */
  const estimateHeight = (ms: number) =>
    Math.min(MAX_HEIGHT, Math.max(0, 840_000 + Math.floor((ms - Date.UTC(2024, 3, 20)) / 600_000)));
  // Fester Startwert für das vorgerenderte HTML und die Hydrierung (Stand 25.09.2026); erst im Browser
  // wird auf das aktuelle Datum umgestellt, damit Server- und Browser-Ausgabe beim Hydrieren gleich sind.
  const STAND_MS = Date.UTC(2026, 8, 25);
  let today = $state(estimateHeight(STAND_MS));
  let todayYear = $state(new Date(STAND_MS).getUTCFullYear());

  let width = $state(720);
  let hover: number | null = $state(null);
  let pinned = $state(estimateHeight(STAND_MS));

  // onMount läuft nur im Browser, nach dem Hydrieren.
  onMount(() => {
    const wasToday = pinned === today;
    today = estimateHeight(Date.now());
    todayYear = new Date().getFullYear();
    if (wasToday) pinned = today;
  });

  const W = $derived(Math.max(300, width));
  const M = { left: 52, right: 14 };
  const PANEL = 150;
  const TOP1 = 26;
  // Lücke zwischen den Feldern: Titel des unteren Felds und darunter die Beschriftung der Obergrenze.
  const TOP2 = TOP1 + PANEL + 56;
  const H = TOP2 + PANEL + 48;

  const x = (h: number) => M.left + (h / maxH) * (W - M.left - M.right);
  const y1 = (btc: number) => TOP1 + PANEL - (btc / 50) * PANEL;
  const y2 = (mio: number) => TOP2 + PANEL - (mio / 21) * PANEL;

  // Echte Halving-Zeitpunkte (Jan 2009, 28.11.2012, 09.07.2016, 11.05.2020, 20.04.2024), danach vier Jahre je Epoche.
  const ERA_START = [2009.0, 2012.9, 2016.5, 2020.35, 2024.3];
  const eraStart = (e: number) => (e < ERA_START.length ? ERA_START[e]! : ERA_START[ERA_START.length - 1]! + (e - ERA_START.length + 1) * 4);
  const year = (h: number) => {
    const e = Math.floor(h / HALVING_INTERVAL);
    const f = (h - e * HALVING_INTERVAL) / HALVING_INTERVAL;
    return Math.floor(eraStart(e) + f * (eraStart(e + 1) - eraStart(e)));
  };
  const btc = (sat: number) => sat / SATOSHI_PER_BTC;

  // Treppe des Blockzuschusses: waagrecht je Epoche, senkrecht bei jeder Halbierung.
  const rewardPath = $derived.by(() => {
    let d = `M${x(0)},${y1(50)}`;
    for (let e = 0; e < ERAS; e++) {
      const end = Math.min((e + 1) * HALVING_INTERVAL, maxH);
      d += `H${x(end)}`;
      if (end < maxH) d += `V${y1(btc(blockSubsidy(end)))}`;
    }
    return d;
  });

  // Die Gesamtmenge wächst je Epoche linear, also reichen die Epochengrenzen als Stützpunkte.
  const supplyPoints = $derived.by(() => {
    const pts: [number, number][] = [[x(0), y2(0)]];
    for (let e = 1; e <= ERAS; e++) {
      const h = Math.min(e * HALVING_INTERVAL, maxH) - 1;
      pts.push([x(h), y2(btc(totalSupply(h)) / 1e6)]);
    }
    return pts;
  });
  const supplyLine = $derived('M' + supplyPoints.map((p) => p.join(',')).join('L'));
  const supplyArea = $derived(`${supplyLine}L${x(maxH)},${y2(0)}L${x(0)},${y2(0)}Z`);

  // Schmal: weniger Ticks, damit die Beschriftungen nicht ineinanderlaufen (immer Vielfache von 210 000).
  const xStep = $derived(range === 'short' ? (W < 560 ? 630_000 : 210_000) : W < 560 ? 2_100_000 : 1_050_000);
  const xTicks = $derived(Array.from({ length: Math.floor(maxH / xStep) + 1 }, (_, i) => i * xStep));

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
    const h = ((px - M.left) / (W - M.left - M.right)) * maxH;
    return Math.round(Math.min(maxH, Math.max(0, h)));
  }

  function setRange(r: 'short' | 'full') {
    range = r;
    hover = null;
    pinned = Math.min(pinned, maxH);
  }

  // Elf Epochen: In Epoche 11 wird zum ersten Mal auf ganze Satoshi abgerundet (4 882 812,5 → 4 882 812 sat).
  const eraRows = Array.from({ length: 11 }, (_, e) => {
    const first = e * HALVING_INTERVAL;
    return {
      era: e + 1,
      first,
      year: Math.floor(eraStart(e)),
      reward: btc(blockSubsidy(first)),
      roundedDown: e > 0 && blockSubsidy(first) * 2 !== blockSubsidy(first - HALVING_INTERVAL),
      supplyEnd: btc(totalSupply(first + HALVING_INTERVAL - 1)),
    };
  });
</script>

<div class="demo">
  <div class="aktionen">
    <div class="switch" role="group" aria-label="Zeitraum der x-Achse">
      <button type="button" aria-pressed={range === 'short'} onclick={() => setRange('short')}>bis 2048</button>
      <button type="button" aria-pressed={range === 'full'} onclick={() => setRange('full')}>bis 2140</button>
    </div>
    <button class="reset" onclick={() => { range = 'short'; pinned = Math.min(today, SHORT_HEIGHT); hover = null; }}>Zurücksetzen</button>
  </div>

  <div class="readout" aria-live="polite">
    <div><span class="lbl">Blockhöhe</span><strong>{nf(readout.height)}</strong></div>
    <div><span class="lbl">Jahr (ungefähr)</span><strong>{readout.year}</strong></div>
    <div><span class="lbl">Blockzuschuss</span><strong>{nf(readout.reward, 8)} BTC</strong></div>
    <div><span class="lbl">Bitcoin insgesamt</span><strong>{nf(readout.supply, readout.supply > 20_990_000 ? 4 : 0)} BTC</strong><span class="lbl">{nf(Math.floor((readout.supply / 21e6) * 10000) / 100, 2)} % von 21 Mio.</span></div>
  </div>

  <div class="chart" bind:clientWidth={width}>
    <svg
      viewBox="0 0 {W} {H}"
      width={W}
      height={H}
      role="img"
      aria-label="Blockzuschuss und Gesamtmenge an Bitcoin über der Blockhöhe"
      onpointermove={(e) => (hover = toHeight(e))}
      onpointerdown={(e) => (pinned = toHeight(e))}
      onpointerleave={() => (hover = null)}
    >
      <!-- Feld 1: Blockzuschuss -->
      <text class="title" x={M.left} y={TOP1 - 10}>Blockzuschuss je Block in BTC</text>
      {#each [0, 10, 20, 30, 40, 50] as t (t)}
        <line class="grid" x1={M.left} x2={W - M.right} y1={y1(t)} y2={y1(t)} />
        <text class="tick" x={M.left - 8} y={y1(t) + 4} text-anchor="end">{t}</text>
      {/each}
      <path class="series" d={rewardPath} />

      <!-- Feld 2: Gesamtmenge -->
      <text class="title" x={M.left} y={TOP2 - 24}>Bitcoin insgesamt in Millionen</text>
      {#each [0, 5, 10, 15, 20] as t (t)}
        <line class="grid" x1={M.left} x2={W - M.right} y1={y2(t)} y2={y2(t)} />
        <text class="tick" x={M.left - 8} y={y2(t) + 4} text-anchor="end">{t}</text>
      {/each}
      <line class="cap" x1={M.left} x2={W - M.right} y1={y2(21)} y2={y2(21)} />
      <text class="cap-label" x={W - M.right} y={y2(21) - 5} text-anchor="end">Obergrenze 21 Mio.</text>
      <path class="area" d={supplyArea} />
      <path class="series" d={supplyLine} />

      <!-- gemeinsame x-Achse -->
      <line class="axis" x1={M.left} x2={W - M.right} y1={TOP2 + PANEL} y2={TOP2 + PANEL} />
      {#each xTicks as t (t)}
        <text class="tick" x={x(t)} y={TOP2 + PANEL + 18} text-anchor={t === 0 ? 'start' : t === maxH ? 'end' : 'middle'}>{heightLabel(t)}</text>
        <text class="tick year" x={x(t)} y={TOP2 + PANEL + 34} text-anchor={t === 0 ? 'start' : t === maxH ? 'end' : 'middle'}>{year(t)}</text>
      {/each}
      <text class="tick" x={W - M.right} y={H - 2} text-anchor="end">Blockhöhe und Jahr</text>

      <!-- heute, je Feld gezeichnet, damit die Linie nicht durch den Titel des unteren Felds läuft -->
      {#if today <= maxH}
        <line class="today" x1={x(today)} x2={x(today)} y1={TOP1} y2={TOP1 + PANEL} />
        <line class="today" x1={x(today)} x2={x(today)} y1={TOP2} y2={TOP2 + PANEL} />
        <text class="today-label" x={x(today) + 5} y={TOP1 + 12}>heute (≈ {todayYear})</text>
      {/if}

      <!-- aktuelle Position -->
      <line class="cross" x1={x(active)} x2={x(active)} y1={TOP1} y2={TOP1 + PANEL} />
      <line class="cross" x1={x(active)} x2={x(active)} y1={TOP2} y2={TOP2 + PANEL} />
      <circle class="dot" cx={x(active)} cy={y1(readout.reward)} r="4.5" />
      <circle class="dot" cx={x(active)} cy={y2(readout.supply / 1e6)} r="4.5" />
    </svg>
  </div>

  <p class="hint">Fahre über das Diagramm oder tippe hinein, um die Werte an einer Stelle zu sehen. Die Jahre sind eine Näherung: 210 000 Blöcke dauern etwa vier Jahre. Zum Zuschuss kommen die Gebühren der Transaktionen, sie sind hier nicht eingezeichnet.</p>

  <details class="klein">
    <summary>Als Tabelle anzeigen (erste elf Epochen)</summary>
    <table>
      <thead><tr><th>Epoche</th><th class="num">ab Block</th><th class="num">ab Jahr ≈</th><th class="num">Zuschuss</th><th class="num">insgesamt am Ende</th></tr></thead>
      <tbody>
        {#each eraRows as r (r.era)}
          <tr><td>{r.era}</td><td class="num">{nf(r.first)}</td><td class="num">{r.year}</td><td class="num">{nf(r.reward, 8)} BTC{#if r.roundedDown}<br /><span class="lbl">abgerundet</span>{/if}</td><td class="num">{nf(r.supplyEnd, 0)} BTC</td></tr>
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
  .switch { display: inline-flex; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .switch button { border: 0; border-radius: 0; padding: 0.25rem 0.8rem; background: transparent; color: var(--fg-muted); }
  .switch button[aria-pressed='true'] { background: var(--accent-soft); color: var(--fg); font-weight: 600; }
  .chart { width: 100%; touch-action: pan-y; }
  svg { display: block; width: 100%; height: auto; user-select: none; }
  .grid { stroke: var(--border); stroke-width: 1; }
  .axis { stroke: var(--fg-muted); stroke-width: 1; }
  .tick { fill: var(--fg-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .tick.year { fill: var(--fg); }
  .title { fill: var(--fg); font-size: 13px; font-weight: 600; }
  .series { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .area { fill: var(--accent); opacity: 0.1; }
  .cap { stroke: var(--fg-muted); stroke-width: 1; stroke-dasharray: 4 3; }
  .cap-label { fill: var(--fg-muted); font-size: 12px; }
  .today { stroke: var(--fg-muted); stroke-width: 1; }
  .today-label { fill: var(--fg-muted); font-size: 12px; }
  .cross { stroke: var(--fg); stroke-width: 1; opacity: 0.6; }
  .dot { fill: var(--accent); stroke: var(--bg); stroke-width: 2; }
  .hint { font-size: 0.88rem; color: var(--fg-muted); margin: 0; }
  details table { font-size: 0.9rem; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  @media (max-width: 480px) { details table { font-size: 0.78rem; } details th, details td { padding: 0.35rem 0.3rem; } }
</style>
