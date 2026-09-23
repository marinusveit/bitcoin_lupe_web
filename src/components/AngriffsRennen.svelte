<script lang="ts">
  import { onDestroy } from 'svelte';
  import { atLeastHalf, attackerSuccessProbability, simulateRace, type RaceResult } from '../lib/nakamoto';

  const START_Q = 0.3;
  const START_Z = 3;
  const STEP_MS = 320;
  /** Rückstand, bei dem der Angreifer in der Simulation aufgibt (siehe nakamoto.ts). */
  const GIVE_UP = 20;

  let q = $state(START_Q);
  let z = $state(START_Z);
  let race: RaceResult | null = $state(null);
  /** Wie viele Blockfunde des laufenden Rennens schon gezeigt werden. */
  let shown = $state(0);
  let playing = $state(false);
  let runs = $state(0);
  let wins = $state(0);
  let timer: ReturnType<typeof setInterval> | undefined;
  let track: HTMLDivElement | undefined = $state();

  const motion = typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pct = (v: number, d = 1) => `${(v * 100).toLocaleString('de-DE', { maximumFractionDigits: d })} %`;
  const formula = $derived(attackerSuccessProbability(q, z));

  /** Stand des Rennens nach `shown` Blockfunden. */
  const view = $derived.by(() => {
    if (!race) return { honest: 0, attacker: 0, delivered: z === 0, done: false, steps: [] as ('honest' | 'attacker')[] };
    const steps = race.steps.slice(0, shown);
    const honest = steps.filter((s) => s === 'honest').length;
    const attacker = steps.length - honest;
    return { honest, attacker, delivered: race.deliveredAt >= 0 && shown >= race.deliveredAt, done: shown >= race.steps.length, steps };
  });
  const lead = $derived(view.attacker - view.honest);

  function stopTimer() {
    clearInterval(timer);
    timer = undefined;
    playing = false;
  }

  function startRace() {
    stopTimer();
    const r = simulateRace(q, z, { giveUpDeficit: GIVE_UP });
    race = r;
    if (!motion) {
      shown = r.steps.length;
      finish(r);
      return;
    }
    shown = 0;
    playing = true;
    timer = setInterval(() => {
      shown++;
      if (shown >= r.steps.length) {
        stopTimer();
        finish(r);
      }
    }, STEP_MS);
  }

  /** Bricht die Animation ab und zeigt das Ende des laufenden Rennens sofort. */
  function skipToEnd() {
    if (!race) return;
    stopTimer();
    shown = race.steps.length;
    finish(race);
  }

  function finish(r: RaceResult) {
    runs++;
    if (r.outcome === 'success') wins++;
  }

  function runBatch(n: number) {
    stopTimer();
    race = null;
    shown = 0;
    for (let i = 0; i < n; i++) finish(simulateRace(q, z, { giveUpDeficit: GIVE_UP }));
  }

  function resetTally() {
    runs = 0;
    wins = 0;
  }

  function reset() {
    stopTimer();
    q = START_Q;
    z = START_Z;
    race = null;
    shown = 0;
    resetTally();
  }

  /** Schieberegler ändern die Aufgabe: Zähler zurück, laufendes Rennen beenden. */
  function onParamChange() {
    stopTimer();
    race = null;
    shown = 0;
    resetTally();
  }

  /** Neue Blöcke erscheinen rechts, die Spur scrollt mit. */
  $effect(() => {
    void shown;
    if (track) track.scrollLeft = track.scrollWidth;
  });

  onDestroy(stopTimer);
</script>

