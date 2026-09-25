/**
 * Spielzeug-Kurve y² = x³ + 7 über einem kleinen Primkörper F_p (dieselbe Gleichung wie
 * secp256k1, nur mit winzigem p), damit man alle Punkte zeichnen und nachrechnen kann.
 * Der Punkt im Unendlichen (neutrales Element „O“) ist `INFINITY`.
 */

/** Ein gewöhnlicher Punkt mit Koordinaten in F_p. */
export interface AffinePoint {
  x: number;
  y: number;
}

/** Punkt im Unendlichen: das neutrale Element der Addition (P + O = P). */
export const INFINITY = { infinity: true } as const;

/** Ein Punkt der Spielzeug-Kurve: gewöhnlicher Punkt oder Punkt im Unendlichen. */
export type ToyPoint = AffinePoint | typeof INFINITY;

/** Standard-Primzahl der Spielzeug-Kurve. */
export const DEFAULT_P = 97;

/** Konstante b der Kurvengleichung y² = x³ + b. */
export const CURVE_B = 7;

/** Prüft, ob ein Punkt der Punkt im Unendlichen ist. */
export function isInfinity(P: ToyPoint): P is typeof INFINITY {
  return 'infinity' in P;
}

/** Rechnet n modulo p ins Intervall 0 … p-1. */
export function mod(n: number, p: number): number {
  return ((n % p) + p) % p;
}

function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

function checkField(p: number): void {
  if (!isPrime(p) || p > 100_000) throw new Error(`p muss eine Primzahl bis 100000 sein, nicht ${p}.`);
  if (p === 2 || p === 3 || p === 7) throw new Error(`Für p = ${p} ist die Kurve entartet.`);
}

/** Berechnet das multiplikative Inverse von a modulo p (erweiterter euklidischer Algorithmus). */
export function modInverse(a: number, p: number): number {
  let [oldR, r] = [mod(a, p), p];
  let [oldS, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1) throw new Error(`${a} hat modulo ${p} kein Inverses.`);
  return mod(oldS, p);
}

/** Prüft, ob ein Punkt die Kurvengleichung y² = x³ + 7 (mod p) erfüllt. */
export function isOnCurve(P: ToyPoint, p = DEFAULT_P): boolean {
  if (isInfinity(P)) return true;
  return mod(P.y * P.y, p) === mod(P.x * P.x * P.x + CURVE_B, p);
}

/** Listet alle gewöhnlichen Punkte der Kurve über F_p auf, sortiert nach x, dann y. */
export function pointsOnCurve(p = DEFAULT_P): AffinePoint[] {
  checkField(p);
  const points: AffinePoint[] = [];
  for (let x = 0; x < p; x++) {
    const rhs = mod(x * x * x + CURVE_B, p);
    for (let y = 0; y < p; y++) if (mod(y * y, p) === rhs) points.push({ x, y });
  }
  return points;
}

/** Spiegelt einen Punkt an der x-Achse: -P, sodass P + (-P) = O. */
export function negate(P: ToyPoint, p = DEFAULT_P): ToyPoint {
  return isInfinity(P) ? P : { x: P.x, y: mod(-P.y, p) };
}

/** Vergleicht zwei Punkte. */
export function pointsEqual(P: ToyPoint, Q: ToyPoint): boolean {
  if (isInfinity(P) || isInfinity(Q)) return isInfinity(P) && isInfinity(Q);
  return P.x === Q.x && P.y === Q.y;
}

/** Addiert zwei Punkte nach der Sehnen-Tangenten-Regel. */
export function add(P: ToyPoint, Q: ToyPoint, p = DEFAULT_P): ToyPoint {
  checkField(p);
  if (isInfinity(P)) return Q;
  if (isInfinity(Q)) return P;
  if (P.x === Q.x && mod(P.y + Q.y, p) === 0) return INFINITY;
  const slope = P.x === Q.x
    ? mod(3 * P.x * P.x * modInverse(2 * P.y, p), p)
    : mod((Q.y - P.y) * modInverse(Q.x - P.x, p), p);
  const x = mod(slope * slope - P.x - Q.x, p);
  const y = mod(slope * (P.x - x) - P.y, p);
  return { x, y };
}

/** Verdoppelt einen Punkt (P + P, Tangente im Punkt P). */
export function double(P: ToyPoint, p = DEFAULT_P): ToyPoint {
  return add(P, P, p);
}

/** Ergebnis einer Skalarmultiplikation mit allen Zwischenpunkten 1·G, 2·G, …, k·G. */
export interface ScalarMulResult {
  result: ToyPoint;
  steps: ToyPoint[];
}

/** Berechnet k·G durch wiederholte Addition und liefert alle Zwischenpunkte (k ≤ 100000). */
export function scalarMul(k: number, G: ToyPoint, p = DEFAULT_P): ScalarMulResult {
  if (!Number.isInteger(k) || k < 0 || k > 100_000) {
    throw new Error('k muss eine ganze Zahl zwischen 0 und 100000 sein.');
  }
  const steps: ToyPoint[] = [];
  let current: ToyPoint = INFINITY;
  for (let i = 1; i <= k; i++) {
    current = add(current, G, p);
    steps.push(current);
  }
  return { result: current, steps };
}

/** Bestimmt die Ordnung eines Punkts: das kleinste n ≥ 1 mit n·G = O. */
export function pointOrder(G: ToyPoint, p = DEFAULT_P): number {
  if (!isOnCurve(G, p)) throw new Error('Der Punkt liegt nicht auf der Kurve.');
  let current = G;
  let n = 1;
  while (!isInfinity(current)) {
    current = add(current, G, p);
    n++;
  }
  return n;
}

/** Anzahl aller Punkte der Kurve einschließlich des Punkts im Unendlichen. */
export function groupOrder(p = DEFAULT_P): number {
  return pointsOnCurve(p).length + 1;
}

/** Ergebnis der Punktaddition über den reellen Zahlen (für die Zeichnung der Geraden). */
export interface RealSum {
  /** Steigung der Geraden durch P und Q (bzw. der Tangente); `null` bei senkrechter Geraden. */
  slope: number | null;
  /** Dritter Schnittpunkt der Geraden mit der Kurve; `null`, wenn die Summe O ist. */
  third: AffinePoint | null;
  /** Summe P + Q (Spiegelbild von `third`); `null`, wenn die Summe O ist. */
  sum: AffinePoint | null;
}

/** Oberer Ast der reellen Kurve y = √(x³ + b), unterhalb der Spitze 0. */
export function curveYReal(x: number): number {
  return Math.sqrt(Math.max(0, x ** 3 + CURVE_B));
}

/** Addiert zwei Punkte der reellen Kurve y² = x³ + b geometrisch (Sekante bzw. Tangente, Toleranz 1e-9). */
export function addReal(P: AffinePoint, Q: AffinePoint): RealSum {
  const same = Math.abs(P.x - Q.x) < 1e-9 && Math.abs(P.y - Q.y) < 1e-9;
  let slope: number;
  if (same) {
    if (Math.abs(P.y) < 1e-9) return { slope: null, third: null, sum: null };
    slope = (3 * P.x * P.x) / (2 * P.y);
  } else if (Math.abs(P.x - Q.x) < 1e-9) {
    return { slope: null, third: null, sum: null };
  } else {
    slope = (Q.y - P.y) / (Q.x - P.x);
  }
  const x3 = slope * slope - P.x - Q.x;
  const y3 = slope * (P.x - x3) - P.y;
  return { slope, third: { x: x3, y: -y3 }, sum: { x: x3, y: y3 } };
}
