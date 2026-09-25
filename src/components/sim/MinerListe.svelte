<script lang="ts">
  import {
    addMiner,
    attackBudget,
    attackInProgress,
    DISHONEST_VICTIM,
    PRESETS,
    removeNode,
    setDishonest,
    setHashrate,
    startDishonestAttack,
    type MinerNode,
    type World,
  } from '../../lib/sim';
  import { minerColor } from './helpers';

  interface Props {
    world: World;
    version: number;
    onmutate: () => void;
    onselect: (id: string) => void;
  }
  let { world, version, onmutate, onselect }: Props = $props();

  const uid = $props.id();
  let error = $state('');

  const miners = $derived.by(() => {
    void version;
    return Object.values(world.nodes)
      .filter((n): n is MinerNode => n.kind === 'miner')
      .map((m) => ({ id: m.id, name: m.name, hashrate: m.hashrate, dishonest: m.dishonest, budget: attackBudget(world, m.id) }));
  });
  /** Laufender oder veröffentlichter Angriff: kein zweiter, der Haken des Angreifers zeigt ihn an. */
  const busyBy = $derived.by(() => {
    void version;
    const a = world.attack;
    return attackInProgress(a) ? { id: a.attackerId, name: world.nodes[a.attackerId]?.name ?? a.attackerId } : null;
  });
  const opfer = $derived(world.nodes[DISHONEST_VICTIM]?.name ?? 'Bob');
  const total = $derived(miners.reduce((s, m) => s + m.hashrate, 0));

  function anteil(hashrate: number): number {
    return total > 0 ? Math.round((hashrate / total) * 100) : 0;
  }
  function rate(id: string, value: number) {
    if (!(value >= 0)) return;
    setHashrate(world, id, value);
    onmutate();
  }
  function dishonest(id: string, value: boolean) {
    if (value) {
      const res = startDishonestAttack(world, id);
      error = res.ok ? '' : res.error;
    } else {
      setDishonest(world, id, false);
      error = '';
    }
    onmutate();
  }
  /** Warum der Haken gerade nichts bewirkt, sonst leer. */
  function blocked(m: { id: string; dishonest: boolean; budget: number }): string {
    if (m.dishonest) return '';
    // Nach dem Veröffentlichen ist der Angreifer nicht mehr unehrlich, sein Angriff aber noch nicht entschieden.
    if (busyBy?.id === m.id) return 'sein Angriff ist noch offen';
    if (busyBy) return `es läuft schon ein Angriff von ${busyBy.name}`;
    if (m.budget <= 0) return 'braucht Guthaben: erst einen Block finden';
    return '';
  }
  function remove(id: string) {
    const res = removeNode(world, id);
    error = res.ok ? '' : res.error;
    onmutate();
  }
  function add() {
    const res = addMiner(world, { hashrate: 1 });
    error = res.ok ? '' : res.error;
    if (res.ok) onselect(res.value);
    onmutate();
  }
</script>

