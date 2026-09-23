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

  // Kleine Symbole für die Kisten-Metapher: Schloss (verschlossener Output) und Schlüssel (Input).
  const LOCK =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none"/></svg>';
  const KEY =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3m-3 3 3 3m-6 0 2.5 2.5"/></svg>';

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
  /** Ergebnis des Versuchs, einen schon verbrauchten Output noch einmal auszugeben. */
  let doubleSpend: { attempt: string; verdict: string } | null = $state(null);

  const latest = $derived(history[history.length - 1]!);

  /** Segmente des Betragsbalkens: oben die Inputs, unten Outputs plus Gebühr, gleiche Gesamtbreite. */
  const MIN_SEG = 8; // Prozent, damit auch eine winzige Gebühr sichtbar bleibt
  function segments(parts: { label: string; value: number; kind: 'in' | 'out' | 'change' | 'fee' }[]) {
    const total = parts.reduce((s, p) => s + p.value, 0);
    if (total <= 0) return [];
    const raw = parts.map((p) => (p.value / total) * 100);
    // Nur so viele Teile strecken, dass die großen zusammen mindestens die Hälfte behalten.
    const minSeg = Math.min(MIN_SEG, 50 / Math.max(1, parts.length));
    const small = raw.map((w) => w > 0 && w < minSeg);
    const reserved = small.filter(Boolean).length * minSeg;
    const bigSum = raw.reduce((s, w, i) => (small[i] ? s : s + w), 0);
    return parts.map((p, i) => ({ ...p, width: small[i] ? minSeg : (raw[i]! / bigSum) * (100 - reserved), stretched: small[i] }));
  }
  const bar = $derived.by(() => {
    if (!latest.from) return null;
    const ins = latest.prevOuts.map((o) => ({ label: ownerOf(o), value: o.value, kind: 'in' as const }));
    const outs = latest.tx.outputs.map((o, i) => ({
      label: i === 1 ? 'Wechselgeld' : ownerOf(o),
      value: o.value,
      kind: i === 1 ? ('change' as const) : ('out' as const),
    }));
    if (latest.fee > 0) outs.push({ label: 'Gebühr', value: latest.fee, kind: 'fee' as const });
    return { ins: segments(ins), outs: segments(outs), total: ins.reduce((s, p) => s + p.value, 0) };
  });
  const canDoubleSpend = $derived(
    latest.from !== null && latest.tx.inputs.some((i) => !utxos.has(outpointKey(i.txid, i.vout))),
  );

  const byPerson = $derived(
    people.map((p) => {
      const rows = [...utxos.entries()]
        .filter(([, out]) => out.scriptPubKey[2] === p.pkh)
        .map(([key, out]) => ({ key, value: out.value }));
      return { name: p.name, rows, total: rows.reduce((s, r) => s + r.value, 0) };
    }),
  );

  /** Signiert eine Transaktion mit den Inputs `keys` für den Absender. */
  function signTx(sender: Person, keys: string[], outputs: TxOutput[]): { tx: Transaction; msg: string } {
    const unsigned: Transaction = {
      inputs: keys.map((key) => {
        const [id, vout] = key.split(':');
        return { txid: id!, vout: Number(vout), scriptSig: [] };
      }),
      outputs,
    };
    // Signieren: der Absender unterschreibt den Sighash mit seinem Private Key.
    const msg = sighash(unsigned);
    const sig = signMessage(sender.priv, msg);
    return { tx: { ...unsigned, inputs: unsigned.inputs.map((i) => ({ ...i, scriptSig: p2pkhScriptSig(sig, sender.pub) })) }, msg };
  }

  /** Baut aus der letzten Transaktion eine zweite mit denselben Inputs und prüft sie gegen die UTXO-Menge. */
  function spendAgain() {
    if (!canDoubleSpend || !latest.from) return;
    error = '';
    const sender = people.find((p) => p.name === latest.from)!;
    const other = people.find((p) => p.name !== latest.from && p.name !== latest.to) ?? sender;
    const keys = latest.tx.inputs.map((i) => outpointKey(i.txid, i.vout));
    const outputs = latest.tx.outputs.map((o, i) => (i === 0 ? { ...o, scriptPubKey: p2pkhScriptPubKey(other.pub) } : o));
    const { tx } = signTx(sender, keys, outputs);
    const check = validateTx(utxos, tx);
    const attempt = `${sender.name} versucht, dieselben Inputs noch einmal auszugeben, diesmal ${btc(outputs[0]!.value)} an ${other.name}.`;
    if (check.ok) {
      doubleSpend = { attempt, verdict: 'Unerwartet: Die Prüfung hat nichts gefunden. Die Transaktion wurde trotzdem nicht übernommen.' };
      return;
    }
    const spentKey = keys.find((k) => !utxos.has(k)) ?? keys[0]!;
    const [spentTxid, spentVout] = spentKey.split(':');
    doubleSpend = {
      attempt,
      verdict: `Abgelehnt: Output ${short(spentTxid!)}:${spentVout} wurde in Transaktion ${short(latest.id)} schon ausgegeben (nicht mehr in der UTXO-Menge).`,
    };
  }

  function send(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    doubleSpend = null;
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
    const { tx, msg } = signTx(
      sender,
      chosen.map(([key]) => key),
      outputs,
    );
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
    doubleSpend = null;
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
      <button type="button" onclick={spendAgain} disabled={!canDoubleSpend}>Denselben Output noch einmal ausgeben</button>
      <button type="button" onclick={reset}>Zurücksetzen</button>
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if doubleSpend}
      <div class="rejected" role="status">
        <p class="small">{doubleSpend.attempt}</p>
        <p class="verdict">{doubleSpend.verdict}</p>
        <p class="muted small">
          Jeder Knoten prüft, ob die Inputs noch in der UTXO-Menge stehen. So kann niemand dieselben Coins zweimal
          ausgeben (doppelte Ausgabe).
        </p>
      </div>
    {/if}
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
            <div class="io opened">
              <span class="icon key" aria-hidden="true">{@html KEY}</span>
              <strong>Kiste von {ownerOf(latest.prevOuts[i]!)}</strong>
              <span class="amount">{btc(latest.prevOuts[i]!.value)}</span>
              <span class="hash muted" title={outpointKey(input.txid, input.vout)}>aus {short(input.txid)}:{input.vout}</span>
              <span class="muted small">geöffnet mit {latest.from}s Signatur</span>
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
          <div class="io locked" class:change={latest.from && i === 1}>
            <span class="icon lock" aria-hidden="true">{@html LOCK}</span>
            <strong>Neue Kiste für {ownerOf(out)}</strong>
            <span class="amount">{btc(out.value)}</span>
            <span class="muted">Output {i}{#if latest.from && i === 1}, Wechselgeld an den Absender{/if}</span>
            <span class="muted small">Schloss: nur {ownerOf(out)}s Schlüssel passt</span>
          </div>
        {/each}
      </div>
    </div>
    {#if bar}
      <div class="bar" aria-label="Betragsbalken: Inputs oben, Outputs und Gebühr unten">
        <div class="bar-row">
          <span class="bar-lbl">Inputs</span>
          <div class="bar-track">
            {#each bar.ins as seg, i (i)}
              <div class="seg {seg.kind}" style="width: {seg.width.toFixed(2)}%" title="{seg.label}: {btc(seg.value)}">
                <span>{seg.label} {btc(seg.value)}</span>
              </div>
            {/each}
          </div>
        </div>
        <div class="bar-row">
          <span class="bar-lbl">Outputs + Gebühr</span>
          <div class="bar-track">
            {#each bar.outs as seg, i (i)}
              <div class="seg {seg.kind}" class:stretched={seg.stretched} style="width: {seg.width.toFixed(2)}%" title="{seg.label}: {btc(seg.value)}">
                <span>{seg.label} {btc(seg.value)}</span>
              </div>
            {/each}
          </div>
        </div>
        <p class="legend small">
          <span><i class="sw in"></i>Input (alte Kiste)</span>
          <span><i class="sw out"></i>Output an den Empfänger</span>
          <span><i class="sw change"></i>Wechselgeld</span>
          <span><i class="sw fee"></i>Gebühr an den Miner</span>
        </p>
        <p class="muted small bar-note">
          Beide Reihen sind gleich lang: Was oben hineingeht, kommt unten vollständig wieder heraus.{#if bar.outs.some((s) => s.stretched)}
          Sehr schmale Teile sind hier zum Erkennen verbreitert.{/if}
        </p>
      </div>
    {/if}
    <dl class="meta">
      <dt>TxID</dt>
      <dd class="hash">{latest.id}</dd>
      <dt>Gebühr</dt>
      <dd>{btc(latest.fee)} <span class="muted">(Inputs minus Outputs, geht an den Miner)</span></dd>
    </dl>
  </section>

  <section class="utxos">
    <h3>Unverbrauchte Outputs (UTXOs)</h3>
    <p class="muted small">Jede Kiste ist ein UTXO: ein Output, der noch nicht ausgegeben wurde. Das Guthaben einer Person ist die Summe ihrer Kisten.</p>
    <div class="people">
      {#each byPerson as p (p.name)}
        <div class="person">
          <div class="head"><strong>{p.name}</strong><span class="amount">{btc(p.total)}</span></div>
          {#if p.rows.length === 0}
            <p class="muted small">keine Kisten</p>
          {:else}
            <ul class="kisten">
              {#each p.rows as r (r.key)}
                <li class="kiste" title={r.key}>
                  <span class="icon lock" aria-hidden="true">{@html LOCK}</span>
                  <span class="amount">{btc(r.value)}</span>
                  <span class="hash muted">{short(r.key.split(':')[0]!)}:{r.key.split(':')[1]}</span>
                </li>
              {/each}
            </ul>
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
  .rejected { margin: 0.8rem 0 0; padding: 0.6rem 0.8rem; border: 1px solid var(--danger); border-left-width: 4px; border-radius: var(--radius); background: var(--bg-elevated); }
  .rejected p { margin: 0 0 0.3rem; }
  .rejected p:last-child { margin: 0; }
  .rejected .verdict { color: var(--danger); font-weight: 600; overflow-wrap: anywhere; }
  .tx { background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; }
  .caption { margin: 0 0 0.9rem; color: var(--fg-muted); font-size: 0.95rem; }
  .flow { display: grid; grid-template-columns: 1fr auto 1fr; gap: 0.8rem; align-items: start; }
  .arrow { align-self: center; }
  .side { display: grid; gap: 0.5rem; align-content: start; min-width: 0; }
  .io { display: grid; gap: 0.1rem; padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); min-width: 0; }
  .io.coinbase { color: var(--fg-muted); font-style: italic; }
  .io.opened { border-style: dashed; }
  .io.locked { border-color: var(--fg-muted); }
  .io.change { background: var(--bg-muted); }
  .icon { display: inline-flex; width: 18px; height: 18px; margin-bottom: 0.15rem; }
  .icon.lock { color: var(--fg); }
  .icon.key { color: var(--accent-strong); }
  .bar { display: grid; gap: 0.35rem; margin-top: 1rem; padding-top: 0.9rem; border-top: 1px solid var(--border); }
  .bar-row { display: grid; grid-template-columns: 4.2rem 1fr; gap: 0.5rem; align-items: center; }
  .bar-lbl { font-size: 0.85rem; color: var(--fg-muted); }
  .bar-track { display: flex; width: 100%; height: 1.9rem; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-muted); }
  .seg { display: flex; align-items: center; padding: 0 0.4rem; font-size: 0.8rem; white-space: nowrap; overflow: hidden; min-width: 0; border-right: 2px solid var(--bg-elevated); }
  .seg:last-child { border-right: 0; }
  .seg span { overflow: hidden; text-overflow: ellipsis; }
  .seg.in { background: color-mix(in srgb, var(--info) 28%, var(--bg-elevated)); }
  .seg.out { background: color-mix(in srgb, var(--ok) 30%, var(--bg-elevated)); }
  .seg.change { background: color-mix(in srgb, var(--info) 16%, var(--bg-elevated)); }
  .seg.fee { background: var(--accent); color: var(--on-accent); font-weight: 600; padding: 0 0.2rem; justify-content: center; }
  .seg.fee span { font-size: 0.72rem; }
  .bar-note { margin: 0; }
  .legend { margin: 0.2rem 0 0; display: flex; flex-wrap: wrap; gap: 0.2rem 1rem; color: var(--fg-muted); }
  .legend span { display: inline-flex; align-items: center; gap: 0.35rem; }
  .sw { display: inline-block; width: 0.9rem; height: 0.9rem; border-radius: var(--radius-sm); }
  .sw.in { background: color-mix(in srgb, var(--info) 28%, var(--bg-elevated)); }
  .sw.out { background: color-mix(in srgb, var(--ok) 30%, var(--bg-elevated)); }
  .sw.change { background: color-mix(in srgb, var(--info) 16%, var(--bg-elevated)); border: 1px solid var(--border); }
  .sw.fee { background: var(--accent); }
  .kisten { list-style: none; margin: 0.4rem 0 0; padding: 0; display: grid; gap: 0.4rem; }
  .kiste { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 0.5rem; align-items: center; padding: 0.4rem 0.6rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-elevated); }
  .kiste .icon { grid-row: span 2; margin: 0; }
  .kiste .hash { font-size: 0.78rem; }
  .arrow svg { display: block; fill: none; stroke: var(--accent); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .amount { font-variant-numeric: tabular-nums; font-weight: 600; }
  .muted { color: var(--fg-muted); }
  .small { font-size: 0.88rem; }
  .meta { display: grid; grid-template-columns: auto 1fr; gap: 0.3rem 0.8rem; margin: 1rem 0 0; }
  .meta dt { color: var(--fg-muted); font-size: 0.9rem; }
  .meta dd { margin: 0; min-width: 0; }
  .people { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); }
  .person .head { display: flex; justify-content: space-between; gap: 0.5rem; border-bottom: 2px solid var(--fg); padding-bottom: 0.3rem; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .history ol { margin: 0.5rem 0 0; padding-left: 1.4rem; }
  .history li { margin-bottom: 0.2rem; }
  summary { cursor: pointer; color: var(--fg-muted); }
  @media (max-width: 560px) {
    .flow { grid-template-columns: 1fr; }
    .arrow { justify-self: center; transform: rotate(90deg); }
  }
</style>
