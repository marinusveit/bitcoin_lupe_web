<script lang="ts">
  import {
    execute,
    hash160Hex,
    hexToBytes,
    p2pkhScriptPubKey,
    p2pkhScriptSig,
    p2pkScriptPubKey,
    p2pkScriptSig,
    parseScript,
    publicKey,
    sha256Hex,
    signMessage,
    type ScriptResult,
  } from '../lib';

  type Mode = 'p2pkh' | 'p2pk' | 'frei';

  // Feste Beispielwerte: Alice besitzt den Output, Mallory ist ein fremder Schlüssel.
  const MSG = sha256Hex('Beispiel-Transaktion: Alice zahlt Bob 1 BTC');
  const ALICE = 'a1'.repeat(32);
  const MALLORY = 'd4'.repeat(32);
  const alicePub = publicKey(ALICE);
  const malloryPub = publicKey(MALLORY);
  const aliceSig = signMessage(ALICE, MSG);
  const mallorySig = signMessage(MALLORY, MSG);

  const labels = new Map<string, string>([
    [alicePub, 'Public Key (Alice)'],
    [malloryPub, 'Public Key (fremd)'],
    [aliceSig, 'Signatur (Alice)'],
    [mallorySig, 'Signatur (fremd)'],
    [hash160Hex(hexToBytes(alicePub)), 'HASH160 (Alice)'],
    [hash160Hex(hexToBytes(malloryPub)), 'HASH160 (fremd)'],
    [MSG, 'Nachrichten-Hash'],
  ]);

  let mode: Mode = $state('p2pkh');
  let tamper = $state(false);
  let wrongKey = $state(false);
  let freeSig = $state('OP_2 OP_3');
  let freePub = $state('OP_ADD OP_5 OP_EQUAL');
  let pos = $state(0);

  function tampered(sig: string): string {
    // Letztes Hex-Zeichen ändern: aus der Signatur wird eine andere Zahl.
    const last = sig.at(-1)!;
    return sig.slice(0, -1) + (last === '0' ? '1' : '0');
  }

  const scripts = $derived.by(() => {
    if (mode === 'frei') return { sig: parseScript(freeSig), pub: parseScript(freePub) };
    let sig = wrongKey ? mallorySig : aliceSig;
    if (tamper) sig = tampered(sig);
    if (mode === 'p2pk') return { sig: p2pkScriptSig(sig), pub: p2pkScriptPubKey(alicePub) };
    return { sig: p2pkhScriptSig(sig, wrongKey ? malloryPub : alicePub), pub: p2pkhScriptPubKey(alicePub) };
  });

  const result: ScriptResult = $derived.by(() => {
    try {
      return execute(scripts.sig, scripts.pub, { messageHash: MSG });
    } catch (e) {
      return { ok: false, steps: [], error: e instanceof Error ? e.message : String(e) };
    }
  });

  const tokens = $derived([
    ...scripts.sig.map((t) => ({ t, phase: 'scriptSig' as const })),
    ...scripts.pub.map((t) => ({ t, phase: 'scriptPubKey' as const })),
  ]);

  // Bei jeder Änderung des Skripts wieder am Anfang beginnen.
  $effect(() => {
    void scripts;
    pos = 0;
  });

  // Auf die Schrittzahl begrenzen, falls sich das Skript vor dem Zurücksetzen von `pos` ändert.
  const at = $derived(Math.min(pos, result.steps.length));
  const done = $derived(at >= result.steps.length);
  const stack = $derived(at === 0 ? [] : result.steps[at - 1]!.stackAfter);
  // Ohne Schritte (beide Felder leer oder unlesbares Skript) gibt es nichts zu klicken: Urteil sofort zeigen.
  const noSteps = $derived(result.steps.length === 0);
  const note = $derived(
    noSteps
      ? 'Das Skript enthält keinen Befehl, der ausgeführt werden kann.'
      : at === 0
        ? 'Noch nichts ausgeführt. Der Stapel ist leer. Drücke „Schritt“.'
        : result.steps[at - 1]!.note,
  );

  function display(value: string): { text: string; label?: string } {
    if (value === '') return { text: '(leer)', label: '0 / falsch' };
    const label = labels.get(value.toLowerCase());
    if (value === '01') return { text: '01', label: '1 / wahr' };
    if (value.length > 24) return { text: `${value.slice(0, 10)}…${value.slice(-6)}`, label };
    return { text: value, label };
  }

  function reset() {
    mode = 'p2pkh';
    tamper = false;
    wrongKey = false;
    freeSig = 'OP_2 OP_3';
    freePub = 'OP_ADD OP_5 OP_EQUAL';
    pos = 0;
  }