<section class="card minerliste" aria-labelledby="miner-titel-{uid}">
  <h3 id="miner-titel-{uid}">Miner</h3>
  <div class="tabelle">
    <table>
      <thead>
        <tr><th scope="col">Name</th><th scope="col">Hashrate</th><th scope="col" class="anteil-spalte">Anteil</th><th scope="col">Unehrlich</th><th scope="col"><span class="visually-hidden">Entfernen</span></th></tr>
      </thead>
      <tbody>
        {#each miners as m (m.id)}
          <tr>
            <td>
              <button type="button" class="name" onclick={() => onselect(m.id)} title="Details zu {m.name} zeigen">
                <span class="sw" style="background: {minerColor(m.id)}"></span>{m.name}
              </button>
              <span class="anteil-klein">{anteil(m.hashrate)} % Anteil</span>
            </td>
            <td>
              <label class="visually-hidden" for="rate-{uid}-{m.id}">Hashrate von {m.name}</label>
              <input
                id="rate-{uid}-{m.id}"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={m.hashrate}
                onchange={(e) => rate(m.id, e.currentTarget.valueAsNumber)}
              />
            </td>
            <td class="anteil anteil-spalte">{anteil(m.hashrate)} %</td>
            <td class="unehrlich">
              <input
                type="checkbox"
                checked={m.dishonest}
                disabled={blocked(m) !== ''}
                aria-label="{m.name} arbeitet unehrlich"
                aria-describedby={blocked(m) ? `grund-${uid}-${m.id}` : undefined}
                onchange={(e) => dishonest(m.id, e.currentTarget.checked)}
              />
              {#if blocked(m)}<span class="grund" id="grund-{uid}-{m.id}">{blocked(m)}</span>{/if}
            </td>
            <td><button type="button" class="entfernen" onclick={() => remove(m.id)} aria-label="{m.name} entfernen"><span class="lang">Entfernen</span><span class="kurz" aria-hidden="true">×</span></button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <button type="button" onclick={add}>Miner hinzufügen</button>
  {#if error}<p class="fehler" role="alert">{error}</p>{/if}
  <p class="hinweis">
    Der Haken „Unehrlich“ startet einen Double Spend: Der Miner zahlt {opfer} öffentlich bis zu
    {PRESETS.attack.attack?.amount} BTC aus seinem Guthaben und baut heimlich eine Kette, in der dieselben Coins an ihn
    selbst gehen. Seine Blöcke hält er zurück, bis die Zahlung an {opfer} {world.params.attackConfirmations} Bestätigungen
    hat und in seiner geheimen Kette mehr Arbeit steckt als in der öffentlichen. Ohne Guthaben bleibt der Haken gesperrt;
    ein Miner bekommt es über die Belohnung für seine Blöcke (bei Bitcoin erst nach 100 Blöcken ausgebbar, hier sofort).
  </p>
</section>

<style>
  h3 {
    margin: 0 0 0.4rem;
    font-size: 1.05rem;
  }
  .tabelle {
    overflow-x: auto;
  }
  table {
    margin: 0 0 0.7rem;
    font-size: 0.9rem;
  }
  th,
  td {
    padding: 0.3rem 0.4rem;
    vertical-align: middle;
  }
  input[type='number'] {
    width: 4.8rem;
    padding: 0.25rem 0.4rem;
  }
  input[type='checkbox'] {
    width: 1.1rem;
    height: 1.1rem;
    accent-color: var(--danger);
  }
  .name {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: none;
    background: none;
    padding: 0.2rem 0;
    font-weight: 600;
  }
  .sw {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-sm);
    display: inline-block;
  }
  .anteil {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .entfernen {
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
  }
  .anteil-klein,
  .kurz {
    display: none;
  }
  .anteil-klein {
    font-size: 0.75rem;
    color: var(--fg-muted);
    font-variant-numeric: tabular-nums;
  }
  /* Schmal: Anteil unter den Namen, Entfernen als ×, damit die Tabelle nicht seitlich scrollt. */
  @container (max-width: 479.98px) {
    th,
    td {
      padding: 0.25rem 0.2rem;
    }
    input[type='number'] {
      width: 3.6rem;
    }
    .anteil-spalte,
    .lang {
      display: none;
    }
    .anteil-klein {
      display: block;
    }
    .kurz {
      display: inline;
    }
    /* Trefferfläche für den Finger mindestens 36 × 36 px (sim-17). */
    .entfernen {
      min-width: 2.25rem;
      min-height: 2.25rem;
      padding: 0.2rem 0.45rem;
    }
  }
  .unehrlich {
    white-space: nowrap;
  }
  .grund {
    display: block;
    max-width: 11rem;
    white-space: normal;
    font-size: 0.75rem;
    line-height: 1.25;
    color: var(--fg-muted);
  }
  .fehler {
    color: var(--danger);
    font-size: 0.9rem;
    margin: 0.5rem 0 0;
  }
  .hinweis {
    font-size: 0.85rem;
    color: var(--fg-muted);
    margin: 0.6rem 0 0;
  }
</style>
