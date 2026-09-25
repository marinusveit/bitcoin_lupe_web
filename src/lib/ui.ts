/** Kleine Browser-Helfer für die Demos (ohne Fachlogik, auf dem Server gefahrlos aufrufbar). */

/** Hat die Nutzerin „Bewegung reduzieren“ eingestellt? Ohne `matchMedia` (Server, Tests) false. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Darf die Demo animieren? Nur im Browser mit `matchMedia` und ohne „Bewegung reduzieren“; in Tests und auf dem Server nie. */
export function motionAllowed(): boolean {
  return typeof matchMedia === 'function' && !prefersReducedMotion();
}

/** Rechnet die Zeigerposition in SVG-Koordinaten (Nutzereinheiten der viewBox) um; `null` ohne Bildschirmmatrix. */
export function svgPoint(event: { clientX: number; clientY: number }, svg: SVGGraphicsElement): { x: number; y: number } | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

/** Tastatur-Handler für Elemente mit `role="button"`: Enter und Leertaste lösen `fn` aus. */
export function onActivate(fn: () => void): (event: KeyboardEvent) => void {
  return (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fn();
    }
  };
}
