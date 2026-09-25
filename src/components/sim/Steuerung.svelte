<script lang="ts">
  import type { PresetName } from '../../lib/sim';

  interface Props {
    compact: boolean;
    running: boolean;
    speed: number;
    preset: PresetName;
    seed: number;
    tick: number;
    ontoggle: () => void;
    onstep: () => void;
    onreset: () => void;
    onpreset: (p: PresetName) => void;
  }
  let {
    compact,
    running,
    speed = $bindable(),
    preset,
    seed = $bindable(),
    tick,
    ontoggle,
    onstep,
    onreset,
    onpreset,
  }: Props = $props();

  const uid = $props.id();

  const PRESET_LABELS: Record<PresetName, string> = {
    normal: 'Normalbetrieb',
    fork: 'Gleichzeitiger Fund',
    attack: 'Double Spend (51 %)',
  };
  const PRESET_ORDER: PresetName[] = ['normal', 'fork', 'attack'];
</script>

<!-- Aktionsleiste nach globalem Muster .aktionen: Start zuerst, „Zurücksetzen“ (.reset) als letztes Element rechtsbündig. -->
<div class="steuerung aktionen" role="group" aria-label="Simulation steuern">
  <div class="gruppe">
    <button type="button" class="primary start" onclick={ontoggle}>
      {running ? 'Pause' : 'Start'}
    </button>
    {#if !compact}
      <button type="button" onclick={onstep} disabled={running}>Ein Tick</button>
    {/if}
    <span class="tick mono" aria-label="Aktueller Tick">Tick {tick}</span>
  </div>

  <div class="gruppe tempo">
    <!-- „Tick“ ist der Zeitschritt der Simulation; die Beschriftung sagt es in Worten (k7-07). -->
    <label for="speed-{uid}">Tempo (Zeitschritte pro Sekunde)</label>
    <input id="speed-{uid}" type="range" min="1" max="20" step="1" bind:value={speed} />
    <output for="speed-{uid}" class="mono">{speed}</output>
  </div>

  {#if !compact}
    <div class="gruppe">
      <label for="preset-{uid}">Szenario</label>
      <select id="preset-{uid}" value={preset} onchange={(e) => onpreset(e.currentTarget.value as PresetName)}>
        {#each PRESET_ORDER as p (p)}
          <option value={p}>{PRESET_LABELS[p]}</option>
        {/each}
      </select>
    </div>
    <div class="gruppe">
      <label for="seed-{uid}">Zufall</label>
      <input id="seed-{uid}" type="number" min="1" step="1" bind:value={seed} class="seed" onchange={onreset} aria-describedby="seed-hilfe-{uid}" />
      <!-- Sichtbar statt nur als title, der auf Touch-Geräten nicht erscheint (sim-17). -->
      <span id="seed-hilfe-{uid}" class="hilfe">Gleiche Zahl = gleicher Ablauf. Ändern startet neu.</span>
    </div>
  {/if}

  <button type="button" class="reset" onclick={onreset}>Zurücksetzen</button>
</div>

<style>
  .steuerung {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 0.9rem;
    padding: 0.6rem 0.8rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .gruppe {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .start {
    min-width: 5.5rem;
  }
  .tempo input {
    width: 6.5rem;
    accent-color: var(--accent);
  }
  output {
    font-size: 0.85rem;
    color: var(--fg-muted);
    min-width: 1.5rem;
  }
  .hilfe {
    flex-basis: 100%;
    font-size: 0.75rem;
    color: var(--fg-muted);
  }
  .seed {
    width: 4.2rem;
  }
  .tick {
    min-width: 4.2rem;
    color: var(--fg-muted);
    font-size: 0.85rem;
  }
</style>
