<script lang="ts">
  import {
    btcToSats,
    chainNodeOf,
    confirmations,
    formatBtc,
    isChainNode,
    sendTransaction,
    shortHash,
    spendableBalance,
    type World,
  } from '../../lib/sim';

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
  /** Zuletzt gesendete Zahlung; `world` merkt sich die Welt, damit „Zurücksetzen“ die Verfolgung beendet. */
  let tracked: { txid: string; to: string; toName: string; world: World } | null = $state.raw(null);

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

  /** Unbestätigte Eingänge des Absenders (Rückgeld und Empfänge im Mempool), 0 wenn keine. */
  const incoming = $derived.by(() => {
    void version;
    const wallet = world.nodes[from];
    const via = chainNodeOf(world, from);
    if (!wallet || wallet.kind !== 'wallet' || !via) return 0;
    let sum = 0;
    for (const tx of Object.values(via.mempool)) for (const o of tx.outputs) if (o.address === wallet.address) sum += o.value;
    return sum;
  });

  /** Weg der zuletzt gesendeten Zahlung: wie viele Knoten sie kennen und wie oft sie beim Empfänger bestätigt ist. */
  const progress = $derived.by(() => {
    void version;
    if (!tracked || tracked.world !== world) return null;
    const chainNodes = Object.values(world.nodes).filter(isChainNode);
    const known = chainNodes.filter((n) => n.mempool[tracked!.txid] || n.txIndex[tracked!.txid]).length;
    const receiver = chainNodeOf(world, tracked.to);
    const conf = receiver ? confirmations(receiver, tracked.txid) : 0;
    const inBlock = receiver && conf > 0 ? receiver.blocks[receiver.txIndex[tracked.txid]!]!.height : null;
    return { txid: tracked.txid, toName: tracked.toName, known, total: chainNodes.length, conf, inBlock };
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
      const toNode = world.nodes[to];
      tracked = { txid: res.value, to, toName: toNode ? toNode.name : to, world };
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
      <span class="verfuegbar">
        verfügbar: {formatBtc(available)}
        {#if incoming > 0}
          <span class="unbestaetigt">(+{formatBtc(incoming)} unbestätigt; in diesem Simulator erst ausgebbar, wenn die Zahlung in einem Block steht)</span>
        {/if}
      </span>
    {/if}
  </div>
  {#if message}
    <p class="meldung" class:fehler={!message.ok} role="status">{message.text}</p>
  {/if}
  {#if progress}
    <ol class="weg" aria-label="Weg der Zahlung {shortHash(progress.txid)}">
      <li class:erreicht={progress.known > 0}>
        <span class="punkt"></span>
        Bekannt bei {progress.known} von {progress.total} Knoten
      </li>
      <li class:erreicht={progress.inBlock !== null}>
        <span class="punkt"></span>
        {progress.inBlock === null ? 'Wartet im Mempool auf einen Block' : `Steht in Block ${progress.inBlock}`}
      </li>
      <li class:erreicht={progress.conf >= 1}>
        <span class="punkt"></span>
        {progress.conf === 0
          ? `Bei ${progress.toName} noch unbestätigt`
          : `${progress.conf} ${progress.conf === 1 ? 'Bestätigung' : 'Bestätigungen'} bei ${progress.toName}`}
      </li>
    </ol>
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
  .unbestaetigt {
    color: var(--warn);
  }
  .weg {
    list-style: none;
    margin: 0.6rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
    font-size: 0.88rem;
    color: var(--fg-muted);
  }
  .weg li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .weg .punkt {
    flex: none;
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    border: 2px solid var(--border);
    background: var(--bg);
  }
  .weg .erreicht {
    color: var(--fg);
  }
  .weg .erreicht .punkt {
    border-color: var(--ok);
    background: var(--ok);
  }
</style>
