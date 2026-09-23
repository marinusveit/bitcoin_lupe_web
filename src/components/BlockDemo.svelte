<script lang="ts">
  import { headerHash, meetsTarget, merkleRoot, nBitsToTarget } from '../lib';

  // Werte des Genesis-Blocks vom 3. Januar 2009.
  const GENESIS = {
    version: 1,
    prevHash: '0'.repeat(64),
    txids: ['4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b'],
    timestamp: 1231006505,
    nBits: '1d00ffff',
    nonce: 2083236893,
  };

  let version = $state(GENESIS.version);
  let prevHash = $state(GENESIS.prevHash);
  let txids = $state([...GENESIS.txids]);
  let timestamp = $state(GENESIS.timestamp);
  let nBitsText = $state(GENESIS.nBits);
  let nonce = $state(GENESIS.nonce);

  const isHash = (s: string) => /^[0-9a-fA-F]{64}$/.test(s.trim());
  const isUint32 = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;

  const computed = $derived.by(() => {
    const errors: string[] = [];
    if (!Number.isInteger(version)) errors.push('Die Version muss eine ganze Zahl sein.');
    if (!isHash(prevHash)) errors.push('Der vorherige Hash braucht genau 64 Hex-Zeichen.');
    txids.forEach((t, i) => {
      if (!isHash(t)) errors.push(`TxID ${i + 1} braucht genau 64 Hex-Zeichen.`);
    });
    if (!isUint32(timestamp)) errors.push('Der Zeitstempel muss eine ganze Zahl zwischen 0 und 4 294 967 295 sein.');
    if (!isUint32(nonce)) errors.push('Die Nonce muss eine ganze Zahl zwischen 0 und 4 294 967 295 sein.');
    if (!/^[0-9a-fA-F]{1,8}$/.test(nBitsText.trim())) errors.push('nBits braucht 1 bis 8 Hex-Zeichen, z. B. 1d00ffff.');
    const failed = (errors: string[]) => ({ errors, root: '', hash: '', targetHex: '', ok: false });
    if (errors.length) return failed(errors);
    const nBits = parseInt(nBitsText.trim(), 16);
    let target: bigint;
    try {
      target = nBitsToTarget(nBits);
    } catch (e) {
      return failed([e instanceof Error ? e.message : String(e)]);
    }
    // Ein Hash hat 256 Bit. Ein Target ab 2^256 passt nicht in die Anzeige und kommt in Bitcoin nicht vor.
    if (target >= 1n << 256n) {
      return failed(['Diese nBits ergeben ein Target mit mehr als 256 Bit. So ein Target gibt es in Bitcoin nicht. Wähle einen kleineren Exponenten (das erste Byte).']);
    }
    const root = merkleRoot(txids.map((t) => t.trim()));
    const hash = headerHash({ version, prevHash: prevHash.trim(), merkleRoot: root, timestamp, nBits, nonce });
    const targetHex = target.toString(16).padStart(64, '0');
    return { errors: [] as string[], root, hash, targetHex, ok: meetsTarget(hash, target) };
  });

  const zeros = (hex: string) => hex.match(/^0*/)![0].length;

  const date = $derived(
    isUint32(timestamp)
      ? new Date(timestamp * 1000).toLocaleString('de-DE', { dateStyle: 'long', timeStyle: 'medium', timeZone: 'UTC' }) + ' UTC'
      : '',
  );

  function loadGenesis() {
    version = GENESIS.version;
    prevHash = GENESIS.prevHash;
    txids = [...GENESIS.txids];
    timestamp = GENESIS.timestamp;
    nBitsText = GENESIS.nBits;
    nonce = GENESIS.nonce;
  }

  function addTx() {
    // Neue Beispiel-TxID: Ziffernfolge, damit das Feld gültig ist und sich die Wurzel ändert.
    const n = txids.length + 1;
    txids = [...txids, String(n).repeat(64)];
  }
</script>

