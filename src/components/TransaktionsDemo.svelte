<script lang="ts">
  import {
    applyTx,
    coinbaseTx,
    execute,
    fee as txFee,
    hash160Hex,
    hexToBytes,
    outpointKey,
    p2pkhScriptPubKey,
    p2pkhScriptSig,
    publicKey,
    sighash,
    signMessage,
    txid,
    validateTx,
    type Transaction,
    type TxOutput,
    type UtxoSet,
  } from '../lib';

  interface Person {
    name: string;
    priv: string;
    pub: string;
    pkh: string;
  }

  // Feste Schlüssel, damit Adressen und Signaturen bei jedem Laden gleich aussehen.
  const people: Person[] = [
    { name: 'Alice', priv: 'a1'.repeat(32) },
    { name: 'Bob', priv: 'b0'.repeat(32) },
    { name: 'Carol', priv: 'c0'.repeat(32) },
  ].map((p) => {
    const pub = publicKey(p.priv);
    return { ...p, pub, pkh: hash160Hex(hexToBytes(pub)) };
  });

  const SAT = 100_000_000;

  interface Shown {
    tx: Transaction;
    id: string;
    fee: number;
    from: string | null;
    to: string;
    /** Vorherige Outputs der Inputs (für Anzeige von Besitzer und Betrag). */
    prevOuts: TxOutput[];
    scriptsOk: boolean;
  }

  function ownerOf(out: TxOutput): string {
    const hash = out.scriptPubKey[2];
    return people.find((p) => p.pkh === hash)?.name ?? 'unbekannt';
  }

  function btc(sat: number): string {
    return `${(sat / SAT).toLocaleString('de-DE', { maximumFractionDigits: 8 })} BTC`;
  }

  function parseBtc(text: string): number {
    const n = Number(String(text).trim().replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * SAT) : NaN;
  }

  function short(hex: string): string {
    return `${hex.slice(0, 8)}…${hex.slice(-6)}`;
  }

  function initial() {
    const cb = coinbaseTx(0, 50 * SAT, 0, p2pkhScriptPubKey(people[0]!.pub));
    const shown: Shown = { tx: cb, id: txid(cb), fee: 0, from: null, to: 'Alice', prevOuts: [], scriptsOk: true };
    return { utxos: applyTx(new Map(), cb), history: [shown] };
  }

  const start = initial();
  let utxos: UtxoSet = $state.raw(start.utxos);
  let history: Shown[] = $state.raw(start.history);
  let from = $state('Alice');
  let to = $state('Bob');
  let amount = $state('10');
  let feeText = $state('0,0001');
  let error = $state('');

  const latest = $derived(history[history.length - 1]!);

  const byPerson = $derived(
    people.map((p) => {
      const rows = [...utxos.entries()]
        .filter(([, out]) => out.scriptPubKey[2] === p.pkh)
        .map(([key, out]) => ({ key, value: out.value }));
      return { name: p.name, rows, total: rows.reduce((s, r) => s + r.value, 0) };
    }),
  );

  function send(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    const sender = people.find((p) => p.name === from)!;
    const receiver = people.find((p) => p.name === to)!;
    const value = parseBtc(amount);
    const feeSat = parseBtc(feeText);
    if (sender === receiver) return void (error = 'Absender und Empfänger müssen verschieden sein.');
    if (!(value > 0)) return void (error = 'Gib einen Betrag größer als 0 ein, z. B. 2,5.');
    if (!(feeSat >= 0)) return void (error = 'Die Gebühr muss 0 oder größer sein.');

    // UTXOs des Absenders wählen, größte zuerst, bis Betrag + Gebühr gedeckt sind.
    const own = [...utxos.entries()]
      .filter(([, out]) => out.scriptPubKey[2] === sender.pkh)
      .sort((a, b) => b[1].value - a[1].value);
    const balance = own.reduce((s, [, o]) => s + o.value, 0);
    const need = value + feeSat;
    if (balance < need) {
      error = `Guthaben reicht nicht: ${sender.name} besitzt ${btc(balance)}, gebraucht werden ${btc(need)} (Betrag + Gebühr).`;
      return;
    }
    const chosen: [string, TxOutput][] = [];
    let sum = 0;
    for (const entry of own) {
      if (sum >= need) break;
      chosen.push(entry);
      sum += entry[1].value;
    }
    const outputs: TxOutput[] = [{ value, scriptPubKey: p2pkhScriptPubKey(receiver.pub) }];
    if (sum - need > 0) outputs.push({ value: sum - need, scriptPubKey: p2pkhScriptPubKey(sender.pub) });
    const unsigned: Transaction = {
      inputs: chosen.map(([key]) => {
        const [id, vout] = key.split(':');
        return { txid: id!, vout: Number(vout), scriptSig: [] };
      }),
      outputs,
    };
    // Signieren: der Absender unterschreibt den Sighash mit seinem Private Key.
    const msg = sighash(unsigned);
    const sig = signMessage(sender.priv, msg);
    const tx: Transaction = {
      ...unsigned,
      inputs: unsigned.inputs.map((i) => ({ ...i, scriptSig: p2pkhScriptSig(sig, sender.pub) })),
    };
    const check = validateTx(utxos, tx);
    if (!check.ok) return void (error = check.error);
    const prevOuts = chosen.map(([, o]) => o);
    const scriptsOk = tx.inputs.every(
      (input, i) => execute(input.scriptSig, prevOuts[i]!.scriptPubKey, { messageHash: msg }).ok,
    );
    if (!scriptsOk) return void (error = 'Die Signatur passt nicht zum Sperr-Skript.');
    const shown: Shown = { tx, id: txid(tx), fee: txFee(utxos, tx), from: sender.name, to: receiver.name, prevOuts, scriptsOk };
    utxos = applyTx(utxos, tx);
    history = [...history, shown];
  }

  function reset() {
    const s = initial();
    utxos = s.utxos;
    history = s.history;
    from = 'Alice';
    to = 'Bob';
    amount = '10';
    feeText = '0,0001';
    error = '';
  }
