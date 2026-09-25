<script lang="ts">
  import {
    atLeastHalf,
    attackerSuccessProbability as catchUp,
    confirmationsFor,
    exactAttackerSuccessProbability,
  } from '../lib/nakamoto';
  import { fmtNumber } from '../lib/format';
  import { svgPoint } from '../lib/ui';

  const FIXED = [0.1, 0.2, 0.3, 0.4, 0.45];
  // Geordnete Anteile: ein Farbton, von blass (kleines q) nach kräftig (großes q).
  const SHADE = [60, 70, 80, 90, 100];
  const Z_MAX = 12;
  const START_Q = 0.1;
  const START_Z = 3;

  interface Row {
    q: number;
    own: boolean;
    z: number | null;
    zExact: number | null;
  }
  const row = (q: number, own: boolean): Row => ({
    q,
    own,
    z: confirmationsFor(q),
    zExact: confirmationsFor(q, 0.001, exactAttackerSuccessProbability),
  });
  /** Die festen Zeilen ändern sich nie; die eigene Zeile wird je Reglerwert nur einmal gerechnet. */
  const FIXED_ROWS = FIXED.map((q) => row(q, false));
  const ownRows = new Map<number, Row>();
  function ownRow(q: number): Row {
    let r = ownRows.get(q);
    if (!r) {
      r = row(q, true);
      ownRows.set(q, r);
    }
    return r;
  }

  let width = $state(720);
  let ownQ = $state(START_Q);
  let hoverZ: number | null = $state(null);
  let pinnedZ = $state(START_Z);

  const W = $derived(Math.max(300, width));
  const M = { left: 48, right: 16, top: 16, bottom: 44 };
  const H = 320;
  const x = (z: number) => M.left + (z / Z_MAX) * (W - M.left - M.right);
  const y = (p: number) => M.top + (1 - p) * (H - M.top - M.bottom);
  const zs = Array.from({ length: Z_MAX + 1 }, (_, z) => z);

  const path = (q: number) => 'M' + zs.map((z) => `${x(z)},${y(catchUp(q, z))}`).join('L');
  const fixedPaths = $derived(FIXED.map((q) => path(q)));
  const ownPath = $derived(path(ownQ));
  const ownPoints = $derived(zs.map((z) => ({ z, p: catchUp(ownQ, z) })));

  const activeZ = $derived(hoverZ ?? pinnedZ);

  const pct = (v: number, d = 1) => `${fmtNumber(v * 100, v < 0.001 && v > 0 ? 4 : d)} %`;
  const qLabel = (q: number) => `${Math.round(q * 100)} %`;
  /** Wartezeit ab der Zahlung: der Block mit der Zahlung plus z Blöcke danach, im Mittel zehn Minuten je Block. */
  const waitLabel = (z: number) => {
    const min = (z + 1) * 10;
    return min < 120 ? `${min} min` : `${fmtNumber(min / 60)} h`;
  };

  const table = $derived([...FIXED_ROWS, ownRow(ownQ)].sort((a, b) => a.q - b.q || Number(a.own) - Number(b.own)));

  function toZ(event: PointerEvent): number {
    const px = svgPoint(event, event.currentTarget as SVGSVGElement)?.x ?? M.left;
    return Math.round(Math.min(Z_MAX, Math.max(0, ((px - M.left) / (W - M.left - M.right)) * Z_MAX)));
  }

  function reset() {
    ownQ = START_Q;
    hoverZ = null;
    pinnedZ = START_Z;
  }
</script>