</script>

<div class="demo">
  <div class="controls">
    <fieldset class="modes">
      <legend>Skript-Art</legend>
      <label><input type="radio" name="skript-art" bind:group={mode} value="p2pkh" /> P2PKH (an Adresse)</label>
      <label><input type="radio" name="skript-art" bind:group={mode} value="p2pk" /> P2PK (an Public Key)</label>
      <label><input type="radio" name="skript-art" bind:group={mode} value="frei" /> Eigenes Skript</label>
    </fieldset>
    {#if mode === 'frei'}
      <div class="free">
        <label>scriptSig (Entsperr-Skript)<textarea rows="2" bind:value={freeSig}></textarea></label>
        <label>scriptPubKey (Sperr-Skript)<textarea rows="2" bind:value={freePub}></textarea></label>
        <p class="muted small">Tokens durch Leerzeichen trennen. Erlaubt sind z. B. OP_1 bis OP_16, OP_ADD, OP_SUB, OP_DUP, OP_EQUAL, OP_SHA256 und Hex-Daten.</p>
      </div>
    {:else}
      <fieldset class="toggles">
        <legend>Fehler einbauen</legend>
        <label><input type="checkbox" bind:checked={tamper} /> Signatur verfälschen</label>
        <label><input type="checkbox" bind:checked={wrongKey} /> falschen Schlüssel verwenden</label>
      </fieldset>
    {/if}
  </div>

  <div class="tokens" aria-label="Skript">
    {#each tokens as tok, i (i)}
      {@const d = display(tok.t)}
      <span
        class="chip {tok.phase}"
        class:done={i < at - 1}
        class:current={i === at - 1}
        class:failed={i === at - 1 && !result.ok && result.steps[i]?.note === result.error}
        title={tok.t}
      >
        {#if tok.t.startsWith('OP_')}{tok.t}{:else}<span class="mono">{d.label ?? d.text}</span>{/if}
      </span>
      {#if i === scripts.sig.length - 1}<span class="divider" aria-hidden="true"></span>{/if}
    {/each}
  </div>
  <p class="legend small">
    <span class="item"><span class="key scriptSig"></span>scriptSig: liefert der Empfänger beim Ausgeben</span>
    <span class="item"><span class="key scriptPubKey"></span>scriptPubKey: steht im alten Output</span>
  </p>

  <div class="actions">
    <button class="primary" onclick={() => (pos = Math.min(at + 1, result.steps.length))} disabled={done}>Schritt</button>
    <button onclick={() => (pos = result.steps.length)} disabled={done}>Alle</button>
    <button onclick={() => (pos = 0)} disabled={at === 0}>Zurück zum Anfang</button>
    <button onclick={reset}>Zurücksetzen</button>
  </div>

  <div class="machine">
    <div class="stack-col">
      <h4>Stapel</h4>
      <div class="stack">
        {#each [...stack].reverse() as item, i (i + ':' + item)}
          {@const d = display(item)}
          <div class="slot" class:top={i === 0}>
            <span class="hash">{d.text}</span>
            {#if d.label}<span class="muted small">{d.label}</span>{/if}
          </div>
        {:else}
          <div class="empty muted small">leer</div>
        {/each}
      </div>
      <p class="muted small">Oben liegt das zuletzt abgelegte Element.</p>
    </div>
    <div class="explain">
      <h4>Schritt {at} von {result.steps.length}</h4>
      <p class="note">{note}</p>
      {#if done && (at > 0 || noSteps)}
        <p class="verdict" class:ok={result.ok} class:bad={!result.ok} role="status">
          {#if result.ok}
            Gültig: Oben liegt „wahr“. Der Output darf ausgegeben werden.
          {:else}
            Ungültig: {result.error}
          {/if}
        </p>
      {/if}
    </div>
  </div>
</div>

<style>
  .demo { display: grid; gap: 1rem; }
  .controls { display: flex; flex-wrap: wrap; gap: 1rem 2rem; }
  fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 0.3rem; }
  legend { font-weight: 600; font-size: 0.9rem; margin-bottom: 0.3rem; padding: 0; }
  fieldset label { color: var(--fg); display: flex; gap: 0.45rem; align-items: center; }
  .free { display: grid; gap: 0.6rem; flex: 1 1 18rem; }
  .free label { display: grid; gap: 0.25rem; }
  .free textarea { width: 100%; font-family: var(--font-mono); font-size: 0.9rem; }
  .tokens { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; padding: 0.8rem; background: var(--bg-muted); border-radius: var(--radius); }
  .chip {
    font-family: var(--font-mono); font-size: 0.82rem; padding: 0.25rem 0.55rem; border-radius: var(--radius);
    background: var(--bg-elevated); border: 1px solid var(--border); border-bottom-width: 3px; max-width: 100%;
    overflow-wrap: anywhere; transition: opacity 0.15s;
  }
  .chip.scriptSig { border-bottom-color: var(--info); }
  .chip.scriptPubKey { border-bottom-color: var(--accent); }
  .chip.done { opacity: 0.5; }
  .chip.current { outline: 2px solid var(--fg); outline-offset: 1px; }
  .chip.failed { outline-color: var(--danger); }
  .divider { width: 1px; align-self: stretch; background: var(--border); margin: 0 0.3rem; }
  .legend { margin: -0.4rem 0 0; color: var(--fg-muted); display: flex; flex-wrap: wrap; gap: 0.3rem 0.5rem; align-items: center; }
  .legend .item { display: inline-flex; align-items: center; gap: 0.4rem; margin-right: 0.8rem; }
  .key { display: inline-block; flex: none; width: 1.2rem; height: 3px; border-radius: 2px; }
  .key.scriptSig { background: var(--info); }
  .key.scriptPubKey { background: var(--accent); }
  .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
  .machine { display: grid; grid-template-columns: minmax(12rem, 18rem) 1fr; gap: 1.5rem; }
  h4 { margin: 0 0 0.5rem; font-size: 0.9rem; color: var(--fg-muted); }
  .stack { display: flex; flex-direction: column; gap: 0.35rem; min-height: 8rem; justify-content: flex-end; padding: 0.5rem; border: 2px solid var(--border); border-top: 0; border-radius: 0 0 var(--radius) var(--radius); }
  .slot { display: grid; padding: 0.4rem 0.6rem; background: var(--bg-elevated); border: 1px solid var(--border); border-radius: var(--radius); }
  .slot.top { border-color: var(--accent); background: var(--accent-soft); }
  .empty { text-align: center; padding: 0.5rem; }
  .note { font-size: 1.05rem; margin: 0 0 0.8rem; }
  .verdict { font-weight: 600; padding: 0.6rem 0.8rem; border-radius: var(--radius); border-left: 4px solid; margin: 0; }
  .verdict.ok { border-color: var(--ok); color: var(--ok); background: var(--bg-elevated); }
  .verdict.bad { border-color: var(--danger); color: var(--danger); background: var(--bg-elevated); }
  .muted { color: var(--fg-muted); }
  .small { font-size: 0.86rem; }
  @media (max-width: 600px) {
    .machine { grid-template-columns: 1fr; }
  }
</style>
