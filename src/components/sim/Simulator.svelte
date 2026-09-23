<script lang="ts">
  import { onMount } from 'svelte';
  import { createWorld, step, type PresetName, type World } from '../../lib/sim';
  import type { Highlight } from './helpers';
  import Steuerung from './Steuerung.svelte';
  import Netzkarte from './Netzkarte.svelte';
  import Knotentafel from './Knotentafel.svelte';
  import TxFormular from './TxFormular.svelte';
  import MinerListe from './MinerListe.svelte';
  import Kennzahlen from './Kennzahlen.svelte';
  import Kettenuebersicht from './Kettenuebersicht.svelte';
  import Protokoll from './Protokoll.svelte';

  interface Props {
    /** Kurzfassung für Kapitel: nur Karte, Start/Pause, Tempo, Tx-Formular und Protokoll. */
    compact?: boolean;
  }
  let { compact = false }: Props = $props();

  /** 10 statt 12 Nullbits: Nonce-Suche ~4 ms statt ~15 ms je Blockfund. */
  const ZERO_BITS = 10;

  let preset: PresetName = $state('normal');
  let seed = $state(1);
  // Die Welt ist ein großes, von der Engine mutiertes Objekt. Sie bleibt ohne Proxy
  // ($state.raw); nach jeder Änderung zählt `version` hoch und alle Ansichten rechnen neu.
  let world: World = $state.raw(makeWorld('normal', 1));
  let version = $state(0);
  let running = $state(false);
  let speed = $state(5);
  /** Anteil des laufenden Ticks (0 bis 1) für die Bewegung der Nachrichten. */
  let frac = $state(0);
  let selectedId: string | null = $state('alice');
  let highlight: Highlight = $state(null);
  let stepMs = $state(0);
  const tick = $derived.by(() => {
    void version;
    return world.tick;
  });

  function makeWorld(p: PresetName, s: number): World {
    return createWorld(p, s, { displayZeroBits: ZERO_BITS });
  }

  function touch() {
    version += 1;
  }

  function doStep() {
    const t = performance.now();
    step(world);
    const d = performance.now() - t;
    stepMs = stepMs === 0 ? d : stepMs * 0.9 + d * 0.1;
  }

  function stepOnce() {
    doStep();
    frac = 0;
    touch();
  }

  function reset() {
    world = makeWorld(preset, seed);
    frac = 0;
    highlight = null;
    if (selectedId && !world.nodes[selectedId]) selectedId = 'alice';
    touch();
  }

  function loadPreset(p: PresetName) {
    preset = p;
    reset();
  }

  function toggleHighlight(h: Highlight) {
    highlight = h && highlight && h.kind === highlight.kind && h.id === highlight.id ? null : h;
  }

  // Takt über setInterval (läuft auch in Hintergrund-Tabs weiter, dort gedrosselt),
  // Bewegung der Nachrichten über requestAnimationFrame.
  let lastStepAt = 0;
  $effect(() => {
    if (!running) return;
    const interval = 1000 / speed;
    lastStepAt = performance.now();
    const id = setInterval(() => {
      doStep();
      lastStepAt = performance.now();
      touch();
    }, interval);
    return () => clearInterval(id);
  });

  onMount(() => {
    let raf = 0;
    const frame = (now: number) => {
      if (running) frac = Math.min(1, Math.max(0, (now - lastStepAt) / (1000 / speed)));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="sim" class:compact data-step-ms={stepMs.toFixed(2)}>
  {#if !compact}
    <aside class="callout erklaerung" aria-label="Was du hier siehst">
      <p>
        Die Karte zeigt ein kleines Bitcoin-Netz: Wallets (Kreise) schicken Zahlungen an Knoten (Sechsecke), und die
        Knoten reichen jede Nachricht an ihre Nachbarn weiter. Orange Punkte sind Transaktionen, blaue Punkte sind
        Blöcke. Miner (Sechsecke mit Balken für ihre Rechenleistung) finden zufällig neue Blöcke, und unten siehst du,
        wie daraus eine Kette wird, die sich manchmal kurz gabelt.
      </p>
      <p class="aufgaben-titel">Probier es aus:</p>
      <ul class="aufgaben">
        <li>Sende Alice → Bob und verfolge den Punkt.</li>
        <li>Gib einem Miner die doppelte Hashrate.</li>
        <li>Starte das Szenario „Double Spend“ und beobachte Bobs Bestätigungen.</li>
      </ul>
    </aside>
  {/if}

  <Steuerung
    {compact}
    {running}
    bind:speed
    {preset}
    bind:seed
    {tick}
    ontoggle={() => (running = !running)}
    onstep={stepOnce}
    onreset={reset}
    onpreset={loadPreset}
  />

  {#if !compact}
    <Kennzahlen {world} {version} />
  {/if}

  <div class="main">
    <div class="karte-spalte">
      <Netzkarte
        {world}
        {version}
        {frac}
        {selectedId}
        {highlight}
        onselect={(id) => (selectedId = id)}
      />
    </div>
    {#if !compact}
      <div class="tafel-spalte">
        <Knotentafel {world} {version} {selectedId} {highlight} onhighlight={toggleHighlight} />
      </div>
    {/if}
  </div>

  <div class="unten">
    <div class="formulare">
      <TxFormular {world} {version} onmutate={touch} />
      {#if !compact}
        <MinerListe {world} {version} onmutate={touch} onselect={(id) => (selectedId = id)} />
      {/if}
    </div>
    <Protokoll {world} {version} limit={compact ? 10 : 50} {highlight} onhighlight={toggleHighlight} />
  </div>

  {#if !compact}
    <Kettenuebersicht {world} {version} {highlight} onhighlight={toggleHighlight} />
  {/if}
</div>

<style>
  .sim {
    /* Miner-Farben: feste Reihenfolge, an der Miner-ID; hell und dunkel geprüft (Farbsehschwäche). */
    --miner-1: #4a3aa7;
    --miner-2: #1baf7a;
    --miner-3: #eda100;
    --miner-4: #e87ba4;
    --miner-5: #2a78d6;
    --miner-6: #008300;
    --msg-tx: var(--accent);
    --msg-block: var(--info);
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin: 1.5rem 0;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) .sim {
      --miner-1: #9085e9;
      --miner-2: #199e70;
      --miner-3: #c98500;
      --miner-4: #d55181;
      --miner-5: #3987e5;
      --miner-6: #008300;
    }
  }
  :global(:root[data-theme='dark']) .sim {
    --miner-1: #9085e9;
    --miner-2: #199e70;
    --miner-3: #c98500;
    --miner-4: #d55181;
    --miner-5: #3987e5;
    --miner-6: #008300;
  }

  .erklaerung {
    margin: 0;
  }
  .erklaerung p {
    margin-bottom: 0.5em;
  }
  .aufgaben-titel {
    font-weight: 600;
  }
  .aufgaben {
    margin: 0;
    padding-left: 1.2rem;
  }

  .main,
  .unten {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr);
  }
  .formulare {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
  }
  .karte-spalte,
  .tafel-spalte {
    min-width: 0;
  }

  @container (min-width: 860px) {
    .main {
      grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
      align-items: start;
    }
    .unten {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: start;
    }
  }
  @container (min-width: 620px) {
    .compact .unten {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
      align-items: start;
    }
  }
</style>
