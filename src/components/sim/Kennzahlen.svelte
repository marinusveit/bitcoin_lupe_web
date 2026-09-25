<script lang="ts">
  import { attackWaitText, formatBtc, formatDifficulty, leadText, stats, type World } from '../../lib/sim';
  import { fmtNumber } from './helpers';

  interface Props {
    world: World;
    version: number;
    /** Kapitel-Modus: nur Höhe, Mempool und Einigkeit. */
    compact?: boolean;
  }
  let { world, version, compact = false }: Props = $props();

  const s = $derived.by(() => {
    void version;
    return stats(world);
  });

  // Gabelung (Knoten auf verschiedenen Zweigen) in Warnfarbe, bloßes Hinterherhängen neutral.
  const einigkeit = $derived.by(() => {
    const c = s.consensus;
    if (c.kind === 'agreed') return { text: 'alle Knoten gleich', fork: false };
    if (c.kind === 'fork') return { text: 'Gabelung', fork: true };
    return { text: `Block verbreitet sich (${c.have} von ${c.total} Knoten)`, fork: false };
  });

  const attack = $derived.by(() => {
    void version;
    const a = world.attack;
    if (!a) return null;
    const text = {
      running: `läuft, ${leadText(a.z)}` + attackWaitText(world),
      released: 'veröffentlicht, Ausgang offen',
      succeeded: 'gelungen',
      failed: 'gescheitert, ehrliche Kette vorn',
      abandoned: 'aufgegeben',
    }[a.status];
    return { text, status: a.status };
  });
</script>

<dl class="kennzahlen" class:compact aria-label="Kennzahlen des Netzes">
  <div><dt>Höhe</dt><dd>{s.height}</dd></div>
  {#if !compact}
    <div><dt>Difficulty (Start = 1)</dt><dd>{formatDifficulty(s.difficulty, world.params.difficulty)}</dd></div>
    <div><dt>Gesamt-Hashrate</dt><dd>{fmtNumber(s.totalHashrate)}</dd></div>
    <div>
      <dt>Mittlerer Blockabstand (Ziel {world.params.targetBlockTicks})</dt>
      <dd>{s.meanBlockInterval === null || s.height < 3 ? 'zu wenige Blöcke' : `${fmtNumber(s.meanBlockInterval, 0)} ${Math.round(s.meanBlockInterval) === 1 ? 'Tick' : 'Ticks'}`}</dd>
    </div>
    <div><dt>Coins im Umlauf</dt><dd>{formatBtc(s.coinsInCirculation)}</dd></div>
  {/if}
  <div><dt>{compact ? 'Wartend' : 'Tx im Mempool'}</dt><dd>{s.mempoolSize}</dd></div>
  <div>
    <dt>Einigkeit</dt>
    <dd class:split={einigkeit.fork}>{einigkeit.text}</dd>
  </div>
  {#if attack}
    <div class="angriff {attack.status}"><dt>Double Spend</dt><dd>{attack.text}</dd></div>
  {/if}
</dl>

<style>
  .kennzahlen {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
    gap: 1px;
    margin: 0;
    background: var(--border);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .kennzahlen > div {
    background: var(--bg-elevated);
    padding: 0.45rem 0.7rem;
  }
  /* Kapitel: immer drei Spalten (Höhe, Wartend, Einigkeit), auch bei 360 px ohne leere Zelle (k7-11). */
  .kennzahlen.compact {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .kennzahlen.compact > div {
    padding: 0.4rem 0.5rem;
  }
  dt {
    font-size: 0.8rem;
    color: var(--fg-muted);
  }
  dd {
    margin: 0;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  dd.split {
    color: var(--warn);
  }
  .angriff dd {
    color: var(--danger);
  }
  .angriff.abandoned dd,
  .angriff.failed dd {
    color: var(--ok);
  }
</style>
