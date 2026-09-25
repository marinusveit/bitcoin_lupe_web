/**
 * Rechnung und Experiment zum 51-Prozent-Angriff aus Abschnitt 11 des Bitcoin-Whitepapers.
 * `q` ist der Anteil des Angreifers an der Rechenleistung, `p = 1 − q` der der ehrlichen
 * Miner, `z` die Zahl der Bestätigungen, die der Händler abwartet. „Aufholen“ heißt wie im
 * Whitepaper: Die Kette des Angreifers ist so lang wie die ehrliche Kette.
 */

/** Ab der Hälfte der Rechenleistung holt der Angreifer immer auf (Toleranz für Reglerwerte wie 0,5000001). */
export function atLeastHalf(q: number): boolean {
  return q >= 0.5 - 1e-9;
}

/**
 * Wahrscheinlichkeit, dass ein Angreifer mit Rechenanteil q einen Rückstand von z Blöcken
 * aufholt: 1 − Σ_{k=0}^{z} Poisson(λ, k) · (1 − (q/p)^{z−k}) mit λ = z·q/p.
 */
export function attackerSuccessProbability(q: number, z: number): number {
  if (z === 0 || atLeastHalf(q)) return 1;
  if (q <= 0) return 0;
  const p = 1 - q;
  const lambda = (z * q) / p;
  const logLambda = Math.log(lambda);
  const logRatio = Math.log(q / p);
  let sum = 0;
  let logFact = 0;
  for (let k = 0; k <= z; k++) {
    if (k > 0) logFact += Math.log(k);
    const poisson = Math.exp(k * logLambda - lambda - logFact);
    sum += poisson * (1 - Math.exp((z - k) * logRatio));
  }
  return Math.min(1, Math.max(0, 1 - sum));
}

/**
 * Genaue Wahrscheinlichkeit, dass der Angreifer aufholt (Grunspan/Pérez-Marco 2018). Anders als
 * Nakamoto nimmt sie nicht an, dass die Ehrlichen für z Blöcke genau die mittlere Zeit brauchen:
 * Die Zahl der Angreiferblöcke bis dahin ist negativ-binomialverteilt. Geschlossene Form
 * 1 − Σ_{k=0}^{z−1} C(k+z−1, k) · (p^z q^k − q^z p^k), in Log-Rechnung gegen Überlauf bei großem z.
 * Wegen der Differenz 1 − Summe ist das Ergebnis nur auf etwa 1e−12 genau, für Schwellen wie 0,1 % reicht das.
 */
export function exactAttackerSuccessProbability(q: number, z: number): number {
  if (z === 0 || atLeastHalf(q)) return 1;
  if (q <= 0) return 0;
  const p = 1 - q;
  const logP = Math.log(p);
  const logQ = Math.log(q);
  let sum = 0;
  let logBinom = 0;
  for (let k = 0; k < z; k++) {
    if (k > 0) logBinom += Math.log(k + z - 1) - Math.log(k);
    sum += Math.exp(logBinom + z * logP + k * logQ) - Math.exp(logBinom + z * logQ + k * logP);
  }
  return Math.min(1, Math.max(0, 1 - sum));
}

/** Suchgrenze für `confirmationsFor`; darüber liegen nur q, die kaum von 50 % zu unterscheiden sind. */
const MAX_CONFIRMATIONS = 1 << 20;

/**
 * Nötige Bestätigungen für ein Risiko unter `limit` nach der Formel `probability` (Standard:
 * Whitepaper). Die Wahrscheinlichkeit fällt mit z, deshalb erst verdoppeln, dann halbieren.
 * `null`, wenn kein Warten hilft (q ab 50 %) oder mehr als 2^20 Blöcke nötig wären.
 */
export function confirmationsFor(
  q: number,
  limit = 0.001,
  probability: (q: number, z: number) => number = attackerSuccessProbability,
): number | null {
  if (atLeastHalf(q)) return null;
  if (probability(q, 0) < limit) return 0;
  let high = 1;
  while (probability(q, high) >= limit) {
    if (high >= MAX_CONFIRMATIONS) return null;
    high *= 2;
  }
  let low = high / 2; // probability(q, low) >= limit
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (probability(q, mid) >= limit) low = mid;
    else high = mid;
  }
  return high;
}

/** Wer den nächsten Block gefunden hat. */
export type RaceStep = 'honest' | 'attacker';

export interface RaceResult {
  /** Blockfunde in zeitlicher Reihenfolge, beginnend nach dem Block mit der Zahlung. */
  steps: RaceStep[];
  /** Index in `steps`, nach dem der Händler seine z Bestätigungen hatte (−1, wenn nie). */
  deliveredAt: number;
  honest: number;
  attacker: number;
  /** success: Angreifer hat aufgeholt; abandoned: Rückstand zu groß, er gibt auf. */
  outcome: 'success' | 'abandoned';
}

export interface RaceOptions {
  /** Zufallszahl in [0, 1); Standard `Math.random`. */
  random?: () => number;
  /** Rückstand in Blöcken, bei dem der Angreifer aufgibt. */
  giveUpDeficit?: number;
  /** Höchstzahl an Blockfunden, danach gilt das Rennen als aufgegeben. */
  maxSteps?: number;
}

/**
 * Spielt ein einzelnes Wettrennen durch: Block für Block findet mit Wahrscheinlichkeit q der
 * Angreifer und sonst ein ehrlicher Miner den nächsten Block. Der Händler liefert, sobald die
 * ehrliche Kette z Blöcke nach der Zahlung hat. Der Angreifer mined ab der Zahlung heimlich weiter,
 * bis seine Kette gleich lang ist (Erfolg) oder er zu weit zurückliegt (aufgegeben).
 */
export function simulateRace(q: number, z: number, options: RaceOptions = {}): RaceResult {
  const random = options.random ?? Math.random;
  const giveUp = options.giveUpDeficit ?? 20;
  const maxSteps = options.maxSteps ?? 600;
  if (!(q >= 0 && q <= 1)) throw new Error('q muss zwischen 0 und 1 liegen.');
  if (!Number.isInteger(z) || z < 0) throw new Error('z muss eine ganze Zahl ≥ 0 sein.');
  const steps: RaceStep[] = [];
  let honest = 0;
  let attacker = 0;
  let deliveredAt = z === 0 ? 0 : -1;
  while (steps.length < maxSteps) {
    if (honest >= z && attacker >= honest) {
      return { steps, deliveredAt, honest, attacker, outcome: 'success' };
    }
    if (honest - attacker >= giveUp) break;
    const who: RaceStep = random() < q ? 'attacker' : 'honest';
    steps.push(who);
    if (who === 'honest') honest++;
    else attacker++;
    if (deliveredAt < 0 && honest >= z) deliveredAt = steps.length;
  }
  return { steps, deliveredAt, honest, attacker, outcome: 'abandoned' };
}

/** Kleiner deterministischer Zufallsgenerator (Mulberry32) für Tests und wiederholbare Rennen. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