</script>

<div class="demo">
  <form class="form" onsubmit={send}>
    <h3>Neue Transaktion</h3>
    <div class="fields">
      <label>Absender
        <select bind:value={from}>
          {#each people as p (p.name)}<option>{p.name}</option>{/each}
        </select>
      </label>
      <label>Empfänger
        <select bind:value={to}>
          {#each people as p (p.name)}<option>{p.name}</option>{/each}
        </select>
      </label>
      <label>Betrag in BTC
        <input type="text" inputmode="decimal" bind:value={amount} />
      </label>
      <label>Gebühr in BTC
        <input type="text" inputmode="decimal" bind:value={feeText} />
      </label>
    </div>
    <div class="actions">
      <button type="submit" class="primary">Signieren und senden</button>
      <button type="button" onclick={reset}>Zurücksetzen</button>
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </form>

  <section class="tx" aria-live="polite">
    <p class="caption">
      {#if latest.from}
        Zuletzt: {latest.from} zahlt {latest.to}. Alle Inputs sind mit {latest.from}s Signatur entsperrt und geprüft.
      {:else}
        Startzustand: Die Coinbase-Transaktion erzeugt 50 neue BTC für Alice.
      {/if}
    </p>
    <div class="flow">
      <div class="side">
        <h4>Inputs</h4>
        {#if latest.prevOuts.length === 0}
          <div class="io coinbase">Neue Coins (Coinbase)</div>
        {:else}
          {#each latest.tx.inputs as input, i (outpointKey(input.txid, input.vout))}
            <div class="io">
              <strong>{ownerOf(latest.prevOuts[i]!)}</strong>
              <span class="amount">{btc(latest.prevOuts[i]!.value)}</span>
              <span class="hash muted" title={outpointKey(input.txid, input.vout)}>aus {short(input.txid)}:{input.vout}</span>
            </div>
          {/each}
        {/if}
      </div>
      <div class="arrow" aria-hidden="true">
        <svg viewBox="0 0 40 24" width="40" height="24"><path d="M2 12h32m-8-8 8 8-8 8" /></svg>
      </div>
      <div class="side">
        <h4>Outputs</h4>
        {#each latest.tx.outputs as out, i (i)}
          <div class="io">
            <strong>{ownerOf(out)}</strong>
            <span class="amount">{btc(out.value)}</span>
            <span class="muted">Output {i}{#if latest.from && i === 1}, Wechselgeld{/if}</span>
          </div>
        {/each}
      </div>
    </div>
    <dl class="meta">
      <dt>TxID</dt>
      <dd class="hash">{latest.id}</dd>
      <dt>Gebühr</dt>
      <dd>{btc(latest.fee)} <span class="muted">(Inputs minus Outputs, geht an den Miner)</span></dd>
    </dl>
  </section>

  <section class="utxos">
    <h3>Unverbrauchte Outputs (UTXOs)</h3>
    <p class="muted small">Ein UTXO ist ein Output, der noch nicht ausgegeben wurde. Das Guthaben einer Person ist die Summe ihrer UTXOs.</p>
    <div class="people">
      {#each byPerson as p (p.name)}
        <div class="person">
          <div class="head"><strong>{p.name}</strong><span class="amount">{btc(p.total)}</span></div>
          {#if p.rows.length === 0}
            <p class="muted small">keine UTXOs</p>
          {:else}
            <table>
              <tbody>
                {#each p.rows as r (r.key)}
                  <tr><td class="hash" title={r.key}>{short(r.key.split(':')[0]!)}:{r.key.split(':')[1]}</td><td class="num">{btc(r.value)}</td></tr>
                {/each}
              </tbody>
            </table>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  {#if history.length > 1}
    <details class="history">
      <summary>Bisherige Transaktionen ({history.length})</summary>
      <ol>
        {#each history as h (h.id)}
          <li>
            {h.from ? `${h.from} → ${h.to}: ${btc(h.tx.outputs[0]!.value)}` : 'Coinbase → Alice: 50 BTC'}
            <span class="hash muted">{short(h.id)}</span>
          </li>
        {/each}
      </ol>
    </details>
  {/if}
</div>

<style>
  .demo { display: grid; gap: 1.5rem; }
  h3 { margin: 0 0 0.6rem; font-size: 1.05rem; }
  h4 { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--fg-muted); font-weight: 600; }
  .form { border-left: 3px solid var(--accent); padding-left: 1rem; }
  .fields { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); }
  .fields label { display: grid; gap: 0.25rem; }
  .fields input, .fields select { width: 100%; }
  .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 0.9rem; }
  .error { color: var(--danger); margin: 0.7rem 0 0; font-weight: 600; }
  .tx { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; }
  .caption { margin: 0 0 0.9rem; color: var(--fg-muted); font-size: 0.95rem; }
  .flow { display: grid; grid-template-columns: 1fr auto 1fr; gap: 0.8rem; align-items: start; }
  .arrow { align-self: center; }
  .side { display: grid; gap: 0.5rem; align-content: start; min-width: 0; }
  .io { display: grid; gap: 0.1rem; padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); min-width: 0; }
  .io.coinbase { color: var(--fg-muted); font-style: italic; }
  .arrow svg { display: block; fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .amount { font-variant-numeric: tabular-nums; font-weight: 600; }
  .muted { color: var(--fg-muted); }
  .small { font-size: 0.88rem; }
  .meta { display: grid; grid-template-columns: auto 1fr; gap: 0.3rem 0.8rem; margin: 1rem 0 0; }
  .meta dt { color: var(--fg-muted); font-size: 0.9rem; }
  .meta dd { margin: 0; min-width: 0; }
  .people { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
  .person .head { display: flex; justify-content: space-between; gap: 0.5rem; border-bottom: 2px solid var(--fg); padding-bottom: 0.3rem; }
  .person table { margin: 0.3rem 0 0; }
  .person td { padding: 0.3rem 0.2rem; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .history ol { margin: 0.5rem 0 0; padding-left: 1.4rem; }
  .history li { margin-bottom: 0.2rem; }
  summary { cursor: pointer; color: var(--fg-muted); }
  @media (max-width: 560px) {
    .flow { grid-template-columns: 1fr; }
    .arrow { justify-self: center; transform: rotate(90deg); }
  }
</style>
