<script lang="ts">
  import {
    addReal,
    CURVE_B,
    curveYReal,
    DEFAULT_P,
    isInfinity,
    pointOrder,
    pointsOnCurve,
    scalarMul,
    type AffinePoint,
  } from '../lib/toycurve';
  import { onActivate, svgPoint } from '../lib/ui';

  const PRIMES = [17, 37, 97] as const;
  const START_K = 5;

  /** Element von `list` mit dem kleinsten Abstand `dist`; `undefined`, wenn keins endlich ist. */
  function nearest<T>(list: readonly T[], dist: (item: T) => number): T | undefined {
    let best: T | undefined;
    let bestD = Infinity;
    for (const item of list) {
      const d = dist(item);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }

  /** Startgenerator je Primzahl, einmal berechnet: der erste Punkt mit der größten Ordnung. */
  const generators = new Map<number, AffinePoint>();
  function defaultGenerator(prime: number): AffinePoint {
    let best = generators.get(prime);
    if (!best) {
      best = nearest(pointsOnCurve(prime), (pt) => -pointOrder(pt, prime))!;
      generators.set(prime, best);
    }
    return best;
  }

  // ---------- Reiter „Endlicher Körper“ ----------
  const uid = $props.id();
  const TABS = ['finite', 'real'] as const;
  let tab = $state<'finite' | 'real'>('finite');
  const tabEls: Record<'finite' | 'real', HTMLButtonElement | undefined> = $state({ finite: undefined, real: undefined });

  /** Pfeil links/rechts, Home/End wechseln den Reiter (roving tabindex). */
  function onTabKey(ev: KeyboardEvent) {
    const i = TABS.indexOf(tab);
    let next: number;
    if (ev.key === 'ArrowRight') next = (i + 1) % TABS.length;
    else if (ev.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length;
    else if (ev.key === 'Home') next = 0;
    else if (ev.key === 'End') next = TABS.length - 1;
    else return;
    ev.preventDefault();
    tab = TABS[next]!;
    tabEls[tab]?.focus();
  }
  let p = $state<number>(DEFAULT_P);
  let G = $state<AffinePoint>(defaultGenerator(DEFAULT_P));
  let k = $state(START_K);
  /** Abspielen: k zählt automatisch hoch, bis k·G wieder bei O ankommt. */
  let playing = $state(false);
  let playTimer: ReturnType<typeof setInterval> | undefined;

  function stopPlay() {
    clearInterval(playTimer);
    playTimer = undefined;
    playing = false;
  }

  function togglePlay() {
    if (playing) return stopPlay();
    if (k >= order) k = 1;
    playing = true;
    playTimer = setInterval(() => {
      if (k >= order) return stopPlay();
      k += 1;
    }, 450);
  }

  $effect(() => stopPlay);

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

  // ---------- Rätsel „Finde k“ ----------
  /** Gesuchtes k (null: kein Rätsel aktiv). K = target·G wird ohne k markiert. */
  let puzzleTarget = $state<number | null>(null);
  let puzzleTries = $state(0);
  let puzzleFound = $state(false);
  const puzzlePoint = $derived(puzzleTarget === null ? null : scalarMul(puzzleTarget, G, p).result);

  function startPuzzle() {
    stopPlay();
    k = 1;
    puzzleTarget = 2 + Math.floor(Math.random() * (order - 2));
    puzzleTries = 0;
    puzzleFound = false;
  }

  function endPuzzle() {
    puzzleTarget = null;
    puzzleTries = 0;
    puzzleFound = false;
  }

  /** Jede Schieberänderung zählt als ein Versuch. */
  function onSlide(ev: Event & { currentTarget: HTMLInputElement }) {
    stopPlay();
    if (puzzleTarget === null || puzzleFound) return;
    puzzleTries += 1;
    if (Number(ev.currentTarget.value) === puzzleTarget) puzzleFound = true;
  }

  function changePrime(next: number) {
    stopPlay();
    endPuzzle();
    p = next;
    G = defaultGenerator(next);
    rover = null;
    k = Math.min(START_K, pointOrder(G, next));
  }

  // Trefferfläche: Klick auf das Gitter wählt den nächsten Punkt im Umkreis HIT_R
  // (Einheiten der viewBox; bei 360 px Bildschirmbreite etwa 14 px Radius).
  const HIT_R = 22;
  let gridSvgEl = $state<SVGSVGElement | undefined>();

  function onGridClick(ev: MouseEvent) {
    const c = gridSvgEl && svgPoint(ev, gridSvgEl);
    if (!c) return;
    const dist = (pt: AffinePoint) => (gx(pt.x) - c.x) ** 2 + (gy(pt.y) - c.y) ** 2;
    const best = nearest(points, dist);
    if (best && dist(best) <= HIT_R * HIT_R) pickGenerator(best);
  }

  function pickGenerator(pt: AffinePoint) {
    stopPlay();
    endPuzzle();
    G = pt;
    rover = pt;
    k = Math.min(k, pointOrder(pt, p));
  }

  // Tastatur im Punktfeld (roving tabindex): Nur ein Punkt ist per Tab erreichbar, die Pfeiltasten
  // wandern zum nächstgelegenen Punkt in der jeweiligen Richtung, Enter oder Leertaste wählt ihn als G.
  let rover = $state<AffinePoint | null>(null);
  let focusedPt = $state<AffinePoint | null>(null);
  const activePt = $derived(
    rover && points.some((pt) => pt.x === rover!.x && pt.y === rover!.y) ? rover : G,
  );
  const ptKey = (pt: AffinePoint) => `${pt.x}-${pt.y}`;
  const DIRS: Record<string, [number, number]> = {
    ArrowRight: [1, 0],
    ArrowLeft: [-1, 0],
    ArrowUp: [0, 1],
    ArrowDown: [0, -1],
  };

  function onPointKey(pt: AffinePoint, ev: KeyboardEvent) {
    onActivate(() => pickGenerator(pt))(ev);
    const dir = DIRS[ev.key];
    if (!dir) return;
    ev.preventDefault();
    const best = nearest(points, (q) => {
      const dx = q.x - pt.x;
      const dy = q.y - pt.y;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 0) return Infinity;
      // Abweichung quer zur Richtung zählt doppelt, damit der Sprung der Pfeilrichtung folgt.
      return along + 2 * Math.abs(dx * dir[1] - dy * dir[0]);
    });
    if (!best) return;
    rover = best;
    gridSvgEl?.querySelector<SVGCircleElement>(`[data-pt="${ptKey(best)}"]`)?.focus();
  }

  const fmt = (pt: { x: number; y: number } | { infinity: true }) =>
    'infinity' in pt ? 'O (Punkt im Unendlichen)' : `(${pt.x} | ${pt.y})`;

  // ---------- Reiter „Reelle Kurve“ ----------
  const X_MIN = -2.4;
  const X_MAX = 4.2;
  const Y_MAX = 8;
  const RW = 440;
  const RH = 420;
  const X0 = -Math.cbrt(CURVE_B);
  const sx = (x: number) => ((x - X_MIN) / (X_MAX - X_MIN)) * RW;
  const sy = (y: number) => RH / 2 - (y / Y_MAX) * (RH / 2);
  const ux = (px: number) => X_MIN + (px / RW) * (X_MAX - X_MIN);
  const uy = (py: number) => ((RH / 2 - py) / (RH / 2)) * Y_MAX;
  const f = curveYReal;

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
  // Startpunkt für den Tangentenmodus: Bei x = 1 liegt 2P ≈ (−1,72 | −1,39) im Bild.
  const START_DP: RealPoint = { x: 1, y: f(1) };

  function setMode(next: 'add' | 'double') {
    if (next === 'double' && mode !== 'double') rP = { ...START_DP };
    mode = next;
  }

  let mode = $state<'add' | 'double'>('add');
  let rP = $state<RealPoint>({ ...START_RP });
  let rQ = $state<RealPoint>({ ...START_RQ });
  let nextTarget = $state<'P' | 'Q'>('P');
  let dragging = $state<'P' | 'Q' | null>(null);
  let svgEl = $state<SVGSVGElement | undefined>();

  function snap(px: number, py: number): RealPoint {
    const best = nearest(samples, (s) => (sx(s.x) - px) ** 2 + (sy(s.y) - py) ** 2)!;
    return { x: best.x, y: best.y };
  }

  function setPoint(which: 'P' | 'Q', pt: RealPoint) {
    if (which === 'P') rP = pt;
    else rQ = pt;
  }

  function place(which: 'P' | 'Q', ev: PointerEvent | MouseEvent) {
    const c = svgEl && svgPoint(ev, svgEl);
    if (c) setPoint(which, snap(c.x, c.y));
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

  // Tastatur für die Griffe: Index in samples, beschränkt auf den sichtbaren Ausschnitt.
  const KB_MIN = samples.findIndex((s) => Math.abs(s.y) <= Y_MAX);
  const KB_MAX = samples.findLastIndex((s) => Math.abs(s.y) <= Y_MAX);

  const KB_INDICES = Array.from({ length: KB_MAX - KB_MIN + 1 }, (_, i) => KB_MIN + i);

  function sampleIndex(pt: RealPoint): number {
    return nearest(KB_INDICES, (i) => (samples[i]!.x - pt.x) ** 2 + (samples[i]!.y - pt.y) ** 2) ?? KB_MIN;
  }

  function onHandleKey(which: 'P' | 'Q', ev: KeyboardEvent) {
    const i = sampleIndex(which === 'P' ? rP : rQ);
    const step = ev.shiftKey ? 20 : 4;
    let next: number;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') next = i + step;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') next = i - step;
    else if (ev.key === 'Home') next = KB_MIN;
    else if (ev.key === 'End') next = KB_MAX;
    else return;
    ev.preventDefault();
    const s = samples[Math.min(KB_MAX, Math.max(KB_MIN, next))]!;
    setPoint(which, { x: s.x, y: s.y });
  }

  const realSum = $derived(addReal(rP, mode === 'double' ? rP : rQ));

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
    changePrime(DEFAULT_P);
    tab = 'finite';
    mode = 'add';
    rP = { ...START_RP };
    rQ = { ...START_RQ };
    nextTarget = 'P';
  }
