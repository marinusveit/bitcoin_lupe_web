<script lang="ts">
  import { sha256dHex } from '../lib/hash';
  import { buildMerkleTree, hashPair, merkleProof, verifyMerkleProof } from '../lib/merkle';

  const START_TXS = ['Alice → Bob 2 BTC', 'Bob → Carol 1 BTC', 'Carol → Dave 0,5 BTC', 'Dave → Eve 0,2 BTC'];
  const EXTRA_TXS = [
    'Eve → Frank 0,1 BTC',
    'Frank → Grace 3 BTC',
    'Grace → Heidi 0,7 BTC',
    'Heidi → Alice 1,5 BTC',
  ];
  const MAX_TX = 8;
  const START_ROOT = buildMerkleTree(START_TXS.map((t) => sha256dHex(t))).root;

  // SVG-Maße in viewBox-Einheiten
  const SLOT = 100;
  const NODE_W = 84;
  const NODE_H = 30;
  const LEVEL_H = 72;
  const PAD_X = 12;
  const PAD_TOP = 34;
  const PAD_BOTTOM = 30;

  interface DrawNode {
    key: string;
    level: number;
    index: number;
    hash: string;
    x: number;
    y: number;
    ghost: boolean;
  }
  interface DrawEdge {
    key: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    ghost: boolean;
    childLevel: number;
    childIndex: number;
  }

  let txs = $state<string[]>([...START_TXS]);
  let selected = $state<number | null>(null);
  let flashLeaf = $state<number | null>(null);
  /** Im Block-Header eingefrorene Wurzel; `null`, solange nichts eingetragen ist. */
  let headerRoot = $state<string | null>(START_ROOT);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  /** Beim schrittweisen Beweis: bis zu welcher Ebene die Rechnung schon gezeigt wird (null = alles). */
  let revealed = $state<number | null>(null);
  let revealTimer: ReturnType<typeof setInterval> | undefined;

  function stopReveal() {
    clearInterval(revealTimer);
    revealTimer = undefined;
  }

  /** Zeigt den Beweis Ebene für Ebene: erst das Blatt, dann jedes Paar bis zur Wurzel. */
  function playProof() {
    stopReveal();
    revealed = 0;
    revealTimer = setInterval(() => {
      if (revealed === null || revealed >= proofSteps.length) return stopReveal();
      revealed += 1;
    }, 900);
  }

  $effect(() => () => {
    stopReveal();
    clearTimeout(flashTimer);
  });

  const txids = $derived(txs.map((t) => sha256dHex(t)));
  const tree = $derived(buildMerkleTree(txids));

  const layout = $derived.by(() => {
    const levels = tree.levels;
    const top = levels.length - 1;
    const xs: number[][] = [];
    levels.forEach((level, k) => {
      const withGhost = k < top && level.length % 2 === 1;
      let row: number[];
      if (k === 0) {
        row = level.map((_, i) => i);
      } else {
        const below = xs[k - 1]!;
        row = level.map((_, i) => (below[2 * i]! + below[2 * i + 1]!) / 2);
      }
      if (withGhost) {
        const last = row[row.length - 1]!;
        const prev = row.length > 1 ? row[row.length - 2]! : last - 1;
        row.push(last + (last - prev));
      }
      xs.push(row);
    });
    const maxSlot = Math.max(...xs.flat());
    const width = PAD_X * 2 + (maxSlot + 1) * SLOT;
    const height = PAD_TOP + top * LEVEL_H + NODE_H + PAD_BOTTOM;
    const toX = (slot: number) => PAD_X + slot * SLOT + SLOT / 2;
    const toY = (k: number) => PAD_TOP + (top - k) * LEVEL_H;

    const nodes: DrawNode[] = [];
    const edges: DrawEdge[] = [];
    levels.forEach((level, k) => {
      xs[k]!.forEach((slot, i) => {
        const ghost = i >= level.length;
        const hash = ghost ? level[level.length - 1]! : level[i]!;
        nodes.push({ key: `${k}-${i}`, level: k, index: i, hash, x: toX(slot), y: toY(k), ghost });
        if (k < top) {
          const parentSlot = xs[k + 1]![Math.floor(i / 2)]!;
          edges.push({
            key: `${k}-${i}`,
            x1: toX(slot),
            y1: toY(k),
            x2: toX(parentSlot),
            y2: toY(k + 1) + NODE_H,
            ghost,
            childLevel: k,
            childIndex: i,
          });
        }
      });
    });
    return { nodes, edges, width, height, top };
  });

  /** Index des Knotens auf Ebene k, der über Blatt `leaf` liegt. */
  function onPath(leaf: number | null, level: number, index: number, levelLength: number): boolean {
    if (leaf === null) return false;
    const p = Math.floor(leaf / 2 ** level);
    // Verdoppelter Knoten trägt denselben Hash wie der letzte echte Knoten der Ebene.
    return index === p || (index === levelLength && p === levelLength - 1);
  }

  function isSibling(level: number, index: number): boolean {
    if (selected === null || level >= layout.top) return false;
    if (revealed !== null && level >= revealed) return false;
    const p = Math.floor(selected / 2 ** level);
    return index === (p ^ 1);
  }

  function isPath(level: number, index: number): boolean {
    if (selected === null) return false;
    if (revealed !== null && level > revealed) return false;
    return index === Math.floor(selected / 2 ** level);
  }

  function isFlash(level: number, index: number): boolean {
    return onPath(flashLeaf, level, index, tree.levels[level]!.length);
  }

  const proofSteps = $derived.by(() => {
    if (selected === null || selected >= txids.length) return [];
    const proof = merkleProof(txids, selected);
    let current = txids[selected]!;
    return proof.map((step, k) => {
      const next = step.position === 'left' ? hashPair(step.hash, current) : hashPair(current, step.hash);
      const row = { level: k, own: current, sibling: step.hash, position: step.position, result: next };
      current = next;
      return row;
    });
  });
  // Mit Header-Eintrag prüft der Beweis gegen die eingefrorene Wurzel, sonst gegen die aktuelle.
  const proofOk = $derived(
    selected !== null && selected < txids.length
      ? verifyMerkleProof(txids[selected]!, merkleProof(txids, selected), headerRoot ?? tree.root)
      : false,
  );
  const headerMatches = $derived(headerRoot === tree.root);

  // Schmale Bildschirme: ab 5 Blättern bekommt der Baum eine Mindestbreite und wird seitlich scrollbar
  // (CSS-Media-Query unten). Der Hinweis erscheint nur, wenn er tatsächlich überläuft.
  const wideTree = $derived(txs.length > 4);
  let scrollW = $state(0);
  let innerW = $state(0);
  const treeOverflows = $derived(wideTree && innerW > scrollW + 1);

  const short = (h: string) => h.slice(0, 8);

  function edit(i: number, value: string) {
    txs[i] = value;
    flashLeaf = i;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flashLeaf = null), 700);
  }

  function select(i: number) {
    stopReveal();
    revealed = null;
    selected = selected === i ? null : i;
  }

  function addTx() {
    if (txs.length >= MAX_TX) return;
    txs.push(EXTRA_TXS[(txs.length - START_TXS.length + EXTRA_TXS.length) % EXTRA_TXS.length]!);
  }

  function removeTx() {
    if (txs.length <= 1) return;
    txs.pop();
    if (selected !== null && selected >= txs.length) selected = null;
  }

  function freezeRoot() {
    headerRoot = tree.root;
  }

  function reset() {
    stopReveal();
    revealed = null;
    txs = [...START_TXS];
    selected = null;
    flashLeaf = null;
    headerRoot = START_ROOT;
  }
