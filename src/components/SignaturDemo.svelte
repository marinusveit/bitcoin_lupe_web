<script lang="ts">
  import { sha256Hex } from '../lib/hash';
  import { addressP2PKH, publicKey, randomPrivateKey, signMessage, verifySignature } from '../lib/keys';

  // Feste Beispielschlüssel, damit Server- und Browser-Darstellung übereinstimmen.
  const START_PRIV = sha256Hex('Beispielschlüssel Hochschule München');
  const FOREIGN_PRIV = sha256Hex('Schlüssel von Mallory');
  const FOREIGN_PUB = publicKey(FOREIGN_PRIV);
  const START_MESSAGE = 'Alice zahlt Bob 2 BTC.';
  const START_SIGNATURE = signMessage(START_PRIV, sha256Hex(START_MESSAGE), 'compact');
  const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const MEMO_MAX = 28;

  let priv = $state(START_PRIV);
  let message = $state(START_MESSAGE);
  let checkMessage = $state(START_MESSAGE);
  let useForeignKey = $state(false);
  let memo = $state({ message: START_MESSAGE, signature: START_SIGNATURE });

  const pub = $derived(publicKey(priv));
  const address = $derived(addressP2PKH(pub));
  const msgHash = $derived(sha256Hex(message));
  // Kompakt: 64 Byte, die ersten 32 sind r, die letzten 32 sind s.
  const signature = $derived(signMessage(priv, msgHash, 'compact'));
  const sigR = $derived(signature.slice(0, 64));
  const sigS = $derived(signature.slice(64));
  const signatureDer = $derived(signMessage(priv, msgHash, 'der'));

  const checkPub = $derived(useForeignKey ? FOREIGN_PUB : pub);
  const checkHash = $derived(sha256Hex(checkMessage));
  const valid = $derived(verifySignature(checkPub, checkHash, signature));

  const memoSame = $derived(memo.signature === signature);
  const memoLabel = $derived(
    Array.from(memo.message).length > MEMO_MAX
      ? Array.from(memo.message).slice(0, MEMO_MAX).join('') + '…'
      : memo.message,
  );

  function rollKey() {
    priv = randomPrivateKey();
  }

  function editMessage(value: string) {
    message = value;
    checkMessage = value;
  }

  function remember() {
    memo = { message, signature };
  }

  function tamper() {
    const chars = Array.from(checkMessage);
    if (chars.length === 0) {
      checkMessage = 'x';
      return;
    }
    const pos = Math.floor(Math.random() * chars.length);
    let replacement = chars[pos]!;
    while (replacement === chars[pos]) replacement = CHARS[Math.floor(Math.random() * CHARS.length)]!;
    chars[pos] = replacement;
    checkMessage = chars.join('');
  }

  function reset() {
    priv = START_PRIV;
    message = START_MESSAGE;
    checkMessage = START_MESSAGE;
    useForeignKey = false;
    memo = { message: START_MESSAGE, signature: START_SIGNATURE };
  }
</script>

