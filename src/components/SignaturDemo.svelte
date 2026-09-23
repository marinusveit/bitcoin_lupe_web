<script lang="ts">
  import { sha256Hex } from '../lib/hash';
  import { addressP2PKH, publicKey, randomPrivateKey, signMessage, verifySignature } from '../lib/keys';

  // Feste Beispielschlüssel, damit Server- und Browser-Darstellung übereinstimmen.
  const START_PRIV = sha256Hex('Beispielschlüssel Hochschule München');
  const FOREIGN_PRIV = sha256Hex('Schlüssel von Mallory');
  const FOREIGN_PUB = publicKey(FOREIGN_PRIV);
  const START_MESSAGE = 'Alice zahlt Bob 2 BTC.';
  const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

  let priv = $state(START_PRIV);
  let message = $state(START_MESSAGE);
  let checkMessage = $state(START_MESSAGE);
  let useForeignKey = $state(false);

  const pub = $derived(publicKey(priv));
  const address = $derived(addressP2PKH(pub));
  const msgHash = $derived(sha256Hex(message));
  const signature = $derived(signMessage(priv, msgHash));

  const checkPub = $derived(useForeignKey ? FOREIGN_PUB : pub);
  const checkHash = $derived(sha256Hex(checkMessage));
  const valid = $derived(verifySignature(checkPub, checkHash, signature));

  function rollKey() {
    priv = randomPrivateKey();
  }

  function editMessage(value: string) {
    message = value;
    checkMessage = value;
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
  }
</script>

<div class="demo">
  <p class="warning" role="note">
    <strong>Wichtig:</strong> Echte private Schlüssel gibt man nie in eine Webseite ein. Wer den privaten
    Schlüssel kennt, kann über das Geld verfügen. Die Schlüssel hier sind nur zum Üben.
  </p>

  <ol class="flow">
    <li class="step">
      <h3>Schlüsselpaar erzeugen</h3>
      <dl>
        <dt>Privater Schlüssel (geheim)</dt>
        <dd class="hash secret">{priv}</dd>
        <dt>Öffentlicher Schlüssel (komprimiert)</dt>
        <dd class="hash">{pub}</dd>
        <dt>Adresse (P2PKH)</dt>
        <dd class="hash">{address}</dd>
      </dl>
      <p class="hint">
        Der öffentliche Schlüssel entsteht aus dem privaten. Umgekehrt geht es praktisch nicht. Die
        Adresse ist eine gekürzte Form des öffentlichen Schlüssels.
      </p>
      <button type="button" class="primary" onclick={rollKey}>Neuen privaten Schlüssel würfeln</button>
    </li>

    <li class="step">
      <h3>Nachricht signieren</h3>
      <label class="field">
        <span>Nachricht</span>
        <textarea rows="2" value={message} oninput={(e) => editMessage(e.currentTarget.value)}></textarea>
      </label>
      <dl>
        <dt>SHA-256 der Nachricht</dt>
        <dd class="hash">{msgHash}</dd>
        <dt>Signatur (DER-kodiert)</dt>
        <dd class="hash">{signature}</dd>
      </dl>
      <p class="hint">Signiert wird der Hash der Nachricht, und zwar mit dem privaten Schlüssel.</p>
    </li>

    <li class="step">
      <h3>Signatur prüfen</h3>
      <label class="field">
        <span>Empfangene Nachricht</span>
        <textarea rows="2" bind:value={checkMessage}></textarea>
      </label>
      <dl>
        <dt>SHA-256 der empfangenen Nachricht</dt>
        <dd class="hash" class:changed={checkHash !== msgHash}>{checkHash}</dd>
        <dt>Geprüft mit öffentlichem Schlüssel</dt>
        <dd class="hash" class:changed={useForeignKey}>
          {checkPub}{#if useForeignKey}<span class="tag"> (fremd)</span>{/if}
        </dd>
      </dl>
      <p class="verdict" class:ok={valid} aria-live="polite">
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
      <div class="row">
        <button type="button" onclick={tamper}>Nachricht manipulieren</button>
        <button type="button" aria-pressed={useForeignKey} onclick={() => (useForeignKey = !useForeignKey)}>
          {useForeignKey ? 'Eigenen Schlüssel verwenden' : 'Fremden Schlüssel verwenden'}
        </button>
      </div>
    </li>
  </ol>

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
  }
  .warning {
    margin: 0;
    border-left: 4px solid var(--danger);
    padding: 0.5rem 0.9rem;
    background: var(--bg);
    font-size: 0.93rem;
  }
  .flow {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
    gap: 1rem;
    counter-reset: step;
  }
  .step {
    counter-increment: step;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    min-width: 0;
  }
  .step h3 { margin: 0; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem; }
  .step h3::before {
    content: counter(step);
    display: inline-grid;
    place-items: center;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-size: 0.9rem;
  }
  dl { margin: 0; display: grid; gap: 0.15rem; }
  dt { color: var(--fg-muted); font-size: 0.85rem; margin-top: 0.35rem; }
  dd { margin: 0; line-height: 1.45; }
  .secret { color: var(--danger); }
  .changed { color: var(--danger); }
  .tag { font-family: var(--font-sans); font-weight: 600; }
  .field { display: grid; gap: 0.3rem; }
  .field textarea { width: 100%; resize: vertical; }
  .hint { margin: 0; color: var(--fg-muted); font-size: 0.9rem; }
  .verdict {
    margin: 0;
    font-weight: 700;
    font-size: 1.1rem;
    padding: 0.45rem 0.8rem;
    border-radius: var(--radius);
    border: 2px solid var(--danger);
    color: var(--danger);
  }
  .verdict.ok { border-color: var(--ok); color: var(--ok); }
  .row { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: auto; }
  .step > button { align-self: flex-start; margin-top: auto; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; flex-wrap: wrap; }
</style>