<div class="demo">
  <div class="controls">
    <label class="slider">
      <span>Angreifer besitzt <strong>{Math.round(q * 100)} %</strong> der Rechenleistung</span>
      <input type="range" min="0.05" max="0.6" step="0.05" bind:value={q} oninput={onParamChange} />
    </label>
    <label class="slider">
      <span>Händler wartet <strong>{z}</strong> {z === 1 ? 'Bestätigung' : 'Bestätigungen'}</span>
      <input type="range" min="0" max="8" step="1" bind:value={z} oninput={onParamChange} />
    </label>
  </div>
  <div class="actions">
    {#if playing}
      <button class="primary" onclick={skipToEnd}>Zum Ende springen</button>
    {:else}
      <button class="primary" onclick={startRace}>Ein Rennen starten</button>
    {/if}
    <button onclick={() => runBatch(100)} disabled={playing} title="ohne Animation">100 Rennen</button>
    <button onclick={() => runBatch(1000)} disabled={playing} title="ohne Animation">1000 Rennen</button>
    <button onclick={reset}>Zurücksetzen</button>
  </div>

  <div class="track" aria-live="polite" bind:this={track}>
    <div class="lane">
      <span class="lane-lbl">Ehrliche Kette</span>
      <div class="blocks">
        <span class="blk pay" title="Block mit der Zahlung an den Händler">€</span>
        {#each view.steps as s, i (i)}
          {#if s === 'honest'}
            <span class="blk honest" class:mark={race && i + 1 === race.deliveredAt}></span>
          {/if}
        {/each}
        {#if view.delivered}
          <span class="flag">Ware geliefert</span>
        {/if}
      </div>
    </div>
    <div class="lane">
      <span class="lane-lbl">Angreifer (heimlich)</span>
      <div class="blocks">
        <span class="blk double" title="Block mit der Zahlung an sich selbst">✕</span>
        {#each view.steps as s, i (i)}
          {#if s === 'attacker'}
            <span class="blk attacker" class:published={view.done && race?.outcome === 'success'}></span>
          {/if}
        {/each}
      </div>
    </div>
  </div>

  <p class="status">
    {#if !race}
      Drücke „Ein Rennen starten“. Jeder neue Block geht mit {Math.round(q * 100)} % Wahrscheinlichkeit an den
      Angreifer, sonst an die ehrlichen Miner.
    {:else if !view.done}
      {#if !view.delivered}
        Der Händler wartet noch: {view.honest} von {z} Bestätigungen.
      {:else if lead < 0}
        Der Händler hat geliefert. Der Angreifer liegt {-lead} {lead === -1 ? 'Block' : 'Blöcke'} zurück und sucht weiter nach Blöcken.
      {:else}
        Der Angreifer hat aufgeholt!
      {/if}
    {:else if race.outcome === 'success' && race.steps.length === 0}
      <strong class="bad">Angriff gelungen:</strong> Der Händler hat ohne Bestätigung geliefert. Der Angreifer muss nichts aufholen
      und veröffentlicht einfach seine Zahlung an sich selbst.
    {:else if race.outcome === 'success'}
      <strong class="bad">Angriff gelungen:</strong> Nach {race.steps.length} Blöcken hat die Kette des Angreifers die ehrliche eingeholt.
      Sobald sie länger ist, wechseln die Knoten zu ihr, und die Zahlung an den Händler verschwindet.
    {:else}
      <strong class="good">Angriff gescheitert:</strong> Der Angreifer liegt {race.honest - race.attacker} Blöcke zurück und gibt auf.
      Die Zahlung bleibt in der Kette.
    {/if}
  </p>

  <dl class="tally">
    <div><dt>Rennen</dt><dd>{runs}</dd></div>
    <div><dt>davon gelungen</dt><dd>{wins}</dd></div>
    <div><dt>Quote im Experiment</dt><dd>{runs > 0 ? pct(wins / runs) : '–'}</dd></div>
    <div><dt>Formel aus dem Whitepaper</dt><dd>{pct(formula, formula < 0.01 ? 2 : 1)}</dd></div>
  </dl>
  <p class="hint">
    {#if atLeastHalf(q)}
      Mit mindestens der Hälfte der Rechenleistung holt der Angreifer früher oder später jeden Rückstand auf,
      wenn er nur lange genug durchhält. In der Simulation gibt er bei {GIVE_UP} Blöcken Rückstand auf, deshalb
      scheitern hier trotzdem einige Rennen.
    {:else}
      Je mehr Rennen du laufen lässt, desto näher rückt die Quote an die Formel. Ein einzelnes Rennen kann
      immer anders ausgehen, das ist Zufall. Die Formel im Whitepaper ist eine Näherung, und der Angreifer
      gibt in der Simulation bei {GIVE_UP} Blöcken Rückstand auf. Ein paar Prozent Abstand bleiben deshalb.
    {/if}
    Wie im Whitepaper zählt es als Erfolg, sobald die heimliche Kette gleich lang ist. Im echten Netz muss
    sie länger sein, damit die Knoten zu ihr wechseln.
  </p>
</div>

<style>
  .demo { display: grid; gap: 0.9rem; }
  .controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0.8rem 2rem; }
  .slider { display: grid; gap: 0.3rem; color: var(--fg); }
  .slider input { width: 100%; }
  .actions { display: flex; gap: 0.6rem; flex-wrap: wrap; }
  .track { display: grid; gap: 0.6rem; padding: 0.8rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-elevated); overflow-x: auto; }
  .lane { display: grid; grid-template-columns: 9rem 1fr; align-items: center; gap: 0.6rem; }
  .lane-lbl { font-size: 0.88rem; color: var(--fg-muted); position: sticky; left: 0; background: var(--bg-elevated); z-index: 1; }
  .blocks { display: flex; align-items: center; gap: 0.3rem; min-height: 1.7rem; }
  .blk {
    flex: none; width: 1.6rem; height: 1.6rem; border-radius: var(--radius-sm);
    display: inline-grid; place-items: center; font-size: 0.85rem; font-weight: 700;
    border: 2px solid var(--fg-muted); background: var(--bg-muted); color: var(--fg);
  }
  .blk.honest { border-color: var(--ok); background: color-mix(in srgb, var(--ok) 35%, var(--bg-elevated)); }
  .blk.honest.mark { box-shadow: 0 0 0 2px var(--bg-elevated), 0 0 0 4px var(--ok); }
  .blk.attacker { border-color: var(--danger); border-style: dashed; background: color-mix(in srgb, var(--danger) 18%, var(--bg-elevated)); }
  .blk.attacker.published { border-style: solid; background: color-mix(in srgb, var(--danger) 40%, var(--bg-elevated)); }
  .blk.double { border-color: var(--danger); color: var(--danger); }
  .flag { flex: none; font-size: 0.78rem; font-weight: 600; color: var(--ok); padding-left: 0.2rem; white-space: nowrap; }
  .status { margin: 0; min-height: 2.6em; }
  .bad { color: var(--danger); }
  .good { color: var(--ok); }
  .tally { display: grid; grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr)); gap: 0.6rem 1rem; margin: 0; padding: 0.8rem 1rem; background: var(--bg-muted); border-radius: var(--radius); }
  .tally div { display: grid; }
  .tally dt { font-size: 0.82rem; color: var(--fg-muted); }
  .tally dd { margin: 0; font-size: 1.2rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .hint { margin: 0; font-size: 0.9rem; color: var(--fg-muted); }
  @media (max-width: 560px) {
    .lane { grid-template-columns: 1fr; gap: 0.2rem; }
  }
</style>