<div class="demo">
  <p class="warning" role="note">
    <strong>Wichtig:</strong> Echte private Schlüssel gibt man nie in eine Webseite ein. Wer den privaten
    Schlüssel kennt, kann über das Geld verfügen. Die Schlüssel hier sind nur zum Üben.
  </p>

  <div class="layout">
    <section class="keys" aria-labelledby="sig-keys-title">
      <h3 id="sig-keys-title">Schlüsselpaar von Alice</h3>
      <dl class="key-grid">
        <div class="key secret-box">
          <dt>Privater Schlüssel <span class="badge">geheim, bleibt bei Alice</span></dt>
          <dd class="hash secret">{priv}</dd>
        </div>
        <div class="key">
          <dt>Öffentlicher Schlüssel</dt>
          <dd class="hash">{pub}</dd>
        </div>
        <div class="key">
          <dt>Adresse</dt>
          <dd class="hash">{address}</dd>
        </div>
      </dl>
      <p class="hint">
        Der öffentliche Schlüssel wird aus dem privaten berechnet. Umgekehrt geht es praktisch nicht. Die
        Adresse ist eine gekürzte Form des öffentlichen Schlüssels.
      </p>
      <button type="button" class="primary" onclick={rollKey}>Neuen privaten Schlüssel würfeln</button>
    </section>

    <section class="side alice" aria-labelledby="sig-alice-title">
      <h3 id="sig-alice-title">Alice signiert</h3>
      <label class="field">
        <span>Nachricht</span>
        <textarea rows="2" value={message} oninput={(e) => editMessage(e.currentTarget.value)}></textarea>
      </label>
      <dl>
        <dt>SHA-256 der Nachricht</dt>
        <dd class="hash">{msgHash}</dd>
      </dl>
      <p class="hint">
        SHA-256 bildet aus der Nachricht einen Fingerabdruck fester Länge, den Hash. Signiert wird der Hash,
        nicht die Nachricht, und zwar mit dem privaten Schlüssel.
      </p>
      <div class="signature">
        <p class="sig-title">Signatur</p>
        <p class="hint">Die Signatur besteht aus zwei großen Zahlen, r und s.</p>
        <dl class="rs">
          <dt>r</dt>
          <dd class="hash">{sigR}</dd>
          <dt>s</dt>
          <dd class="hash">{sigS}</dd>
        </dl>
        <p class="memo" class:same={memoSame} aria-live="polite">
          Gemerkt für „{memoLabel}“: <strong>{memoSame ? 'gleiche Signatur' : 'andere Signatur'}</strong>
        </p>
        <button type="button" onclick={remember}>Signatur merken</button>
      </div>
      <details>
        <summary>So steht sie in der Transaktion (DER)</summary>
        <p class="hint">DER ist ein festes Format, in dem r und s mit Längenangaben hintereinander stehen.</p>
        <p class="hash der">{signatureDer}</p>
      </details>
    </section>

    <div class="transfer" role="group" aria-labelledby="sig-transfer-title">
      <p class="transfer-title" id="sig-transfer-title">Das geht über das Netz zu Bob</p>
      <span class="arrow" aria-hidden="true">→</span>
      <ul class="chips">
        <li class="chip">Nachricht</li>
        <li class="chip">Signatur (r, s)</li>
        <li class="chip">öffentlicher Schlüssel</li>
      </ul>
      <p class="chip stays"><s>privater Schlüssel</s> <span>bleibt bei Alice</span></p>
    </div>

    <section class="side bob" aria-labelledby="sig-bob-title">
      <h3 id="sig-bob-title">Bob prüft</h3>
      <label class="field">
        <span>Empfangene Nachricht</span>
        <textarea rows="2" bind:value={checkMessage}></textarea>
      </label>
      <dl>
        <dt>SHA-256 der empfangenen Nachricht</dt>
        <dd class="hash" class:changed={checkHash !== msgHash}>{checkHash}</dd>
        <dt>Geprüft mit öffentlichem Schlüssel</dt>
        <dd class="hash" class:changed={useForeignKey}>
          {checkPub}{#if useForeignKey}<span class="tag"> (fremd, von Mallory)</span>{/if}
        </dd>
      </dl>
      <p class="hint">Bob rechnet mit Hash, Signatur und öffentlichem Schlüssel nach. Den privaten Schlüssel braucht er dafür nicht.</p>
      <div aria-live="polite">
        <p class="verdict" class:ok={valid}>
          {valid ? 'Signatur gültig' : 'Signatur ungültig'}
        </p>
        <p class="hint">
          {#if valid}
            Nachricht und Schlüssel passen zur Signatur. Nur wer den privaten Schlüssel hat, konnte sie erzeugen.
          {:else if useForeignKey}
            Die Signatur stammt nicht vom Besitzer dieses öffentlichen Schlüssels.
          {:else}
            Die Nachricht wurde nach dem Signieren verändert, deshalb passt die Signatur nicht mehr.
          {/if}
        </p>
      </div>
      <div class="row">
        <button type="button" onclick={tamper}>Nachricht manipulieren</button>
        <button type="button" aria-pressed={useForeignKey} onclick={() => (useForeignKey = !useForeignKey)}>
          {useForeignKey ? 'Eigenen Schlüssel verwenden' : 'Fremden Schlüssel verwenden'}
        </button>
      </div>
    </section>
  </div>

  <div class="actions">
    <button type="button" onclick={reset}>Zurücksetzen</button>
  </div>
</div>

<style>
  .demo {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.2rem;
    display: grid;
    gap: 1rem;
    container-type: inline-size;
    min-width: 0;
  }
  .warning {
    margin: 0;
    border-left: 4px solid var(--danger);
    padding: 0.5rem 0.9rem;
    background: var(--bg);
    font-size: 0.93rem;
  }
  h3 { margin: 0; font-size: 1.05rem; }

  /* Schmal: alles untereinander, Übergabe als Streifen mit Pfeil nach unten. */
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'keys' 'alice' 'transfer' 'bob';
    gap: 0.9rem;
  }
  .keys { grid-area: keys; }
  .alice { grid-area: alice; }
  .transfer { grid-area: transfer; }
  .bob { grid-area: bob; }

  .keys, .side {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    min-width: 0;
  }
  .keys { background: var(--bg-muted); padding: 0.8rem 1rem; }
  .keys > button { align-self: flex-start; }
  .key-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.6rem; }
  .key { min-width: 0; }
  .secret-box {
    border-left: 3px solid var(--danger);
    padding-left: 0.6rem;
  }
  .badge {
    display: inline-block;
    margin-left: 0.3rem;
    padding: 0 0.4rem;
    border: 1px solid var(--danger);
    border-radius: var(--radius-sm);
    color: var(--danger);
    font-size: 0.78rem;
    font-weight: 600;
  }

  dl { margin: 0; display: grid; gap: 0.15rem; }
  dt { color: var(--fg-muted); font-size: 0.85rem; margin-top: 0.35rem; }
  .key dt { margin-top: 0; }
  dd { margin: 0; line-height: 1.45; min-width: 0; }
  .secret { color: var(--danger); }
  .changed { color: var(--danger); }
  .tag { font-family: var(--font-sans); font-weight: 600; }
  .field { display: grid; gap: 0.3rem; }
  .field textarea { width: 100%; resize: vertical; }
  .hint { margin: 0; color: var(--fg-muted); font-size: 0.9rem; }

  .signature {
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--accent-soft);
    padding: 0.7rem 0.8rem;
    display: grid;
    gap: 0.45rem;
  }
  .signature > button { justify-self: start; }
  .sig-title { margin: 0; font-weight: 700; color: var(--accent-strong); }
  .rs {
    grid-template-columns: 1.4rem minmax(0, 1fr);
    column-gap: 0.4rem;
    row-gap: 0.3rem;
    align-items: baseline;
  }
  .rs dt {
    margin: 0;
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 1rem;
    color: var(--accent-strong);
  }
  .memo {
    margin: 0;
    font-size: 0.9rem;
    padding: 0.3rem 0.55rem;
    border-radius: var(--radius-sm);
    border-left: 3px solid var(--warn);
    background: var(--bg);
    color: var(--fg);
  }
  .memo strong { color: var(--warn); }
  .memo.same { border-left-color: var(--ok); }
  .memo.same strong { color: var(--ok); }

  details { font-size: 0.9rem; }
  summary { cursor: pointer; color: var(--fg-muted); }
  details[open] { display: grid; gap: 0.4rem; }
  .der { margin: 0; }

  .transfer {
    display: grid;
    justify-items: center;
    gap: 0.45rem;
    padding: 0.7rem 0.5rem;
    border: 1px dashed var(--border);
    border-radius: var(--radius);
    text-align: center;
  }
  .transfer-title { margin: 0; font-weight: 700; font-size: 0.95rem; }
  .arrow {
    font-size: 1.8rem;
    line-height: 1;
    color: var(--accent-strong);
    transform: rotate(90deg);
  }
  .chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.35rem;
  }
  .chip {
    margin: 0;
    padding: 0.2rem 0.55rem;
    border-radius: var(--radius-sm);
    border: 1px solid var(--accent);
    background: var(--accent-soft);
    color: var(--fg);
    font-size: 0.85rem;
  }
  .chip.stays {
    border-color: var(--danger);
    background: var(--bg);
    display: grid;
    gap: 0.05rem;
  }
  .chip.stays s { color: var(--danger); }
  .chip.stays span { color: var(--fg-muted); font-size: 0.78rem; }

  .verdict {
    margin: 0 0 0.35rem;
    font-weight: 700;
    font-size: 1.25rem;
    padding: 0.5rem 0.8rem;
    border-radius: var(--radius);
    border: 2px solid var(--danger);
    color: var(--danger);
  }
  .verdict.ok { border-color: var(--ok); color: var(--ok); }
  .row { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap; }

  /* Breit: Schlüsselstreifen oben, Alice links, Übergabe in der Mitte, Bob rechts. */
  @container (min-width: 700px) {
    .layout {
      grid-template-columns: minmax(0, 1fr) 8.5rem minmax(0, 1fr);
      grid-template-areas:
        'keys keys keys'
        'alice transfer bob';
      column-gap: 0.6rem;
    }
    .key-grid { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(0, 0.8fr); gap: 1rem; }
    .transfer {
      align-self: center;
      border: none;
      padding: 0;
    }
    .arrow { transform: none; font-size: 2.2rem; }
    .chips { flex-direction: column; align-items: stretch; }
  }
</style>
