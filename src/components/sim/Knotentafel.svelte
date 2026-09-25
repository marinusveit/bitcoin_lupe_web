<script lang="ts">
  import {
    chainHashes,
    chainNodeOf,
    confirmations,
    formatBtc,
    isChainNode,
    minerDifficulty,
    formatDifficulty,
    privateLead,
    leadText,
    txFee,
    walletBalance,
    withPendingOutputs,
    type Block,
    type Tx,
    type World,
  } from '../../lib/sim';
  import Kettenansicht from './Kettenansicht.svelte';
  import { addressName, isHighlightedTx, minerColor, type Highlight } from './helpers';

  interface Props {
    world: World;
    version: number;
    selectedId: string | null;
    highlight: Highlight;
    onhighlight: (h: Highlight) => void;
  }
  let { world, version, selectedId, highlight, onhighlight }: Props = $props();

  function describe(tx: Tx, utxo: Record<string, { value: number; address: string }>): string {
    const first = tx.inputs[0];
    const sender = first ? utxo[`${first.txid}:${first.vout}`]?.address : undefined;
    const parts = tx.outputs
      .filter((o) => o.address !== sender)
      .map((o) => `${formatBtc(o.value)} an ${addressName(world, o.address)}`);
    return `${sender ? addressName(world, sender) : 'Unbekannt'}: ${parts.join(', ') || 'an sich selbst'}`;
  }

  const view = $derived.by(() => {
    void version;
    const n = selectedId ? world.nodes[selectedId] : undefined;
    if (!n) return null;

    if (n.kind === 'wallet') {
      const via = chainNodeOf(world, n.id);
      const bal = walletBalance(world, n.id);
      const utxos = (bal?.utxos ?? []).map((u) => ({ ...u, conf: via ? confirmations(via, u.txid) : 0 }));
      const lookup = via ? withPendingOutputs(via.utxo, Object.values(via.mempool)) : {};
      const pending = via
        ? Object.values(via.mempool)
            .filter((tx) => tx.outputs.some((o) => o.address === n.address) || tx.inputs.some((i) => lookup[`${i.txid}:${i.vout}`]?.address === n.address))
            .map((tx) => ({ txid: tx.txid, text: describe(tx, lookup) }))
        : [];
      let attack: { conf: number; gone: boolean; attacker: string; amount: number; seen: number | undefined } | null = null;
      const a = world.attack;
      if (a && via && (a.victimId === n.id || a.attackerId === n.id)) {
        attack = {
          conf: confirmations(via, a.publicTx.txid),
          gone: !!via.txIndex[a.privateTx.txid],
          attacker: world.nodes[a.attackerId]?.name ?? a.attackerId,
          amount: a.amount,
          seen: a.victimId === n.id ? a.victimConfAtRelease : undefined,
        };
      }
      return { kind: 'wallet' as const, n, via, bal, utxos, pending, attack };
    }

    if (!isChainNode(n)) return null;
    const tip = n.blocks[n.tip]!;
    const best = new Set(chainHashes(n.blocks, n.tip));
    const blocks: Block[] = Object.values(n.blocks);
    const privateSet = new Set<string>();
    if (n.kind === 'miner') for (const b of n.privateChain) {
      blocks.push(b);
      privateSet.add(b.hash);
    }
    const minerNames: Record<string, string> = {};
    for (const b of blocks) minerNames[b.minerId] = world.nodes[b.minerId]?.name ?? b.minerId.toUpperCase();
    const outputs = withPendingOutputs(n.utxo, Object.values(n.mempool));
    const mempool = Object.values(n.mempool).map((tx) => ({ txid: tx.txid, text: describe(tx, outputs), fee: txFee(tx, outputs) }));
    mempool.sort((a, b) => b.fee - a.fee);
    const peers = n.peers.map((p) => world.nodes[p]?.name ?? p);
    const miner =
      n.kind === 'miner'
        ? {
            hashrate: n.hashrate,
            dishonest: n.dishonest,
            difficulty: minerDifficulty(world, n),
            privateLen: n.privateChain.length,
            lead: privateLead(n),
            balance: walletBalance(world, n.id),
          }
        : null;
    return { kind: 'chain' as const, n, tip, best, blocks, privateSet, minerNames, mempool, peers, miner, known: Object.keys(n.blocks).length };
  });
