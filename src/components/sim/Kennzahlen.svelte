<script lang="ts">
  import { formatBtc, formatDifficulty, stats, type World } from '../../lib/sim';
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

  const attack = $derived.by(() => {
    void version;
    const a = world.attack;
    if (!a) return null;
    const text = {
      running: a.z >= 0 ? `läuft, Vorsprung ${a.z}` : `läuft, Rückstand ${-a.z}`,
      released: 'veröffentlicht, Ausgang offen',
      succeeded: 'gelungen',
      failed: 'gescheitert, ehrliche Kette vorn',
      abandoned: 'aufgegeben',
    }[a.status];
    return { text, status: a.status };
  });
</script>

<dl class="kennzahlen" aria-label="Kennzahlen des Netzes">
  <div><dt>{compact ? 'Länge der Kette' : 'Höhe'}</dt><dd>{s.height}</dd></div>
  {#if !compact}
    <div><dt>Difficulty</dt><dd>{formatDifficulty(s.difficulty)}</dd></div>
    <div><dt>Gesamt-Hashrate</dt><dd>{fmtNumber(s.totalHashrate)}</dd></div>
    <div>
      <dt>Mittlerer Blockabstand</dt>
      <dd>{s.meanBlockInterval === null ? 'noch kein Block' : `${fmtNumber(s.meanBlockInterval, 0)} ${Math.round(s.meanBlockInterval) === 1 ? 'Tick' : 'Ticks'}`}</dd>
    </div>
    <div><dt>Coins im Umlauf</dt><dd>{formatBtc(s.coinsInCirculation)}</dd></div>
  {/if}
  <div><dt>{compact ? 'Wartende Transaktionen' : 'Tx im Mempool'}</dt><dd>{s.mempoolSize}</dd></div>
  <div>
    <dt>Einigkeit</dt>
    <dd class:split={s.distinctTips > 1}>{s.distinctTips === 1 ? 'alle Knoten gleich' : `${s.distinctTips} verschiedene Spitzen`}</dd>
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
