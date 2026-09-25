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

  const uid = Math.random().toString(36).slice(2, 8);

  const PRESET_LABELS: Record<PresetName, string> = {
    normal: 'Normalbetrieb',
    fork: 'Gleichzeitiger Fund',
    attack: 'Double Spend (51 %)',
  };
  const PRESET_ORDER: PresetName[] = ['normal', 'fork', 'attack'];
</script>

<div class="steuerung" role="group" aria-label="Simulation steuern">
  <div class="gruppe">
    <button type="button" class="primary start" onclick={ontoggle}>
      {running ? 'Pause' : 'Start'}
    </button>
    {#if !compact}
      <button type="button" onclick={onstep} disabled={running}>Ein Tick</button>
    {/if}
    <button type="button" onclick={onreset}>Zurücksetzen</button>
  </div>

  <div class="gruppe tempo">
    <label for="speed-{uid}">Tempo</label>
    <input id="speed-{uid}" type="range" min="1" max="20" step="1" bind:value={speed} />
    <output for="speed-{uid}" class="mono">{speed} Ticks/s</output>
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
      <label for="seed-{uid}" title="Gleicher Startwert ergibt beim Zurücksetzen denselben Ablauf">Zufall</label>
      <input id="seed-{uid}" type="number" min="1" step="1" bind:value={seed} class="seed" onchange={onreset} />
    </div>
  {/if}

  <span class="tick mono" aria-label="Aktueller Tick">Tick {tick}</span>
</div>

<style>
  .steuerung {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem 1.2rem;
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
    width: 8rem;
    accent-color: var(--accent);
  }
  output {
    font-size: 0.85rem;
    color: var(--fg-muted);
    min-width: 5.5rem;
  }
  .seed {
    width: 5rem;
  }
  .tick {
    margin-left: auto;
    color: var(--fg-muted);
    font-size: 0.85rem;
  }
</style>