</script>

<section class="card tafel" aria-live="off" aria-label="Details zum gewählten Knoten">
  {#if !view}
    <p class="leer">Klicke auf der Karte einen Knoten an, um seine Sicht auf das Netz zu sehen.</p>
  {:else if view.kind === 'wallet'}
    <h3>{view.n.name} <span class="badge">Wallet</span></h3>
    <p class="status">Hängt an {view.via?.name ?? 'keinem Knoten'} und sieht die Kette aus dessen Sicht.</p>
    {#if view.bal}
      <dl class="saldo">
        <div><dt>Bestätigt</dt><dd>{formatBtc(view.bal.confirmed)}</dd></div>
        <div>
          <dt>Unbestätigt</dt>
          <dd class:plus={view.bal.unconfirmed > 0} class:minus={view.bal.unconfirmed < 0}>
            {view.bal.unconfirmed > 0 ? '+' : view.bal.unconfirmed < 0 ? '−' : ''}{formatBtc(Math.abs(view.bal.unconfirmed))}
          </dd>
        </div>
      </dl>
    {/if}
    {#if view.attack}
      <p class="angriff" class:weg={view.attack.gone}>
        {#if view.attack.gone}
          Die Zahlung von {view.attack.attacker} über {formatBtc(view.attack.amount)} ist aus der Kette verschwunden.
          {#if view.attack.seen}
            Vorher hatte {view.n.name} schon {view.attack.seen} {view.attack.seen === 1 ? 'Bestätigung' : 'Bestätigungen'} gesehen.
          {/if}
        {:else}
          Zahlung von {view.attack.attacker} über {formatBtc(view.attack.amount)}:
          {view.attack.conf === 0 ? 'noch unbestätigt' : `${view.attack.conf} ${view.attack.conf === 1 ? 'Bestätigung' : 'Bestätigungen'}`}
        {/if}
      </p>
    {/if}
    <h4>Unverbrauchte Outputs (UTXOs)</h4>
    {#if view.utxos.length === 0}
      <p class="leer">Keine.</p>
    {:else}
      <div class="tabelle">
        <table>
          <thead><tr><th scope="col">Output</th><th scope="col">Betrag</th><th scope="col">Bestätigungen</th></tr></thead>
          <tbody>
            {#each view.utxos as u (u.key)}
              <tr><td class="hash">{u.txid.slice(0, 8)}:{u.vout}</td><td>{formatBtc(u.value)}</td><td>{u.conf}</td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
    {#if view.pending.length > 0}
      <h4>Unterwegs (im Mempool)</h4>
      <ul class="txliste">
        {#each view.pending as p (p.txid)}
          <li>
            <button type="button" class="kuerzel" class:aktiv={isHighlightedTx(highlight, p.txid)} onclick={() => onhighlight({ kind: 'tx', id: p.txid })}>{p.txid.slice(0, 6)}</button>
            {p.text}
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <h3>
      {#if view.n.kind === 'miner'}<span class="sw" style="background: {minerColor(view.n.id)}"></span>{/if}
      {view.n.kind === 'miner' ? `Miner ${view.n.name}` : view.n.name}
      <span class="badge">{view.n.kind === 'miner' ? 'Miner' : 'Full Node'}</span>
      {#if view.miner?.dishonest}<span class="badge boese">unehrlich</span>{/if}
    </h3>
    <p class="status">
      Spitze: Block {view.tip.height} (<span class="hash">{view.tip.hash.slice(0, 10)}…</span>), kennt {view.known}
      {view.known === 1 ? 'Block' : 'Blöcke'}, verbunden mit {view.peers.join(', ')}.
    </p>
    {#if view.miner}
      <p class="status">
        Hashrate {view.miner.hashrate}, Difficulty {formatDifficulty(view.miner.difficulty, world.params.difficulty)}, Chance je Tick {(
          (view.miner.hashrate / view.miner.difficulty) *
          100
        ).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %{#if view.miner.balance}, Guthaben {formatBtc(view.miner.balance.confirmed)}{/if}.
        {#if view.miner.dishonest}
          Geheime Kette: {view.miner.privateLen} {view.miner.privateLen === 1 ? 'Block' : 'Blöcke'},
          {leadText(view.miner.lead)}.
        {/if}
      </p>
    {/if}
    <h4>Kette aus Sicht von {view.n.name}</h4>
    <Kettenansicht
      blocks={view.blocks}
      best={view.best}
      privateSet={view.privateSet}
      minerNames={view.minerNames}
      {highlight}
      {onhighlight}
      maxCols={8}
      label="Blöcke, die {view.n.name} kennt"
    />
    <h4>Mempool ({view.mempool.length})</h4>
    {#if view.mempool.length === 0}
      <p class="leer">Leer: Alle bekannten Transaktionen stehen schon in einem Block.</p>
    {:else}
      <ul class="txliste">
        {#each view.mempool as t (t.txid)}
          <li>
            <button type="button" class="kuerzel" class:aktiv={isHighlightedTx(highlight, t.txid)} onclick={() => onhighlight({ kind: 'tx', id: t.txid })}>{t.txid.slice(0, 6)}</button>
            {t.text} <span class="gebuehr">(Gebühr {formatBtc(t.fee)})</span>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</section>

<style>
  .tafel {
    min-width: 0;
  }
  h3 {
    margin: 0 0 0.3rem;
    font-size: 1.1rem;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }
  h4 {
    margin: 0.9rem 0 0.35rem;
    font-size: 0.95rem;
  }
  .status {
    font-size: 0.88rem;
    color: var(--fg-muted);
    margin-bottom: 0.4rem;
  }
  .leer {
    font-size: 0.88rem;
    color: var(--fg-muted);
    margin: 0;
  }
  .badge.boese {
    color: var(--danger);
    border-color: var(--danger);
  }
  .sw {
    width: 14px;
    height: 14px;
    border-radius: var(--radius-sm);
    display: inline-block;
  }
  .saldo {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.6rem;
    margin: 0.4rem 0;
  }
  .saldo dt {
    font-size: 0.8rem;
    color: var(--fg-muted);
  }
  .saldo dd {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .plus {
    color: var(--ok);
  }
  .minus {
    color: var(--danger);
  }
  .angriff {
    border-left: 3px solid var(--warn);
    padding: 0.3rem 0.6rem;
    font-size: 0.9rem;
    margin: 0.5rem 0;
    background: var(--bg-muted);
  }
  .angriff.weg {
    border-color: var(--danger);
    color: var(--danger);
    font-weight: 600;
  }
  .tabelle {
    overflow-x: auto;
  }
  table {
    margin: 0;
    font-size: 0.87rem;
  }
  th,
  td {
    padding: 0.25rem 0.4rem;
  }
  .txliste {
    list-style: none;
    padding: 0;
    margin: 0;
    font-size: 0.87rem;
  }
  .txliste li {
    padding: 0.2rem 0;
    border-bottom: 1px solid var(--bg-muted);
    overflow-wrap: anywhere;
  }
  .gebuehr {
    color: var(--fg-muted);
  }
  .kuerzel {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    padding: 0 0.4em;
    margin-right: 0.3rem;
    border-radius: var(--radius-sm);
    background: var(--bg-muted);
  }
  .kuerzel.aktiv {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
</style>