<div class="demo">
  <div class="header-fields">
    <label class="f-version">Version
      <input type="number" bind:value={version} />
    </label>
    <label class="f-wide">Hash des vorherigen Blocks
      <input type="text" class="hash" bind:value={prevHash} spellcheck="false" />
    </label>
    <div class="f-wide txs">
      <span class="lbl">TxIDs der Transaktionen im Block (1 bis 4)</span>
      {#each txids as _, i (i)}
        <div class="txrow">
          <input type="text" class="hash" bind:value={txids[i]} aria-label="TxID {i + 1}" spellcheck="false" />
          {#if txids.length > 1}
            <button type="button" class="small-btn" onclick={() => (txids = txids.filter((__, j) => j !== i))} aria-label="TxID {i + 1} entfernen">Entfernen</button>
          {/if}
        </div>
      {/each}
      {#if txids.length < 4}
        <button type="button" class="small-btn" onclick={addTx}>TxID hinzufügen</button>
      {/if}
    </div>
    <div class="f-wide derived">
      <span class="lbl">Merkle-Wurzel (aus den TxIDs berechnet)</span>
      <span class="hash">{computed.root || '–'}</span>
    </div>
    <label>Zeitstempel
      <input type="number" bind:value={timestamp} />
      <span class="hint">Sekunden seit 1970, also {date}</span>
    </label>
    <label>nBits (Schwierigkeit, Hex)
      <input type="text" class="hash" bind:value={nBitsText} spellcheck="false" />
    </label>
    <label>Nonce
      <input type="number" bind:value={nonce} min="0" max="4294967295" />
    </label>
  </div>

  <div class="actions">
    <button class="primary" onclick={() => (nonce = (nonce + 1) % 2 ** 32)}>Nonce +1</button>
    <button onclick={loadGenesis}>Zurücksetzen</button>
  </div>

  {#if computed.errors.length}
    <ul class="errors" role="alert">
      {#each computed.errors as e (e)}<li>{e}</li>{/each}
    </ul>
  {:else}
    <div class="compare" class:ok={computed.ok} class:bad={!computed.ok}>
      <div class="row">
        <span class="lbl">Header-Hash</span>
        <span class="hash big"><span class="z">{computed.hash.slice(0, zeros(computed.hash))}</span>{computed.hash.slice(zeros(computed.hash))}</span>
      </div>
      <div class="row">
        <span class="lbl">Target aus nBits</span>
        <span class="hash big"><span class="z">{computed.targetHex.slice(0, zeros(computed.targetHex))}</span>{computed.targetHex.slice(zeros(computed.targetHex))}</span>
      </div>
      <p class="verdict" role="status">
        Hash höchstens so groß wie das Target?
        <strong>{computed.ok ? 'Ja, der Block ist gültig.' : 'Nein, dieser Block wäre ungültig.'}</strong>
      </p>
      <p class="hint">
        Der Hash hat {zeros(computed.hash)} führende Nullen, das Target {zeros(computed.targetHex)}. Beide werden als
        Zahl verglichen: Je mehr Nullen vorne, desto kleiner die Zahl.
      </p>
    </div>
  {/if}
</div>

<style>
  .demo { display: grid; gap: 1rem; }
  .header-fields { display: grid; gap: 0.9rem 1rem; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); }
  .header-fields label, .txs, .derived { display: grid; gap: 0.25rem; align-content: start; min-width: 0; }
  .f-wide { grid-column: 1 / -1; }
  .f-version input { max-width: 8rem; }
  input { width: 100%; }
  input.hash { font-size: 0.85rem; }
  .lbl { font-size: 0.92rem; color: var(--fg-muted); }
  .txrow { display: flex; gap: 0.5rem; }
  .txrow input { flex: 1; min-width: 0; }
  .small-btn { font-size: 0.85rem; padding: 0.25rem 0.6rem; justify-self: start; }
  .derived .hash { padding: 0.45rem 0.6rem; background: var(--bg-muted); border-radius: 8px; }
  .hint { font-size: 0.85rem; color: var(--fg-muted); }
  .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
  .errors { color: var(--danger); margin: 0; }
  .compare { border: 1px solid var(--border); border-left: 4px solid; border-radius: var(--radius); padding: 0.9rem 1rem; background: var(--bg-elevated); display: grid; gap: 0.6rem; }
  .compare.ok { border-left-color: var(--ok); }
  .compare.bad { border-left-color: var(--danger); }
  .row { display: grid; gap: 0.15rem; }
  .big { font-size: 0.95rem; letter-spacing: 0.02em; }
  .z { color: var(--accent-strong); font-weight: 700; }
  .verdict { margin: 0; }
  .compare.ok .verdict strong { color: var(--ok); }
  .compare.bad .verdict strong { color: var(--danger); }
  .compare .hint { margin: 0; }
</style>
