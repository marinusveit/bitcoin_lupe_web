<script lang="ts">
  import {
    isInfinity,
    pointOrder,
    pointsOnCurve,
    scalarMul,
    type AffinePoint,
  } from '../lib/toycurve';

  const PRIMES = [17, 37, 97] as const;
  const START_P = 97;
  const START_K = 5;

  // ---------- Reiter „Endlicher Körper“ ----------
  let tab = $state<'finite' | 'real'>('finite');
  let p = $state<number>(START_P);
  let G = $state<AffinePoint>(defaultGenerator(START_P));
  let k = $state(START_K);

  /** Startgenerator: der erste Punkt mit der größten Ordnung. */
  function defaultGenerator(prime: number): AffinePoint {
    let best = pointsOnCurve(prime)[0]!;
    let bestOrder = 0;
    for (const pt of pointsOnCurve(prime)) {
      const o = pointOrder(pt, prime);
      if (o > bestOrder) {
        best = pt;
        bestOrder = o;
      }
    }
    return best;
  }

  const points = $derived(pointsOnCurve(p));
  const order = $derived(pointOrder(G, p));
  const mul = $derived(scalarMul(Math.min(k, order), G, p));
  const pathPoints = $derived(mul.steps.filter((s): s is AffinePoint => !isInfinity(s)));

  const GRID = 400;
  const PAD = 26;
  const cell = $derived(GRID / p);
  const gx = (x: number) => PAD + (x + 0.5) * cell;
  const gy = (y: number) => PAD + GRID - (y + 0.5) * cell;
  const dotR = $derived(Math.max(3.4, Math.min(7, cell * 0.32)));
  const axisTicks = $derived(p === 17 ? [0, 4, 8, 12, 16] : p === 37 ? [0, 9, 18, 27, 36] : [0, 24, 48, 72, 96]);

  function changePrime(next: number) {
    p = next;
    G = defaultGenerator(next);
    k = Math.min(START_K, pointOrder(G, next));
  }

  function pickGenerator(pt: AffinePoint) {
    G = pt;
    k = Math.min(k, pointOrder(pt, p));
  }

  const fmt = (pt: { x: number; y: number } | { infinity: true }) =>
    'infinity' in pt ? 'O (Punkt im Unendlichen)' : `(${pt.x} | ${pt.y})`;

  // ---------- Reiter „Reelle Kurve“ ----------
  const X_MIN = -2.4;
  const X_MAX = 4.2;
  const Y_MAX = 8;
  const RW = 440;
  const RH = 420;
  const X0 = -Math.cbrt(7);
  const sx = (x: number) => ((x - X_MIN) / (X_MAX - X_MIN)) * RW;
  const sy = (y: number) => RH / 2 - (y / Y_MAX) * (RH / 2);
  const ux = (px: number) => X_MIN + (px / RW) * (X_MAX - X_MIN);
  const uy = (py: number) => ((RH / 2 - py) / (RH / 2)) * Y_MAX;
  const f = (x: number) => Math.sqrt(Math.max(0, x ** 3 + 7));

  interface RealPoint {
    x: number;
    y: number;
  }

  // Dichte Stützstellen (enger nahe der Spitze bei x0), für Pfad und zum Einrasten.
  const samples: RealPoint[] = (() => {
    const upper: RealPoint[] = [];
    const n = 400;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = X0 + (X_MAX - X0) * t * t;
      upper.push({ x, y: f(x) });
    }
    const lower = upper.map((pt) => ({ x: pt.x, y: -pt.y })).reverse();
    return [...lower, ...upper.slice(1)];
  })();
  const curvePath = samples
    .filter((pt) => Math.abs(pt.y) <= Y_MAX * 1.2)
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${sx(pt.x).toFixed(2)},${sy(pt.y).toFixed(2)}`)
    .join(' ');

  const START_RP: RealPoint = { x: -1.6, y: f(-1.6) };
  const START_RQ: RealPoint = { x: 0.4, y: f(0.4) };

  let mode = $state<'add' | 'double'>('add');
  let rP = $state<RealPoint>({ ...START_RP });
  let rQ = $state<RealPoint>({ ...START_RQ });
  let nextTarget = $state<'P' | 'Q'>('P');
  let dragging = $state<'P' | 'Q' | null>(null);
  let svgEl = $state<SVGSVGElement | undefined>();

  function snap(px: number, py: number): RealPoint {
    let best = samples[0]!;
    let bestD = Infinity;
    for (const s of samples) {
      const d = (sx(s.x) - px) ** 2 + (sy(s.y) - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return { x: best.x, y: best.y };
  }

  function svgCoords(ev: PointerEvent | MouseEvent): { px: number; py: number } | null {
    if (!svgEl) return null;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    const pt = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(ctm.inverse());
    return { px: pt.x, py: pt.y };
  }

  function place(which: 'P' | 'Q', ev: PointerEvent | MouseEvent) {
    const c = svgCoords(ev);
    if (!c) return;
    const pt = snap(c.px, c.py);
    if (which === 'P') rP = pt;
    else rQ = pt;
  }

  function onBackgroundClick(ev: MouseEvent) {
    if (dragging) return;
    const target = mode === 'double' ? 'P' : nextTarget;
    place(target, ev);
    if (mode === 'add') nextTarget = target === 'P' ? 'Q' : 'P';
  }

  function startDrag(which: 'P' | 'Q', ev: PointerEvent) {
    ev.stopPropagation();
    dragging = which;
    svgEl?.setPointerCapture(ev.pointerId);
  }
  function onMove(ev: PointerEvent) {
    if (dragging) place(dragging, ev);
  }
  function endDrag(ev: PointerEvent) {
    if (!dragging) return;
    svgEl?.releasePointerCapture(ev.pointerId);
    // Klick-Ereignis nach dem Ziehen nicht als neuen Punkt werten
    setTimeout(() => (dragging = null), 0);
  }

  interface RealSum {
    kind: 'point' | 'infinity';
    slope: number | null;
    third: RealPoint | null;
    sum: RealPoint | null;
  }

  const realSum = $derived.by((): RealSum => {
    const a = rP;
    const b = mode === 'double' ? rP : rQ;
    const same = Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
    let slope: number;
    if (same) {
      if (Math.abs(a.y) < 1e-9) return { kind: 'infinity', slope: null, third: null, sum: null };
      slope = (3 * a.x * a.x) / (2 * a.y);
    } else if (Math.abs(a.x - b.x) < 1e-9) {
      return { kind: 'infinity', slope: null, third: null, sum: null };
    } else {
      slope = (b.y - a.y) / (b.x - a.x);
    }
    const x3 = slope * slope - a.x - b.x;
    const y3 = slope * (a.x - x3) - a.y;
    return { kind: 'point', slope, third: { x: x3, y: -y3 }, sum: { x: x3, y: y3 } };
  });

  const lineCoords = $derived.by(() => {
    const s = realSum.slope;
    if (s === null) {
      return { x1: sx(rP.x), y1: 0, x2: sx(rP.x), y2: RH };
    }
    const yAt = (x: number) => rP.y + s * (x - rP.x);
    return { x1: 0, y1: sy(yAt(X_MIN)), x2: RW, y2: sy(yAt(X_MAX)) };
  });

  const inView = (pt: RealPoint | null) =>
    pt !== null && pt.x >= X_MIN && pt.x <= X_MAX && Math.abs(pt.y) <= Y_MAX;
  const r2 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtReal = (pt: RealPoint) => `(${r2(pt.x)} | ${r2(pt.y)})`;

  function reset() {
    tab = 'finite';
    p = START_P;
    G = defaultGenerator(START_P);
    k = START_K;
    mode = 'add';
    rP = { ...START_RP };
    rQ = { ...START_RQ };
    nextTarget = 'P';
  }
</script>

<div class="demo">
  <div class="tabs" role="tablist" aria-label="Ansicht wählen">
    <button type="button" role="tab" aria-selected={tab === 'finite'} onclick={() => (tab = 'finite')}>
      Endlicher Körper (Rechnen modulo p)
    </button>
    <button type="button" role="tab" aria-selected={tab === 'real'} onclick={() => (tab = 'real')}>
      Reelle Kurve
    </button>
  </div>

  {#if tab === 'finite'}
    <div class="finite">
      <div class="controls">
        <label class="inline">
          <span>Primzahl p</span>
          <select value={p} onchange={(e) => changePrime(Number(e.currentTarget.value))}>
            {#each PRIMES as prime (prime)}<option value={prime}>{prime}</option>{/each}
          </select>
        </label>
        <label class="slider">
          <span>k = <strong>{k}</strong> (1 bis {order})</span>
          <input type="range" min="1" max={order} bind:value={k} />
        </label>
      </div>

      <div class="split">
        <svg
          class="grid-svg"
          viewBox={`0 0 ${GRID + PAD * 2} ${GRID + PAD * 2}`}
          role="group"
          aria-label={`Alle Punkte der Kurve y² = x³ + 7 modulo ${p}`}
        >
          <rect x={PAD} y={PAD} width={GRID} height={GRID} class="frame" />
          {#each axisTicks as t (t)}
            <text x={gx(t)} y={PAD + GRID + 17} class="tick">{t}</text>
            <text x={PAD - 6} y={gy(t) + 4} class="tick end">{t}</text>
          {/each}
          <polyline points={pathPoints.map((pt) => `${gx(pt.x)},${gy(pt.y)}`).join(' ')} class="walk" />
          {#each points as pt (`${pt.x}-${pt.y}`)}
            {@const isG = pt.x === G.x && pt.y === G.y}
            <circle
              cx={gx(pt.x)}
              cy={gy(pt.y)}
              r={isG ? dotR + 2 : dotR}
              class="pt"
              class:g={isG}
              class:visited={pathPoints.some((s) => s.x === pt.x && s.y === pt.y)}
              role="button"
              tabindex="0"
              aria-label={`Punkt (${pt.x} | ${pt.y}) als G wählen`}
              onclick={() => pickGenerator(pt)}
              onkeydown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  pickGenerator(pt);
                }
              }}
            />
          {/each}
          {#if !isInfinity(mul.result)}
            <circle cx={gx(mul.result.x)} cy={gy(mul.result.y)} r={dotR + 4} class="kg" />
            <text x={gx(mul.result.x)} y={gy(mul.result.y) - dotR - 8} class="kg-lbl">k·G</text>
          {/if}
          <text x={gx(G.x)} y={gy(G.y) + dotR + 15} class="g-lbl">G</text>
        </svg>

        <div class="board">
          <dl>
            <dt>Generator G</dt><dd class="hash">{fmt(G)}</dd>
            <dt>Ordnung von G</dt><dd>{order}</dd>
            <dt>k</dt><dd>{k}</dd>
            <dt>k·G</dt><dd class="hash result">{fmt(mul.result)}</dd>
          </dl>
          <p class="claim">
            Aus k und G ist k·G leicht zu berechnen, aus G und k·G ist k schwer zu finden.
          </p>
          <p class="hint">
            Klicke auf einen Punkt, um ihn als G zu wählen. Die dünne Linie verbindet G, 2·G, 3·G … bis k·G.
            Die Punkte springen scheinbar zufällig herum. Bei Bitcoin hat p 78 Stellen, dort hilft kein
            Ausprobieren mehr.
          </p>
        </div>
      </div>
    </div>
  {:else}
    <div class="real">
      <div class="controls">
        <div class="switch" role="group" aria-label="Rechenart wählen">
          <button type="button" aria-pressed={mode === 'add'} onclick={() => (mode = 'add')}>P + Q (Sekante)</button>
          <button type="button" aria-pressed={mode === 'double'} onclick={() => (mode = 'double')}>
            P + P (Tangente)
          </button>
        </div>
        <span class="hint small">
          {mode === 'add'
            ? `Punkte ziehen oder auf die Kurve klicken (nächster Klick setzt ${nextTarget}).`
            : 'P ziehen oder auf die Kurve klicken.'}
        </span>
      </div>

      <div class="split">
        <svg
          bind:this={svgEl}
          class="real-svg"
          viewBox={`0 0 ${RW} ${RH}`}
          role="application"
          aria-label="Reelle Kurve y² = x³ + 7 mit Punktaddition"
          onclick={onBackgroundClick}
          onpointermove={onMove}
          onpointerup={endDrag}
          onpointercancel={endDrag}
        >
          <defs>
            <clipPath id="real-clip"><rect x="0" y="0" width={RW} height={RH} /></clipPath>
          </defs>
          <rect x="0" y="0" width={RW} height={RH} class="frame" />
          <line x1="0" y1={sy(0)} x2={RW} y2={sy(0)} class="axis" />
          <line x1={sx(0)} y1="0" x2={sx(0)} y2={RH} class="axis" />
          <g clip-path="url(#real-clip)">
            <path d={curvePath} class="curve" />
            <line {...lineCoords} class="secant" />
            {#if realSum.third && realSum.sum}
              <line
                x1={sx(realSum.sum.x)}
                y1={sy(realSum.third.y)}
                x2={sx(realSum.sum.x)}
                y2={sy(realSum.sum.y)}
                class="mirror"
              />
              <circle cx={sx(realSum.third.x)} cy={sy(realSum.third.y)} r="6" class="third" />
              <circle cx={sx(realSum.sum.x)} cy={sy(realSum.sum.y)} r="7" class="sum" />
              <text x={sx(realSum.sum.x) + 10} y={sy(realSum.sum.y) + 4} class="plbl">
                {mode === 'add' ? 'P + Q' : '2P'}
              </text>
            {/if}
          </g>
          {#if mode === 'add'}
            <circle
              cx={sx(rQ.x)}
              cy={sy(rQ.y)}
              r="9"
              class="handle q"
              role="slider"
              tabindex="-1"
              aria-label="Punkt Q ziehen"
              aria-valuenow={rQ.x}
              onpointerdown={(e) => startDrag('Q', e)}
            />
            <text x={sx(rQ.x) - 12} y={sy(rQ.y) - 10} class="plbl">Q</text>
          {/if}
          <circle
            cx={sx(rP.x)}
            cy={sy(rP.y)}
            r="9"
            class="handle p"
            role="slider"
            tabindex="-1"
            aria-label="Punkt P ziehen"
            aria-valuenow={rP.x}
            onpointerdown={(e) => startDrag('P', e)}
          />
          <text x={sx(rP.x) - 12} y={sy(rP.y) - 10} class="plbl">P</text>
        </svg>

        <div class="board">
          <dl>
            <dt>P</dt><dd class="hash">{fmtReal(rP)}</dd>
            {#if mode === 'add'}<dt>Q</dt><dd class="hash">{fmtReal(rQ)}</dd>{/if}
            <dt>{mode === 'add' ? 'P + Q' : '2P'}</dt>
            <dd class="hash result">
              {realSum.sum ? fmtReal(realSum.sum) : 'O (Punkt im Unendlichen)'}
            </dd>
          </dl>
          {#if realSum.sum && !inView(realSum.sum)}
            <p class="hint small">Der Ergebnispunkt liegt außerhalb des Bildausschnitts.</p>
          {/if}
          <p class="hint">
            {#if mode === 'add'}
              Die Gerade durch P und Q (Sekante) trifft die Kurve in genau einem dritten Punkt (hohl).
              Spiegelt man ihn an der x-Achse, erhält man P + Q.
            {:else}
              Um P zu sich selbst zu addieren, nimmt man die Tangente in P. Sie trifft die Kurve in einem
              weiteren Punkt (hohl). Gespiegelt ergibt er 2P.
            {/if}
            Liegen beide Punkte senkrecht übereinander, gibt es keinen dritten Punkt: Das Ergebnis ist der
            Punkt im Unendlichen O.
          </p>
        </div>
      </div>
    </div>
  {/if}

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
    gap: 1rem;
  }
  .tabs { display: flex; flex-wrap: wrap; gap: 0.2rem; border-bottom: 1px solid var(--border); }
  .tabs button {
    border: 0;
    border-bottom: 3px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--fg-muted);
    padding: 0.4rem 0.7rem;
  }
  .tabs button[aria-selected='true'] { color: var(--fg); border-bottom-color: var(--accent); font-weight: 600; }

  .controls { display: flex; flex-wrap: wrap; gap: 0.8rem 1.5rem; align-items: center; margin-bottom: 0.8rem; }
  .inline { display: inline-flex; align-items: center; gap: 0.5rem; }
  .slider { display: grid; gap: 0.2rem; flex: 1 1 14rem; }
  .slider input { width: 100%; accent-color: var(--accent); }
  .slider strong { color: var(--fg); }

  .split { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 1.4rem; align-items: start; }
  @media (max-width: 760px) { .split { grid-template-columns: minmax(0, 1fr); } }
  svg { display: block; width: 100%; height: auto; max-width: 34rem; }

  .frame { fill: var(--bg); stroke: var(--border); }
  .tick { font-size: 11px; fill: var(--fg-muted); text-anchor: middle; font-family: var(--font-mono); }
  .tick.end { text-anchor: end; }
  .pt { fill: var(--fg-muted); cursor: pointer; opacity: 0.55; transition: opacity 0.2s; }
  .pt:hover, .pt:focus-visible { opacity: 1; fill: var(--accent); outline: none; }
  .pt.visited { fill: var(--info); opacity: 0.9; }
  .pt.g { fill: var(--accent-strong); opacity: 1; }
  .walk { fill: none; stroke: var(--info); stroke-width: 1; stroke-opacity: 0.45; stroke-linejoin: round; }
  .kg { fill: none; stroke: var(--accent); stroke-width: 3; pointer-events: none; }
  .kg-lbl, .g-lbl { font-size: 14px; font-weight: 700; text-anchor: middle; fill: var(--fg); pointer-events: none; }
  .g-lbl { fill: var(--accent-strong); }

  .board dl { display: grid; grid-template-columns: auto 1fr; gap: 0.3rem 1rem; margin: 0 0 0.9rem; }
  .board dt { color: var(--fg-muted); font-size: 0.9rem; }
  .board dd { margin: 0; }
  .board .result { color: var(--accent-strong); font-weight: 700; font-size: 1rem; }
  .claim { border-left: 3px solid var(--accent); padding: 0.2rem 0 0.2rem 0.8rem; font-weight: 600; }
  .hint { color: var(--fg-muted); font-size: 0.92rem; margin: 0 0 0.6rem; }
  .hint.small { font-size: 0.85rem; margin: 0; }

  .switch { display: inline-flex; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .switch button { border: 0; border-radius: 0; padding: 0.3rem 0.8rem; background: transparent; color: var(--fg-muted); }
  .switch button[aria-pressed='true'] { background: var(--accent-soft); color: var(--fg); font-weight: 600; }

  .real-svg { touch-action: none; cursor: crosshair; }
  .axis { stroke: var(--border); stroke-width: 1; }
  .curve { fill: none; stroke: var(--fg); stroke-width: 2.2; }
  .secant { stroke: var(--info); stroke-width: 1.6; }
  .mirror { stroke: var(--fg-muted); stroke-width: 1.3; stroke-dasharray: 5 4; }
  .third { fill: var(--bg-elevated); stroke: var(--fg-muted); stroke-width: 2; }
  .sum { fill: var(--accent); stroke: var(--accent-strong); stroke-width: 2; }
  .handle { cursor: grab; stroke-width: 2.5; stroke: var(--bg-elevated); }
  .handle.p { fill: var(--info); }
  .handle.q { fill: var(--ok); }
  .plbl { font-size: 15px; font-weight: 700; fill: var(--fg); pointer-events: none; }

  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap; }
</style>
