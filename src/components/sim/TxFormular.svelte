<script lang="ts">
  import { btcToSats, formatBtc, sendTransaction, spendableBalance, type World } from '../../lib/sim';

  interface Props {
    world: World;
    version: number;
    onmutate: () => void;
  }
  let { world, version, onmutate }: Props = $props();

  const uid = Math.random().toString(36).slice(2, 8);
  let from = $state('alice');
  let to = $state('bob');
  let amount = $state(2);
  let fee = $state(0.1);
  let message: { ok: boolean; text: string } | null = $state(null);

  const options = $derived.by(() => {
    void version;
    const nodes = Object.values(world.nodes);
    return {
      senders: nodes.filter((n) => n.kind === 'wallet').map((n) => ({ id: n.id, name: n.name })),
      receivers: nodes.filter((n) => n.kind !== 'full').map((n) => ({ id: n.id, name: n.kind === 'miner' ? `Miner ${n.name}` : n.name })),
    };
  });

  const available = $derived.by(() => {
    void version;
    return spendableBalance(world, from);
  });

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!(amount > 0)) {
      message = { ok: false, text: 'Der Betrag muss größer als 0 sein.' };
      return;
    }
    if (!(fee >= 0)) {
      message = { ok: false, text: 'Die Gebühr darf nicht negativ sein.' };
      return;
    }
    const res = sendTransaction(world, from, to, btcToSats(amount), btcToSats(fee));
    if (res.ok) {
      message = { ok: true, text: `Transaktion ${res.value.slice(0, 6)}… ist unterwegs. Verfolge den orangen Punkt.` };
    } else {
      message = { ok: false, text: `Nicht gesendet: ${res.error}.` };
    }
    onmutate();
  }
</script>

<form class="card txform" onsubmit={submit} aria-labelledby="tx-titel-{uid}">
  <h3 id="tx-titel-{uid}">Neue Transaktion</h3>
  <div class="felder">
    <div class="feld">
      <label for="from-{uid}">Von</label>
      <select id="from-{uid}" bind:value={from}>
        {#each options.senders as o (o.id)}
          <option value={o.id}>{o.name}</option>
        {/each}
      </select>
    </div>
    <div class="feld">
      <label for="to-{uid}">An</label>
      <select id="to-{uid}" bind:value={to}>
        {#each options.receivers as o (o.id)}
          <option value={o.id}>{o.name}</option>
        {/each}
      </select>
    </div>
    <div class="feld">
      <label for="amount-{uid}">Betrag (BTC)</label>
      <input id="amount-{uid}" type="number" min="0.00000001" step="any" bind:value={amount} required />
    </div>
    <div class="feld">
      <label for="fee-{uid}">Gebühr (BTC)</label>
      <input id="fee-{uid}" type="number" min="0" step="any" bind:value={fee} required />
    </div>
  </div>
  <div class="senden">
    <button type="submit" class="primary">Senden</button>
    {#if available !== null}
      <span class="verfuegbar">verfügbar: {formatBtc(available)}</span>
    {/if}
  </div>
  {#if message}
    <p class="meldung" class:fehler={!message.ok} role="status">{message.text}</p>
  {/if}
</form>

<style>
  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.05rem;
  }
  .felder {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
    gap: 0.5rem 0.8rem;
  }
  .feld {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .feld select,
  .feld input {
    width: 100%;
  }
  .senden {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1rem;
    margin-top: 0.7rem;
  }
  .verfuegbar {
    font-size: 0.85rem;
    color: var(--fg-muted);
  }
  .meldung {
    margin: 0.6rem 0 0;
    font-size: 0.9rem;
    color: var(--ok);
  }
  .meldung.fehler {
    color: var(--danger);
  }
</style>
