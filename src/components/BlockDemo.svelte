<script lang="ts">
  import { bytesToHex, headerHash, meetsTarget, merkleRoot, nBitsToTarget, serializeHeader } from '../lib';

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
  /** Größtes erlaubtes Target (nBits 1d00ffff). Ein größeres Target lehnt Bitcoin immer ab. */
  const MAX_TARGET = nBitsToTarget(0x1d00ffff);

  /** Die sechs Felder in der Reihenfolge, in der Bitcoin sie in die 80 Header-Bytes schreibt. */
  const FIELDS = [
    { key: 'version', label: 'Version', size: 4 },
    { key: 'prev', label: 'Vorheriger Block', size: 32 },
    { key: 'root', label: 'Merkle-Wurzel', size: 32 },
    { key: 'time', label: 'Zeitstempel', size: 4 },
    { key: 'bits', label: 'nBits', size: 4 },
    { key: 'nonce', label: 'Nonce', size: 4 },
  ] as const;
  interface Byte {
    hex: string;
    field: (typeof FIELDS)[number]['key'];
  }

  const isHash = (s: string) => /^[0-9a-fA-F]{64}$/.test(s.trim());
  const isUint32 = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
  /** Die Version steht als vorzeichenbehaftete 32-Bit-Zahl im Header. */
  const isInt32 = (n: number) => Number.isInteger(n) && n >= -(2 ** 31) && n <= 2 ** 31 - 1;

  // Die Merkle-Wurzel hängt nur von den TxIDs ab; ein Fehler in einem anderen Feld soll sie nicht verdecken.
  const root = $derived(txids.every(isHash) ? merkleRoot(txids.map((t) => t.trim())) : '');

  const computed = $derived.by(() => {
    const errors: string[] = [];
    if (!isInt32(version)) errors.push('Die Version muss eine ganze Zahl zwischen −2 147 483 648 und 2 147 483 647 sein.');
    if (!isHash(prevHash)) errors.push('Der vorherige Hash braucht genau 64 Hex-Zeichen.');
    txids.forEach((t, i) => {
      if (!isHash(t)) errors.push(`TxID ${i + 1} braucht genau 64 Hex-Zeichen.`);
    });
    if (!isUint32(timestamp)) errors.push('Der Zeitstempel muss eine ganze Zahl zwischen 0 und 4 294 967 295 sein.');
    if (!isUint32(nonce)) errors.push('Die Nonce muss eine ganze Zahl zwischen 0 und 4 294 967 295 sein.');
    if (!/^[0-9a-fA-F]{1,8}$/.test(nBitsText.trim())) errors.push('nBits braucht 1 bis 8 Hex-Zeichen, z. B. 1d00ffff.');
    const failed = (errors: string[]) => ({ errors, hash: '', targetHex: '', ok: false, tooEasy: false, bytes: [] as Byte[] });
    if (errors.length) return failed(errors);
    const nBits = parseInt(nBitsText.trim(), 16);
    // Bit 0x00800000 ist das Vorzeichen der Mantisse; ein negatives Target gibt es in Bitcoin nicht.
    if (nBits & 0x00800000) return failed(['Das zweite Byte von nBits darf höchstens 7f sein, sonst wäre das Target negativ.']);
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
    const header = { version, prevHash: prevHash.trim(), merkleRoot: root, timestamp, nBits, nonce };
    const hash = headerHash(header);
    const targetHex = target.toString(16).padStart(64, '0');
    const tooEasy = target > MAX_TARGET;
    // Die 80 Bytes, die tatsächlich gehasht werden, mit Zuordnung zum Feld.
    const hex = bytesToHex(serializeHeader(header));
    const bytes: Byte[] = [];
    let offset = 0;
    for (const f of FIELDS) {
      for (let i = 0; i < f.size; i++) bytes.push({ hex: hex.slice((offset + i) * 2, (offset + i) * 2 + 2), field: f.key });
      offset += f.size;
    }
    return { errors: [] as string[], hash, targetHex, ok: meetsTarget(hash, target), tooEasy, bytes };
  });

  const zeros = (hex: string) => hex.match(/^0*/)![0].length;
  /** 64 Hex-Zeichen in zwei Zeilen zu 32, damit Hash und Target Stelle für Stelle untereinander stehen. */
  const halves = (hex: string) => {
    const z = zeros(hex);
    return [0, 32].map((start) => {
      const line = hex.slice(start, start + 32);
      const n = Math.min(32, Math.max(0, z - start));
      return { zeros: line.slice(0, n), rest: line.slice(n) };
    });
  };

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
    <label class="f-version fld version">Version
      <input type="number" bind:value={version} />
    </label>
    <label class="f-wide fld prev">Hash des vorherigen Blocks
      <input type="text" class="hash" bind:value={prevHash} spellcheck="false" />
    </label>
    <div class="f-wide txs">
      <span class="lbl">TxIDs der Transaktionen im Block (1 bis 4, die erste ist immer die Coinbase-Transaktion)</span>
      {#each txids as _, i (i)}
        <div class="txrow">
          {#if i === 0}<span class="tag">Coinbase</span>{/if}
          <input type="text" class="hash" bind:value={txids[i]} aria-label={i === 0 ? 'TxID 1 (Coinbase)' : `TxID ${i + 1}`} spellcheck="false" />
          {#if txids.length > 1}
            <button type="button" class="small-btn" onclick={() => (txids = txids.filter((__, j) => j !== i))} aria-label="TxID {i + 1} entfernen">Entfernen</button>
          {/if}
        </div>
      {/each}
      {#if txids.length < 4}
        <button type="button" class="small-btn" onclick={addTx}>TxID hinzufügen</button>
      {/if}
    </div>
    <div class="f-wide derived fld root">
      <span class="lbl">Merkle-Wurzel (aus den TxIDs berechnet)</span>
      <span class="hash">{root || '–'}</span>
      {#if txids.length === 1 && root}
        <span class="hint">Nur eine Transaktion: Die Wurzel ist ihre TxID selbst.</span>
      {/if}
    </div>
    <label class="fld time">Zeitstempel
      <input type="number" bind:value={timestamp} />
      <span class="hint">Sekunden seit 1970, also {date}</span>
    </label>
    <label class="fld bits">nBits (Schwierigkeit, Hex)
      <input type="text" class="hash" bind:value={nBitsText} spellcheck="false" />
      <span class="hint">vom Netz vorgegeben, ein Miner darf es nicht wählen</span>
    </label>
    <label class="fld nonce">Nonce
      <input type="number" bind:value={nonce} min="0" max="4294967295" />
    </label>
  </div>

  <div class="aktionen">
    <button class="primary" onclick={() => (nonce = (nonce + 1) % 2 ** 32)}>Nonce +1</button>
    <button class="reset" onclick={loadGenesis}>Zurücksetzen</button>
  </div>

  {#if computed.errors.length}
    <ul class="errors" role="alert">
      {#each computed.errors as e (e)}<li>{e}</li>{/each}
    </ul>
  {:else}
    <figure class="strip">
      <p class="strip-title">Das wird gehasht: die 80 Bytes des Headers</p>
      <div class="bytes" aria-label="80 Header-Bytes in Hex, nach Feld gefärbt">
        {#each computed.bytes as b, i (i)}<span class="byte {b.field}">{b.hex}</span>{/each}
      </div>
      <figcaption class="fields">
        {#each FIELDS as f (f.key)}
          <span class="fld-key"><i class="sw {f.key}"></i>{f.label} ({f.size} Byte)</span>
        {/each}
      </figcaption>
      <p class="hint">
        Zahlen stehen mit dem niedrigsten Byte zuerst (Little Endian), die beiden Hashes in umgekehrter
        Byte-Reihenfolge. Deshalb sehen die Bytes anders aus als die Felder oben. Aus diesen 80 Bytes wird
        HASH256 berechnet, also zweimal SHA-256. Das Ergebnis wird für die Anzeige wieder umgedreht, so
        entsteht die bekannte Block-ID:
      </p>
      <div class="arrow" aria-hidden="true">HASH256 ↓</div>
    </figure>
    <div class="compare" class:ok={computed.ok && !computed.tooEasy} class:bad={!computed.ok || computed.tooEasy}>
      <div class="row">
        <span class="lbl">Header-Hash (Block-ID)</span>
        <span class="hash big">{#each halves(computed.hash) as l, j (j)}<span class="line"><span class="z">{l.zeros}</span>{l.rest}</span>{/each}</span>
      </div>
      <div class="row">
        <span class="lbl">Target aus nBits</span>
        <span class="hash big">{#each halves(computed.targetHex) as l, j (j)}<span class="line"><span class="z">{l.zeros}</span>{l.rest}</span>{/each}</span>
      </div>
      <p class="verdict" role="status">
        Hash höchstens so groß wie das Target?
        {#if !computed.ok}
          <strong>Nein, dieser Block wäre ungültig.</strong>
        {:else if computed.tooEasy}
          <strong>Ja, aber so ein Target lehnt Bitcoin ab.</strong> Es ist größer als das erlaubte Maximum
          (nBits 1d00ffff). nBits legt das Netz fest, alle 2016 Blöcke neu, nicht der Miner.
        {:else}
          <strong>Ja, der Block ist gültig.</strong>
        {/if}
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
  /* Feldfarben: Eingabefeld und Byte-Streifen tragen dieselbe Farbe. Kategoriale Töne, weil Grün und Rot hier
     allein „gültig“ und „ungültig“ bedeuten; die Nonce trägt die Akzentfarbe, weil nur sie der Miner ändert. */
  .fld { border-left: 3px solid var(--fc, var(--border)); padding-left: 0.5rem; }
  .version, .sw.version, .byte.version { --fc: color-mix(in srgb, var(--cat-6) 70%, var(--bg-elevated)); }
  .prev, .sw.prev, .byte.prev { --fc: color-mix(in srgb, var(--cat-5) 60%, var(--bg-elevated)); }
  .root, .sw.root, .byte.root { --fc: color-mix(in srgb, var(--cat-2) 60%, var(--bg-elevated)); }
  .time, .sw.time, .byte.time { --fc: color-mix(in srgb, var(--cat-3) 70%, var(--bg-elevated)); }
  .bits, .sw.bits, .byte.bits { --fc: color-mix(in srgb, var(--cat-1) 60%, var(--bg-elevated)); }
  .nonce, .sw.nonce, .byte.nonce { --fc: var(--accent); }
  .strip { margin: 0; display: grid; gap: 0.5rem; }
  .strip-title { margin: 0; font-weight: 600; }
  .bytes { display: grid; grid-template-columns: repeat(auto-fill, minmax(1.7rem, 1fr)); gap: 2px; font-family: var(--font-mono); font-size: 0.78rem; }
  .byte { text-align: center; padding: 0.15rem 0; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--fc) 45%, var(--bg-elevated)); border-bottom: 3px solid var(--fc); color: var(--fg); }
  .fields { display: flex; flex-wrap: wrap; gap: 0.2rem 1rem; font-size: 0.85rem; color: var(--fg-muted); }
  .fld-key { display: inline-flex; align-items: center; gap: 0.35rem; }
  .sw { display: inline-block; width: 0.9rem; height: 0.9rem; border-radius: var(--radius-sm); background: var(--fc); }
  .strip .hint { margin: 0; }
  .arrow { font-family: var(--font-mono); font-weight: 700; color: var(--fg-muted); padding-left: 0.2rem; }
  input { width: 100%; }
  input.hash { font-size: 0.85rem; }
  .lbl { font-size: 0.92rem; color: var(--fg-muted); }
  .txrow { display: flex; gap: 0.5rem; }
  .txrow input { flex: 1; min-width: 0; }
  .small-btn { font-size: 0.85rem; padding: 0.25rem 0.6rem; justify-self: start; }
  .derived .hash { padding: 0.45rem 0.6rem; background: var(--bg-muted); border-radius: var(--radius); }
  .hint { font-size: 0.85rem; color: var(--fg-muted); }
  .errors { color: var(--danger); margin: 0; }
  .compare { border: 1px solid var(--border); border-left: 4px solid; border-radius: var(--radius); padding: 0.9rem 1rem; background: var(--bg-elevated); display: grid; gap: 0.6rem; }
  .compare.ok { border-left-color: var(--ok); }
  .compare.bad { border-left-color: var(--danger); }
  .row { display: grid; gap: 0.15rem; }
  .big { font-size: min(0.95rem, 4.9cqi); letter-spacing: 0.02em; }
  /* Zwei feste Zeilen zu 32 Zeichen: Die Schrift schrumpft mit der Kartenbreite (32 Zeichen ≈ 20 em), damit
     Hash und Target Stelle für Stelle untereinander stehen. */
  .compare { container-type: inline-size; }
  .big .line { display: block; }
  .tag { align-self: center; font-size: 0.78rem; color: var(--fg-muted); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.05rem 0.35rem; }
  .z { color: var(--accent-strong); font-weight: 700; }
  .verdict { margin: 0; }
  .compare.ok .verdict strong { color: var(--ok); }
  .compare.bad .verdict strong { color: var(--danger); }
  .compare .hint { margin: 0; }
</style>