</script>

<div class="demo demo-card">
  <div class="aktionen">
    <button type="button" class="reset" onclick={reset}>Zurücksetzen</button>
  </div>
  <div class="tabs" role="tablist" aria-label="Ansicht wählen">
    {#each TABS as t (t)}
      <button
        type="button"
        role="tab"
        id={`${uid}-tab-${t}`}
        aria-controls={`${uid}-panel-${t}`}
        aria-selected={tab === t}
        tabindex={tab === t ? 0 : -1}
        bind:this={tabEls[t]}
        onclick={() => {
          stopPlay();
          tab = t;
        }}
        onkeydown={onTabKey}
      >
        {t === 'finite' ? 'Modulo p' : 'Reelle Kurve'}
      </button>
    {/each}
  </div>

  {#if tab === 'finite'}
    <div class="finite" role="tabpanel" id={`${uid}-panel-finite`} aria-labelledby={`${uid}-tab-finite`}>
      <div class="controls">
        <label class="inline">
          <span>Primzahl p</span>
          <select value={p} onchange={(e) => changePrime(Number(e.currentTarget.value))}>
            {#each PRIMES as prime (prime)}<option value={prime}>{prime}</option>{/each}
          </select>
        </label>
        <label class="slider">
          <span>k = <strong>{k}</strong> (1 bis {order})</span>
          <input type="range" min="1" max={order} bind:value={k} oninput={onSlide} />
        </label>
        <button type="button" aria-pressed={playing} disabled={puzzleTarget !== null} onclick={togglePlay}>
          {playing ? 'Anhalten' : 'Abspielen: G, 2·G, 3·G …'}
        </button>
        <button type="button" disabled={order < 3} onclick={startPuzzle}>Rätsel: Finde k</button>
      </div>

      <div class="split">
        <svg
          bind:this={gridSvgEl}
          class="grid-svg"
          viewBox={`0 0 ${GRID + PAD * 2} ${GRID + PAD * 2}`}
          role="group"
          aria-label={`Alle Punkte der Kurve y² = x³ + 7 modulo ${p}`}
        >
          <rect x={PAD} y={PAD} width={GRID} height={GRID} class="frame" />
          {#each axisTicks as t (t)}
            <text x={gx(t)} y={PAD + GRID + 21} class="tick">{t}</text>
            <text x={PAD - 4} y={gy(t) + 5} class="tick end">{t}</text>
          {/each}
          <!-- Trefferfläche für Maus und Touch; Tastatur bedient die Punkte selbst. -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <rect x={PAD} y={PAD} width={GRID} height={GRID} class="hit" onclick={onGridClick} />
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
              data-pt={ptKey(pt)}
              role="button"
              tabindex={pt.x === activePt.x && pt.y === activePt.y ? 0 : -1}
              aria-label={`Punkt (${pt.x} | ${pt.y}) als G wählen`}
              onclick={() => pickGenerator(pt)}
              onkeydown={(ev) => onPointKey(pt, ev)}
              onfocus={(ev) => {
                rover = pt;
                focusedPt = ev.currentTarget.matches(':focus-visible') ? pt : null;
              }}
              onblur={() => (focusedPt = null)}
            />
          {/each}
          {#if focusedPt}
            <circle
              cx={gx(focusedPt.x)}
              cy={gy(focusedPt.y)}
              r={Math.max(8, dotR + 4)}
              class="focus-ring"
            />
          {/if}
          {#if puzzlePoint && !isInfinity(puzzlePoint)}
            <circle cx={gx(puzzlePoint.x)} cy={gy(puzzlePoint.y)} r={dotR + 7} class="target" />
            <text x={gx(puzzlePoint.x) + dotR + 10} y={gy(puzzlePoint.y) + 5} class="target-lbl">K</text>
          {/if}
          {#if !isInfinity(mul.result)}
            <circle cx={gx(mul.result.x)} cy={gy(mul.result.y)} r={dotR + 4} class="kg" />
            <text x={gx(mul.result.x)} y={gy(mul.result.y) - dotR - 8} class="kg-lbl">k·G</text>
          {/if}
          <text x={gx(G.x)} y={gy(G.y) + dotR + 15} class="g-lbl">G</text>
        </svg>

        <div class="board">
          <dl>
            <dt>Generator G</dt><dd class="hash">{fmt(G)}</dd>
            <dt>Ordnung von G (bei Bitcoin: n)</dt><dd>{order}</dd>
            <dt>k</dt><dd>{k}</dd>
            <dt>k·G</dt><dd class="hash result">{fmt(mul.result)}</dd>
          </dl>
          <p class="hint small step">
            Die Ordnung sagt, wie viele Punkte man von G aus erreicht, O mitgezählt. Danach beginnt die Reihe
            von vorn.
          </p>
          {#if k > 1 && !isInfinity(mul.result)}
            {@const prev = mul.steps[k - 2]!}
            <p class="hint small step">
              Letzter Schritt: {fmt(prev)} + G = {fmt(mul.result)}. Ein Schritt weiter, und der Punkt liegt
              ganz woanders.
            </p>
          {:else if isInfinity(mul.result)}
            <p class="hint small step">{order}·G ist der Punkt im Unendlichen O. Danach beginnt die Reihe von vorn.</p>
          {/if}
          {#if puzzleTarget !== null && puzzlePoint && !isInfinity(puzzlePoint)}
            <div class="puzzle" aria-live="polite">
              <p>
                Rätsel: Für welches k ist k·G = K = {fmt(puzzlePoint)}? Suche mit dem Schieber.
                Versuche: <strong>{puzzleTries}</strong>
              </p>
              {#if puzzleFound}
                <p class="found">Gefunden: k = {puzzleTarget}, nach {puzzleTries} Versuchen.</p>
                <p>
                  Bei {order} möglichen Werten für k reichen höchstens {order} Versuche. Bei Bitcoin gibt es etwa
                  2<sup>256</sup> mögliche Werte, und selbst das beste Verfahren braucht noch etwa 2<sup>128</sup>
                  Rechenschritte.
                </p>
              {/if}
            </div>
          {/if}
          <p class="claim">
            Aus k und G ist k·G leicht zu berechnen, aus G und k·G ist k schwer zu finden.
          </p>
          <p class="hint">
            Klicke auf einen Punkt, um ihn als G zu wählen (Tastatur: Pfeiltasten, dann Enter). Die dünne Linie verbindet G, 2·G, 3·G … bis k·G.
            Die Punkte springen scheinbar zufällig herum. Bei Bitcoin hat p 78 Stellen, dort hilft kein
            Ausprobieren mehr.
          </p>
        </div>
      </div>
    </div>
  {:else}
    <div class="real" role="tabpanel" id={`${uid}-panel-real`} aria-labelledby={`${uid}-tab-real`}>
      <div class="controls">
        <div class="switch" role="group" aria-label="Rechenart wählen">
          <button type="button" aria-pressed={mode === 'add'} onclick={() => setMode('add')}>P + Q (Sekante)</button>
          <button type="button" aria-pressed={mode === 'double'} onclick={() => setMode('double')}>
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
        <!-- Klick auf die Kurve ergänzt die Griffe P und Q, die per Tastatur bedienbar sind. -->
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
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
          {#each mode === 'add' ? (['Q', 'P'] as const) : (['P'] as const) as w (w)}
            {@const pt = w === 'P' ? rP : rQ}
            <circle
              cx={sx(pt.x)}
              cy={sy(pt.y)}
              r="9"
              class="handle {w.toLowerCase()}"
              role="slider"
              tabindex="0"
              aria-label="Punkt {w} auf der Kurve verschieben"
              aria-valuemin={KB_MIN}
              aria-valuemax={KB_MAX}
              aria-valuenow={sampleIndex(pt)}
              aria-valuetext={`${w} = ${fmtReal(pt)}`}
              onpointerdown={(e) => startDrag(w, e)}
              onkeydown={(e) => onHandleKey(w, e)}
            />
            <text x={sx(pt.x) - 12} y={sy(pt.y) - 10} class="plbl">{w}</text>
          {/each}
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
              Spiegelt man ihn an der x-Achse, erhält man P + Q. Liegen beide Punkte senkrecht übereinander,
              gibt es keinen dritten Punkt: Das Ergebnis ist der Punkt im Unendlichen O.
            {:else}
              Um P zu sich selbst zu addieren, nimmt man die Tangente in P. Sie trifft die Kurve in einem
              weiteren Punkt (hohl). Gespiegelt ergibt er 2P. Liegt P auf der x-Achse, steht die Tangente
              senkrecht: 2P = O.
            {/if}
          </p>
        </div>
      </div>
    </div>
  {/if}

</div>

<style>
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
  .tick { font-size: 16px; fill: var(--fg-muted); text-anchor: middle; font-family: var(--font-mono); }
  .tick.end { text-anchor: end; }
  .pt { fill: var(--fg-muted); cursor: pointer; opacity: 0.55; transition: opacity 0.2s; }
  .pt:hover, .pt:focus-visible { opacity: 1; fill: var(--accent); outline: none; }
  .pt.visited { fill: var(--info); opacity: 0.9; }
  .pt.g { fill: var(--accent-strong); opacity: 1; }
  .hit { fill: transparent; }
  .focus-ring { fill: none; stroke: var(--fg); stroke-width: 2; pointer-events: none; }
  .walk { pointer-events: none; fill: none; stroke: var(--info); stroke-width: 1; stroke-opacity: 0.45; stroke-linejoin: round; }
  .kg { fill: none; stroke: var(--accent); stroke-width: 3; pointer-events: none; }
  .kg-lbl, .g-lbl { font-size: 14px; font-weight: 700; text-anchor: middle; fill: var(--fg); pointer-events: none; }
  .g-lbl { fill: var(--accent-strong); }
  .target { fill: none; stroke: var(--danger); stroke-width: 2.5; stroke-dasharray: 4 3; pointer-events: none; }
  .target-lbl { font-size: 14px; font-weight: 700; fill: var(--danger); pointer-events: none; }
  .puzzle { border-left: 3px solid var(--danger); padding: 0.2rem 0 0.2rem 0.8rem; margin-bottom: 0.9rem; }
  .puzzle p { margin: 0 0 0.4rem; }
  .puzzle .found { font-weight: 700; color: var(--ok); }

  .board dl { display: grid; grid-template-columns: auto 1fr; gap: 0.3rem 1rem; margin: 0 0 0.9rem; }
  .board dt { color: var(--fg-muted); font-size: 0.9rem; }
  .board dd { margin: 0; }
  .board .result { color: var(--accent-strong); font-weight: 700; font-size: 1rem; }
  .claim { border-left: 3px solid var(--accent); padding: 0.2rem 0 0.2rem 0.8rem; font-weight: 600; }
  .hint { margin-bottom: 0.6rem; }
  .hint.small { font-size: 0.85rem; margin: 0; }
  .hint.step { margin-bottom: 0.6rem; }

  .switch button { padding: 0.3rem 0.8rem; }

  .real-svg { touch-action: none; cursor: crosshair; }
  .axis { stroke: var(--border); stroke-width: 1; }
  .curve { fill: none; stroke: var(--fg); stroke-width: 2.2; }
  .secant { stroke: var(--info); stroke-width: 1.6; }
  .mirror { stroke: var(--fg-muted); stroke-width: 1.3; stroke-dasharray: 5 4; }
  .third { fill: var(--bg-elevated); stroke: var(--fg-muted); stroke-width: 2; }
  .sum { fill: var(--accent); stroke: var(--accent-strong); stroke-width: 2; }
  .handle { cursor: grab; stroke-width: 2.5; stroke: var(--bg-elevated); }
  .handle:focus { outline: none; }
  .handle:focus-visible { stroke: var(--accent-strong); stroke-width: 4; }
  .handle.p { fill: var(--info); }
  .handle.q { fill: var(--ok); }
  .plbl { font-size: 15px; font-weight: 700; fill: var(--fg); pointer-events: none; }

</style>