<div class="demo">
  <div class="aktionen">
    <label class="slider">
      <span>Dein Angreifer besitzt <strong>{qLabel(ownQ)}</strong> der Rechenleistung</span>
      <input type="range" min="0.01" max="0.6" step="0.01" bind:value={ownQ} />
    </label>
    <button class="reset" onclick={reset}>Zurücksetzen</button>
  </div>
  <!-- Die Zeile bleibt immer im Fluss, damit das Diagramm beim Überschreiten von 50 % nicht springt. -->
  <p class="warn" role="status">
    {#if atLeastHalf(ownQ)}Ab 50 % holt der Angreifer immer auf, egal wie lange der Händler wartet.{/if}
  </p>

  <div class="legend" aria-live="polite">
    <span class="lbl">Erfolgschance bei z = {activeZ} {activeZ === 1 ? 'Block' : 'Blöcken'} nach der Zahlung</span>
    <ul>
      {#each FIXED as q, i (q)}
        <li><span class="key" style="--mix: {SHADE[i]}%"></span>q = {qLabel(q)}: <strong>{pct(catchUp(q, activeZ))}</strong></li>
      {/each}
      <li class="own"><span class="key own"></span>dein q = {qLabel(ownQ)}: <strong>{pct(catchUp(ownQ, activeZ))}</strong></li>
    </ul>
  </div>

  <div class="chart" bind:clientWidth={width}>
    <svg
      viewBox="0 0 {W} {H}"
      width={W}
      height={H}
      role="img"
      aria-label="Erfolgswahrscheinlichkeit eines Angreifers über der Zahl der Blöcke nach der Zahlung"
      onpointermove={(e) => (hoverZ = toZ(e))}
      onpointerdown={(e) => (pinnedZ = toZ(e))}
      onpointerleave={() => (hoverZ = null)}
    >
      {#each [0, 0.25, 0.5, 0.75, 1] as t (t)}
        <line class="grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
        <text class="tick" x={M.left - 8} y={y(t) + 4} text-anchor="end">{t * 100} %</text>
      {/each}
      {#each zs as z (z)}
        {#if W >= 480 || z % 2 === 0}
          <text class="tick" x={x(z)} y={H - M.bottom + 18} text-anchor="middle">{z}</text>
        {/if}
      {/each}
      <text class="tick" x={W - M.right} y={H - 4} text-anchor="end">z = Blöcke nach dem Block mit der Zahlung</text>

      <line class="cross" x1={x(activeZ)} x2={x(activeZ)} y1={M.top} y2={H - M.bottom} />

      {#each fixedPaths as d, i (i)}
        <path class="line" d={d} style="--mix: {SHADE[i]}%" />
      {/each}
      <path class="line own" d={ownPath} />
      {#each ownPoints as pt (pt.z)}
        <circle class="dot" cx={x(pt.z)} cy={y(pt.p)} r={pt.z === activeZ ? 5.5 : 4} />
      {/each}
    </svg>
  </div>
  <label class="slider">
    <span>Werte in der Legende für z = <strong>{pinnedZ}</strong></span>
    <input type="range" min="0" max={Z_MAX} step="1" bind:value={pinnedZ} oninput={() => (hoverZ = null)} />
  </label>
  <p class="hint">Fahre über das Diagramm, tippe hinein oder nutze den Regler, um die Werte für ein bestimmtes z zu sehen.</p>

  <div class="tabelle">
    <table>
      <caption>Wie viele Blöcke abwarten für unter 0,1 % Risiko?</caption>
      <thead>
        <tr>
          <th><span class="lang">Anteil des Angreifers q</span><span class="kurz">q</span></th>
          <th class="num"><span class="lang">nötiges z (Whitepaper)</span><span class="kurz">z Whitepaper</span></th>
          <th class="num"><span class="lang">nötiges z (genaue Rechnung)</span><span class="kurz">z genau</span></th>
          <th class="num"><span class="lang">Wartezeit ab der Zahlung (genau)</span><span class="kurz">Wartezeit</span></th>
        </tr>
      </thead>
      <tbody>
        {#each table as r (r.q + ':' + r.own)}
          <tr class:own={r.own}>
            <td>{qLabel(r.q)}{r.own ? ' (dein Wert)' : ''}</td>
            {#if r.z === null || r.zExact === null}
              <td class="num">nie sicher</td>
              <td class="num">nie sicher</td>
              <td class="num">–</td>
            {:else}
              <td class="num">{r.z}</td>
              <td class="num">{r.zExact}</td>
              <td class="num">{waitLabel(r.zExact)}</td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="hint">
    Die Formel aus dem Whitepaper ist eine Näherung, nach der genauen Rechnung sind oft mehr Blöcke nötig. Ein Block
    kommt im Mittel alle zehn Minuten. Viele Händler warten sechs Bestätigungen, also z = 5 und etwa eine Stunde ab der
    Zahlung. Nach der genauen Rechnung braucht ein Händler bei 10 % für unter 0,1 % Risiko aber sechs Blöcke nach dem Block mit der Zahlung (z = 6), also sieben Bestätigungen.
  </p>
</div>

<style>
  .demo { display: grid; gap: 0.8rem; }
  /* Der Regler steht links in der Aktionsleiste; der Knopf sitzt auf Höhe des Reglers, nicht der Beschriftung. */
  .aktionen { align-items: end; column-gap: 2rem; }
  .slider { display: grid; gap: 0.3rem; flex: 1 1 18rem; color: var(--fg); }
  .slider input { width: 100%; accent-color: var(--info); }
  .lbl { font-size: 0.85rem; color: var(--fg-muted); }
  .legend ul { list-style: none; padding: 0; margin: 0.3rem 0 0; display: flex; flex-wrap: wrap; gap: 0.3rem 1.2rem; font-size: 0.92rem; }
  .legend li { display: flex; align-items: center; gap: 0.4rem; font-variant-numeric: tabular-nums; }
  .key { width: 1.3rem; height: 3px; border-radius: 2px; background: color-mix(in srgb, var(--accent) var(--mix), var(--bg)); }
  .key.own { height: 4px; background: var(--info); }
  .chart { width: 100%; touch-action: pan-y; }
  svg { display: block; width: 100%; height: auto; user-select: none; }
  .grid { stroke: var(--border); stroke-width: 1; }
  .tick { fill: var(--fg-muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .cross { stroke: var(--fg); stroke-width: 1; opacity: 0.45; }
  .line { fill: none; stroke: color-mix(in srgb, var(--accent) var(--mix), var(--bg)); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .line.own { stroke: var(--info); stroke-width: 3; }
  .dot { fill: var(--info); stroke: var(--bg); stroke-width: 2; }
  .hint { font-size: 0.88rem; color: var(--fg-muted); margin: 0; }
  .warn { margin: 0; min-height: 1.5em; font-weight: 600; color: var(--danger); }
  table { margin: 0.4rem 0 0; }
  caption { text-align: left; font-weight: 600; padding-bottom: 0.3rem; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  tr.own td { font-weight: 600; background: var(--bg-muted); }
  .tabelle { overflow-x: auto; }
  .kurz { display: none; }
  @media (max-width: 560px) {
    .warn { min-height: 3em; }
    table { font-size: 0.85rem; }
    .lang { display: none; }
    .kurz { display: inline; }
  }
</style>
