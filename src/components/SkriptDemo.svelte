<script lang="ts">
  import { tick } from 'svelte';
  import { fly } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import {
    execute,
    hash160Hex,
    hexToBytes,
    p2pkhScriptPubKey,
    p2pkhScriptSig,
    p2pkScriptPubKey,
    p2pkScriptSig,
    formatScript,
    parseScript,
    publicKey,
    sha256Hex,
    signMessage,
    type ScriptResult,
  } from '../lib';
  import { motionAllowed } from '../lib/ui';

  type Mode = 'p2pkh' | 'p2pk' | 'frei';
  /** Wer gibt aus: Alice, Mallory mit eigenem Schlüsselpaar, Mallory mit Alices (öffentlichem) Public Key. */
  type Spender = 'alice' | 'mallory' | 'mallory-alice-pub';

  // Feste Beispielwerte: Alice besitzt den Output, Mallory ist ein fremder Schlüssel.
  const TX = 'Beispiel-Transaktion: Alice zahlt Bob 1 BTC';
  const TX_CHANGED = 'Beispiel-Transaktion: Alice zahlt Bob 2 BTC';
  const MSG = sha256Hex(TX);
  const MSG_CHANGED = sha256Hex(TX_CHANGED);
  const ALICE = 'a1'.repeat(32);
  const MALLORY = 'd4'.repeat(32);
  const alicePub = publicKey(ALICE);
  const malloryPub = publicKey(MALLORY);
  const aliceSig = signMessage(ALICE, MSG);
  const mallorySig = signMessage(MALLORY, MSG);

  const labels = new Map<string, string>([
    [alicePub, 'Public Key (Alice)'],
    [malloryPub, 'Public Key (Mallory)'],
    [aliceSig, 'Signatur (Alice)'],
    [mallorySig, 'Signatur (Mallory)'],
    [tampered(aliceSig), 'Signatur (verfälscht)'],
    [tampered(mallorySig), 'Signatur (verfälscht)'],
    [hash160Hex(hexToBytes(alicePub)), 'HASH160 (Alice)'],
    [hash160Hex(hexToBytes(malloryPub)), 'HASH160 (Mallory)'],
    [MSG, 'Nachrichten-Hash'],
  ]);

  const DUR = motionAllowed() ? 260 : 0;

  let mode: Mode = $state('p2pkh');
  let tamper = $state(false);
  let spender = $state<Spender>('alice');
  let changeTx = $state(false);
  let freeSig = $state('OP_2 OP_3');
  let freePub = $state('OP_ADD OP_5 OP_EQUAL');

  function tampered(sig: string): string {
    // Letztes Hex-Zeichen ändern: aus der Signatur wird eine andere Zahl.
    const last = sig.at(-1)!;
    return sig.slice(0, -1) + (last === '0' ? '1' : '0');
  }

  /** P2PKH mit den aktuellen Einstellungen (wer gibt aus, verfälschte Signatur). */
  function p2pkhScripts(): { sig: string[]; pub: string[] } {
    let sig = spender === 'alice' ? aliceSig : mallorySig;
    if (tamper) sig = tampered(sig);
    return { sig: p2pkhScriptSig(sig, spender === 'mallory' ? malloryPub : alicePub), pub: p2pkhScriptPubKey(alicePub) };
  }

  const scripts = $derived.by(() => {
    if (mode === 'frei') return { sig: parseScript(freeSig), pub: parseScript(freePub) };
    if (mode === 'p2pk') {
      const sig = spender === 'alice' ? aliceSig : mallorySig;
      return { sig: p2pkScriptSig(tamper ? tampered(sig) : sig), pub: p2pkScriptPubKey(alicePub) };
    }
    return p2pkhScripts();
  });

  /** Füllt die Felder von „Eigenes Skript“ mit dem aktuellen P2PKH als Hex, zum Abwandeln. */
  function adoptP2pkh() {
    const { sig, pub } = p2pkhScripts();
    freeSig = formatScript(sig);
    freePub = formatScript(pub);
    mode = 'frei';
  }

  // Signiert ist immer die ursprüngliche Transaktion; geändert wird nur, was OP_CHECKSIG prüft.
  const messageHash = $derived(mode !== 'frei' && changeTx ? MSG_CHANGED : MSG);

  const result: ScriptResult = $derived.by(() => {
    try {
      return execute(scripts.sig, scripts.pub, { messageHash });
    } catch (e) {
      return { ok: false, steps: [], error: e instanceof Error ? e.message : String(e) };
    }
  });

  const tokens = $derived([
    ...scripts.sig.map((t) => ({ t, phase: 'scriptSig' as const })),
    ...scripts.pub.map((t) => ({ t, phase: 'scriptPubKey' as const })),
  ]);

  // Aktueller Schritt; beginnt bei jeder Änderung des Skripts wieder am Anfang, die Knöpfe überschreiben ihn.
  let pos = $derived.by(() => {
    void scripts;
    void messageHash;
    return 0;
  });
  const at = $derived(pos);
  const done = $derived(at >= result.steps.length);
  const stack = $derived(at === 0 ? [] : result.steps[at - 1]!.stackAfter);
  // Ohne Schritte (beide Felder leer oder unlesbares Skript) gibt es nichts zu klicken: Urteil sofort zeigen.
  const noSteps = $derived(result.steps.length === 0);
  const note = $derived(
    noSteps
      ? 'Das Skript enthält keinen Befehl, der ausgeführt werden kann.'
      : at === 0
        ? 'Noch nichts ausgeführt. Der Stapel ist leer. Drücke „Schritt“.'
        : handover(at)
          ? `scriptSig ist fertig. Sein Stapel wird an das Sperr-Skript (scriptPubKey) übergeben. ${stepNote(at)}`
          : stepNote(at),
  );
  // Nach Konsensregel reicht „wahr“ oben; mehr als ein Restelement verstößt nur gegen die Weiterleitungsregel.
  const leftover = $derived(result.ok && (result.steps.at(-1)?.stackAfter.length ?? 0) > 1);

  /** Notiz zu Schritt `n`; beim Abbruch an OP_EQUALVERIFY mit beiden verglichenen Werten, die danach vom Stapel sind. */
  function stepNote(n: number): string {
    const step = result.steps[n - 1]!;
    if (step.token === 'OP_EQUALVERIFY' && !result.ok && n === result.steps.length && step.note === result.error) {
      const before = n >= 2 ? result.steps[n - 2]!.stackAfter : [];
      if (before.length >= 2) return `${name(before.at(-2)!)} ist nicht gleich ${name(before.at(-1)!)}: Abbruch.`;
    }
    return step.note;
  }

  function name(value: string): string {
    const d = display(value);
    return d.label ?? d.text;
  }

  /** Ist Schritt `n` der erste des scriptPubKey nach einem scriptSig? Dort startet das zweite Programm. */
  function handover(n: number): boolean {
    return n >= 2 && result.steps[n - 1]!.phase === 'scriptPubKey' && result.steps[n - 2]!.phase === 'scriptSig';
  }

  function display(value: string): { text: string; label?: string } {
    if (value === '') return { text: '0', label: 'falsch (leere Byte-Folge)' };
    const label = labels.get(value.toLowerCase());
    if (value === '01') return { text: '01', label: '1 / wahr' };
    if (value.length > 24) return { text: `${value.slice(0, 10)}…${value.slice(-6)}`, label };
    return { text: value, label };
  }

  let backButton: HTMLButtonElement | undefined = $state();

  /** Vorwärts auf Schritt `n`. Am Ende wird „Schritt“ deaktiviert: Fokus auf „Schritt zurück“, damit die Tastatur ihn nicht verliert. */
  async function goTo(n: number) {
    pos = Math.min(n, result.steps.length);
    if (pos >= result.steps.length && pos > 0) {
      await tick();
      backButton?.focus();
    }
  }

  function reset() {
    mode = 'p2pkh';
    tamper = false;
    spender = 'alice';
    changeTx = false;
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
        <p class="muted small">Tokens durch Leerzeichen trennen; zwei Ziffern wie 12 gelten als ein Hex-Byte. Erlaubt sind OP_0 bis OP_16, OP_ADD, OP_SUB, OP_DUP, OP_EQUAL, OP_EQUALVERIFY, OP_VERIFY, OP_SHA256, OP_HASH160, OP_CHECKSIG, OP_RETURN und Hex-Daten.</p>
        <button type="button" class="adopt" onclick={adoptP2pkh}>Aktuelles P2PKH als eigenes Skript übernehmen</button>
      </div>
    {:else}
      <fieldset class="spender">
        <legend>Wer gibt aus?</legend>
        <label><input type="radio" name="skript-wer" bind:group={spender} value="alice" /> Alice</label>
        <label><input type="radio" name="skript-wer" bind:group={spender} value="mallory" /> Mallory mit eigenem Schlüssel</label>
        <label><input type="radio" name="skript-wer" bind:group={spender} value="mallory-alice-pub" /> Mallory mit Alices Public Key</label>
      </fieldset>
      <fieldset class="toggles">
        <legend>Fehler einbauen</legend>
        <label><input type="checkbox" bind:checked={tamper} /> Signatur verfälschen</label>
        <label><input type="checkbox" bind:checked={changeTx} /> Transaktion nachträglich ändern (Bob bekommt 2 BTC)</label>
      </fieldset>
      {#if mode === 'p2pkh'}
        <button type="button" class="adopt" onclick={adoptP2pkh}>Aktuelles P2PKH als eigenes Skript übernehmen</button>
      {/if}
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
    <span class="item"><span class="key scriptSig"></span>scriptSig: liefert, wer den Output ausgibt</span>
    <span class="item"><span class="key scriptPubKey"></span>scriptPubKey: steht im alten Output</span>
  </p>

  <div class="aktionen">
    <button type="button" class="primary" onclick={() => goTo(at + 1)} disabled={done}>Schritt</button>
    <button type="button" onclick={() => goTo(result.steps.length)} disabled={done}>Alle</button>
    <button type="button" bind:this={backButton} onclick={() => (pos = at - 1)} disabled={at === 0}>◀ Schritt zurück</button>
    <button type="button" class="reset" onclick={reset}>Zurücksetzen</button>
  </div>

  {#if mode !== 'frei'}
    <div class="checksig-info small">
      <p>OP_CHECKSIG prüft echt mit ECDSA: Passt die Signatur zu diesem Public Key und zu dieser Transaktion?</p>
      <p class="muted">
        Signiert: „{TX}“. Geprüft: „{changeTx ? TX_CHANGED : TX}“{#if changeTx}<strong class="changed"> (nachträglich geändert)</strong>{/if}.
      </p>
    </div>
  {/if}

  <div class="machine">
    <div class="stack-col">
      <h4>Stapel</h4>
      <div class="stack">
        {#each stack as item, j (j + ':' + item)}
          {@const d = display(item)}
          <div
            class="slot"
            class:top={j === stack.length - 1}
            in:fly={{ y: -28, duration: DUR }}
            out:fly={{ y: -28, duration: DUR }}
            animate:flip={{ duration: DUR }}
          >
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
      <p class="note" aria-live="polite">{note}</p>
      {#if done && (at > 0 || noSteps)}
        <p class="verdict" class:ok={result.ok} class:bad={!result.ok} role="status">
          {#if result.ok}
            Gültig: Oben liegt „wahr“. Der Output darf ausgegeben werden.
            {#if leftover}Das gilt nach Konsensregel. Weil mehr als ein Element übrig ist, würden Knoten die Transaktion aber meist nicht weiterleiten.{/if}
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
  .checksig-info p { margin: 0 0 0.2rem; }
  .checksig-info .changed { color: var(--danger); }
  .controls { display: flex; flex-wrap: wrap; gap: 1rem 2rem; }
  fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 0.3rem; }
  legend { font-weight: 600; font-size: 0.9rem; margin-bottom: 0.3rem; padding: 0; }
  fieldset label { color: var(--fg); display: flex; gap: 0.45rem; align-items: center; }
  .free { display: grid; gap: 0.6rem; flex: 1 1 18rem; }
  .free label { display: grid; gap: 0.25rem; }
  .free textarea { width: 100%; font-family: var(--font-mono); font-size: 0.9rem; }
  .adopt { align-self: end; justify-self: start; }
  .tokens { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; padding: 0.8rem; background: var(--bg-muted); border-radius: var(--radius); }
  .chip {
    font-family: var(--font-mono); font-size: 0.82rem; padding: 0.25rem 0.55rem; border-radius: var(--radius);
    background: var(--bg-elevated); border: 1px solid var(--border); border-bottom-width: 3px; max-width: 100%;
    overflow-wrap: anywhere; transition: opacity 0.15s;
  }
  .chip.scriptSig { border-bottom-color: var(--info); }
  .chip.scriptPubKey { border-bottom-color: var(--accent); }
  .chip.done { opacity: 0.5; }
  .chip { position: relative; }
  .chip.current { outline: 2px solid var(--fg); outline-offset: 1px; }
  .chip.current::before {
    content: "▼"; position: absolute; top: -1.15rem; left: 50%; transform: translateX(-50%);
    font-family: var(--font-sans); font-size: 0.7rem; color: var(--fg);
  }
  .tokens { padding-top: 1.4rem; row-gap: 1.1rem; }
  .chip.failed { outline-color: var(--danger); }
  .divider { width: 1px; align-self: stretch; background: var(--border); margin: 0 0.3rem; }
  .legend { margin: -0.4rem 0 0; color: var(--fg-muted); display: flex; flex-wrap: wrap; gap: 0.3rem 0.5rem; align-items: center; }
  .legend .item { display: inline-flex; align-items: center; gap: 0.4rem; margin-right: 0.8rem; }
  .key { display: inline-block; flex: none; width: 1.2rem; height: 3px; border-radius: 2px; }
  .key.scriptSig { background: var(--info); }
  .key.scriptPubKey { background: var(--accent); }
  .machine { display: grid; grid-template-columns: minmax(12rem, 18rem) 1fr; gap: 1.5rem; }
  h4 { margin: 0 0 0.5rem; font-size: 0.9rem; color: var(--fg-muted); }
  /* Unten das älteste, oben das zuletzt abgelegte Element: Reihenfolge per column-reverse. */
  .stack { display: flex; flex-direction: column-reverse; gap: 0.35rem; min-height: 8rem; justify-content: flex-start; padding: 0.5rem; border: 2px solid var(--border); border-top: 0; border-radius: 0 0 var(--radius) var(--radius); overflow: hidden; }
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
    /* Erklärung vor den wachsenden Stapel, damit Knopf, Notiz und oberstes Element nah beieinander stehen. */
    .explain { order: -1; }
  }
</style>
