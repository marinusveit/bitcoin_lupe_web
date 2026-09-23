<script lang="ts">
  import { addMiner, removeNode, setDishonest, setHashrate, type MinerNode, type World } from '../../lib/sim';
  import { minerColor } from './helpers';

  interface Props {
    world: World;
    version: number;
    onmutate: () => void;
    onselect: (id: string) => void;
  }
  let { world, version, onmutate, onselect }: Props = $props();

  const uid = Math.random().toString(36).slice(2, 8);
  let error = $state('');

  const miners = $derived.by(() => {
    void version;
    return Object.values(world.nodes)
      .filter((n): n is MinerNode => n.kind === 'miner')
      .map((m) => ({ id: m.id, name: m.name, hashrate: m.hashrate, dishonest: m.dishonest }));
  });
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
    setDishonest(world, id, value);
    onmutate();
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
        <tr><th scope="col">Name</th><th scope="col">Hashrate</th><th scope="col" class="anteil-spalte">Anteil</th><th scope="col">Unehrlich</th><th scope="col"><span class="sr">Entfernen</span></th></tr>
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
              <label class="sr" for="rate-{uid}-{m.id}">Hashrate von {m.name}</label>
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
            <td>
              <input
                type="checkbox"
                checked={m.dishonest}
                aria-label="{m.name} arbeitet unehrlich"
                onchange={(e) => dishonest(m.id, e.currentTarget.checked)}
              />
            </td>
            <td><button type="button" class="entfernen" onclick={() => remove(m.id)} aria-label="{m.name} entfernen"><span class="lang">Entfernen</span><span class="kurz" aria-hidden="true">×</span></button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <button type="button" onclick={add}>Miner hinzufügen</button>
  {#if error}<p class="fehler" role="alert">{error}</p>{/if}
  <p class="hinweis">Ein unehrlicher Miner hält seine Blöcke zurück, bis seine geheime Kette länger ist als die öffentliche.</p>
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
    .entfernen {
      padding: 0.2rem 0.45rem;
    }
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
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