</script>

<div class="demo">
  <ol class="tx-list">
    {#each txs as tx, i (i)}
      <li class:active={selected === i}>
        <span class="tx-label">Tx {i + 1}</span>
        <input
          type="text"
          value={tx}
          oninput={(e) => edit(i, e.currentTarget.value)}
          aria-label={`Text von Transaktion ${i + 1}`}
          spellcheck="false"
          autocomplete="off"
        />
        <span class="hash txid" title={txids[i]}>TxID {short(txids[i]!)}…</span>
      </li>
    {/each}
  </ol>

  <div class="actions left">
    <button type="button" onclick={addTx} disabled={txs.length >= MAX_TX}>Transaktion hinzufügen</button>
    <button type="button" onclick={removeTx} disabled={txs.length <= 1}>Transaktion entfernen</button>
  </div>

  <div class="header-box" class:mismatch={headerRoot !== null && !headerMatches}>
    <p class="header-title">Block-Header</p>
    {#if headerRoot === null}
      <p class="header-line">Im Header steht noch keine Merkle-Wurzel.</p>
    {:else}
      <p class="header-line">
        Im Header steht: <span class="hash" title={headerRoot}>{headerRoot.slice(0, 16)}…</span>
        <span class="header-state">
          {headerMatches ? '(passt zur aktuellen Wurzel)' : '(passt nicht mehr zur aktuellen Wurzel)'}
        </span>
      </p>
    {/if}
    <button type="button" onclick={freezeRoot} disabled={headerMatches}>Wurzel in den Block-Header schreiben</button>
  </div>

  <figure class="tree">
    <div class="tree-scroll" class:wide={wideTree} bind:clientWidth={scrollW}>
    <div
      class="tree-inner"
      style={wideTree ? `--tree-min: ${Math.round(layout.width * 0.8)}px` : undefined}
      bind:offsetWidth={innerW}
    >
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      style={`max-width: ${Math.max(layout.width, 320) * 1.15}px`}
      role="group"
      aria-label="Merkle-Baum: Blätter unten, Wurzel oben"
    >
      {#each layout.edges as e (e.key)}
        <line
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          class="edge"
          class:ghost={e.ghost}
          class:path={isPath(e.childLevel, e.childIndex)}
        />
      {/each}

      {#each layout.nodes as n (n.key)}
        {@const leaf = n.level === 0 && !n.ghost}
        {@const cls = [
          'node',
          n.ghost ? 'ghost' : '',
          !n.ghost && isPath(n.level, n.index) ? 'path' : '',
          isSibling(n.level, n.index) ? 'sibling' : '',
          isFlash(n.level, n.index) ? 'flash' : '',
          leaf ? 'leaf' : '',
        ].join(' ')}
        {#if leaf}
          <g
            class={cls}
            role="button"
            tabindex="0"
            aria-pressed={selected === n.index}
            aria-label={`Tx ${n.index + 1}: Merkle-Beweis anzeigen`}
            onclick={() => select(n.index)}
            onkeydown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                select(n.index);
              }
            }}
          >
            <rect x={n.x - NODE_W / 2} y={n.y} width={NODE_W} height={NODE_H} rx="6" />
            <text x={n.x} y={n.y + NODE_H / 2 + 4.5} class="h">{short(n.hash)}</text>
            <text x={n.x} y={n.y + NODE_H + 17} class="lbl">Tx {n.index + 1}</text>
          </g>
        {:else}
          <g class={cls}>
            <rect x={n.x - NODE_W / 2} y={n.y} width={NODE_W} height={NODE_H} rx="6" />
            <text x={n.x} y={n.y + NODE_H / 2 + 4.5} class="h">{short(n.hash)}</text>
            {#if n.level === layout.top}
              <text x={n.x} y={n.y - 10} class="lbl root-lbl">Merkle-Wurzel</text>
            {/if}
          </g>
        {/if}
      {/each}
    </svg>
    </div>
    </div>
    {#if treeOverflows}
      <p class="scroll-hint">Baum seitlich verschiebbar ↔</p>
    {/if}
    <figcaption class="legend">
      <span><i class="sw path"></i>Pfad zur Wurzel</span>
      <span><i class="sw sibling"></i>Beweis-Hashes</span>
      <span><i class="sw ghost"></i>verdoppelter Knoten</span>
    </figcaption>
  </figure>

  <div class="proof" aria-live="polite">
    {#if selected === null}
      <p class="hint">
        Klicke im Baum auf ein Blatt (Tx 1, Tx 2, …). Dann siehst du, welche Hashes man braucht, um zu
        beweisen, dass diese Transaktion im Block steckt. Ändere danach einen Text: Alle Knoten bis zur
        Wurzel ändern sich mit{headerRoot === null ? '.' : ', und der Beweis passt nicht mehr zur Wurzel im Header.'}
      </p>
    {:else if proofSteps.length === 0}
      <p class="hint">Bei nur einer Transaktion ist ihre TxID selbst schon die Merkle-Wurzel.</p>
    {:else}
      <div class="proof-head">
        <p class="proof-title">
          Merkle-Beweis für Tx {selected + 1}: {proofSteps.length}
          {proofSteps.length === 1 ? 'Hash' : 'Hashes'} statt {txs.length} TxIDs
        </p>
        <button type="button" onclick={playProof}>Schritt für Schritt zeigen</button>
      </div>
      {#if revealed !== null && revealed < proofSteps.length}
        <p class="hint">
          {#if revealed === 0}
            Start: die TxID von Tx {selected + 1} (orange). Als Nächstes kommt der blaue Geschwister-Hash dazu.
          {:else}
            Ebene {revealed}: Eigener Hash und Geschwister-Hash werden aneinandergehängt und gehasht. Das Ergebnis
            ist der nächste orange Knoten.
          {/if}
        </p>
      {/if}
      <ol class="steps">
        {#each proofSteps.slice(0, revealed ?? proofSteps.length) as s (s.level)}
          <li>
            <span class="hash">
              {#if s.position === 'left'}
                H(<span class="sib">{short(s.sibling)}</span> ‖ <span class="own">{short(s.own)}</span>)
              {:else}
                H(<span class="own">{short(s.own)}</span> ‖ <span class="sib">{short(s.sibling)}</span>)
              {/if}
              = {short(s.result)}
            </span>
            <span class="side">Geschwister steht {s.position === 'left' ? 'links' : 'rechts'}</span>
          </li>
        {/each}
      </ol>
    {/if}
    {#if selected !== null && (revealed === null || revealed >= proofSteps.length)}
      {#if headerRoot === null}
        <p class="verdict" class:ok={proofOk}>
          {proofOk ? 'Ergebnis stimmt mit der aktuellen Merkle-Wurzel überein.' : 'Ergebnis weicht von der Wurzel ab.'}
        </p>
        <p class="hint">
          Das beweist noch nichts, denn die Wurzel wurde gerade aus denselben Daten berechnet. Schreibe zuerst
          die Wurzel in den Block-Header, dann gibt es einen festen Wert, gegen den der Beweis prüft.
        </p>
      {:else if proofOk}
        <p class="verdict ok">Ergebnis stimmt mit der Wurzel im Header überein: Beweis gültig.</p>
      {:else}
        <p class="verdict">
          Beweis scheitert: berechnete Wurzel <span class="hash">{short(tree.root)}</span> ≠ Wurzel im Header
          <span class="hash">{short(headerRoot)}</span>
        </p>
        <p class="hint">
          Seit dem Eintrag in den Header hat sich eine Transaktion geändert, dadurch ändern sich alle Hashes bis
          zur Wurzel, während die Wurzel im Header fest bleibt.
        </p>
      {/if}
    {/if}
  </div>

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
  .tx-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
  .tx-list li {
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.6rem;
    padding: 0.15rem 0.3rem;
    border-radius: var(--radius);
  }
  .tx-list li.active { background: var(--accent-soft); }
  .tx-label { font-weight: 600; font-size: 0.9rem; color: var(--fg-muted); }
  .tx-list input { width: 100%; min-width: 0; }
  .txid { color: var(--fg-muted); white-space: nowrap; }
  @media (max-width: 520px) {
    .tx-list li { grid-template-columns: 2.6rem minmax(0, 1fr); }
    .txid { grid-column: 2; }
  }

  .tree { margin: 0; min-width: 0; } /* Grid-Kind: sonst wächst es mit dem scrollbaren Baum */
  .tree svg { display: block; width: 100%; height: auto; margin: 0 auto; }
  .scroll-hint { margin: 0.3rem 0 0.2rem; text-align: center; font-size: 0.85rem; color: var(--fg-muted); }
  @media (max-width: 560px) {
    .tree-scroll.wide { overflow-x: auto; overscroll-behavior-x: contain; }
    .tree-scroll.wide .tree-inner { min-width: var(--tree-min); }
  }
  .edge { stroke: var(--border); stroke-width: 1.5; transition: stroke 0.3s; }
  .edge.ghost { stroke-dasharray: 4 4; }
  .edge.path { stroke: var(--accent); stroke-width: 2.5; }
  .node rect {
    fill: var(--bg-elevated);
    stroke: var(--fg-muted);
    stroke-width: 1.2;
    transition: fill 0.9s ease-out, stroke 0.9s ease-out;
  }
  .node .h { font-family: var(--font-mono); font-size: 13px; fill: var(--fg); text-anchor: middle; }
  .node .lbl { font-family: var(--font-sans); font-size: 12px; fill: var(--fg-muted); text-anchor: middle; }
  .node .root-lbl { font-weight: 600; fill: var(--fg); }
  .node.leaf { cursor: pointer; }
  .node.leaf:hover rect { stroke: var(--accent); }
  .node.leaf:focus { outline: none; }
  .node.leaf:focus-visible rect { stroke: var(--accent); stroke-width: 3; }
  .node.ghost rect { stroke-dasharray: 4 3; fill: var(--bg-muted); }
  .node.ghost .h { fill: var(--fg-muted); }
  .node.path rect { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 2.2; }
  .node.sibling rect { fill: var(--bg-muted); stroke: var(--info); stroke-width: 2.2; }
  .node.flash rect {
    fill: color-mix(in srgb, var(--accent) 55%, var(--bg-elevated));
    stroke: var(--accent-strong);
    transition-duration: 0.08s;
  }

  .legend { display: flex; flex-wrap: wrap; gap: 0.4rem 1.2rem; justify-content: center; font-size: 0.85rem; }
  .legend span { display: inline-flex; align-items: center; gap: 0.4rem; }
  .sw { display: inline-block; width: 1.1rem; height: 0.75rem; border-radius: var(--radius-sm); border: 2px solid; }
  .sw.path { background: var(--accent-soft); border-color: var(--accent); }
  .sw.sibling { background: var(--bg-muted); border-color: var(--info); }
  .sw.ghost { background: var(--bg-muted); border: 1.5px dashed var(--fg-muted); }

  .header-box {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1rem;
    padding: 0.6rem 0.8rem;
    border: 1px solid var(--border);
    border-left: 4px solid var(--ok);
    border-radius: var(--radius);
    background: var(--bg-muted);
  }
  .header-box.mismatch { border-left-color: var(--danger); }
  .header-title { margin: 0; font-weight: 600; }
  .header-line { margin: 0; flex: 1 1 16rem; min-width: 0; overflow-wrap: anywhere; }
  .header-state { color: var(--fg-muted); font-size: 0.85rem; }
  .header-box.mismatch .header-state { color: var(--danger); }

  .proof { border-top: 1px solid var(--border); padding-top: 0.9rem; }
  .hint { margin: 0; color: var(--fg-muted); font-size: 0.92rem; }
  .proof-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.4rem 1rem; margin-bottom: 0.5rem; }
  .proof-title { margin: 0; font-weight: 600; }
  .steps { margin: 0 0 0.6rem; padding-left: 1.4rem; display: grid; gap: 0.35rem; }
  .steps li { display: flex; flex-wrap: wrap; gap: 0.2rem 0.8rem; align-items: baseline; }
  .own { color: var(--accent-strong); font-weight: 600; }
  .sib { color: var(--info); font-weight: 600; }
  .side { color: var(--fg-muted); font-size: 0.85rem; }
  .verdict { margin: 0 0 0.3rem; color: var(--danger); font-weight: 600; }
  .verdict.ok { color: var(--ok); }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap; }
  .actions.left { justify-content: flex-start; }
  @media (prefers-reduced-motion: reduce) {
    .node rect, .edge { transition: none; }
  }
</style>
