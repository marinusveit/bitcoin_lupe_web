# bitcoin_lupe_web – Lehr-Website „Bitcoin unter der Lupe“

Statische Astro-Website mit Svelte-Inseln, die Schülerinnen und Schülern die Technik von
Bitcoin anhand interaktiver Visualisierungen erklärt. Inhaltliche Grundlage ist die
Bachelorarbeit in `../BitcoinUnterDerLupe_Latex/663b622a01b522f82ce23253/txt/`.

## Stack
- Astro 7 (statisch, kein SSR), Svelte 5 mit Runes (`$state`, `$derived`, `$props`), TypeScript strict.
- Inhalte als MDX in `src/content/kapitel/`, Formeln mit `$...$` / `$$...$$` (remark-math + KaTeX).
- Fachlogik framework-frei in `src/lib/` (Hashing über `@noble/hashes`, Kurven über `@noble/curves`),
  Tests daneben als `*.test.ts` mit Vitest. Kein `crypto-js`, kein `Buffer`-Polyfill.
- Interaktive Komponenten in `src/components/` als `.svelte`, eingebunden mit `client:visible`
  (Simulator: `client:only="svelte"`, wenn er Web Worker nutzt).
- Styling: eigenes CSS mit Tokens aus `src/styles/global.css`, kein Tailwind, kein Bootstrap.
  Dark Mode über `prefers-color-scheme`. Mobil ab 360 px lauffähig.
- Paketmanager: npm (Lockfile `package-lock.json`).

## Befehle
- `npm run dev` (Dev-Server, für Agenten: `npx astro dev --background`, Status `npx astro dev status`)
- `npm run build` (muss vor jeder Fertigmeldung fehlerfrei laufen)
- `npm test` (Vitest, einmalig) und `npm run check` (astro check, Typen)

## Regeln
- Zielgruppe sind Schüler ab etwa 15 Jahren: kurze Sätze, jeder Fachbegriff wird beim ersten
  Auftreten in einem Satz erklärt, vor jeder Formel steht die Aussage in Worten.
- UI-Texte und Inhalte auf Deutsch mit korrekten Umlauten; Code-Bezeichner auf Englisch.
- Keine externen Laufzeit-Abhängigkeiten zu Diensten (keine APIs, keine CDN-Schriften). Die Seite
  muss offline von einem USB-Stick oder einem einfachen Webserver funktionieren.
- Jede Visualisierung hat einen Zustand „Start“, aus dem der Nutzer ohne Anleitung etwas ausprobieren
  kann, und einen Knopf „Zurücksetzen“.
- Lange Berechnungen (Mining) laufen im Web Worker, nie im Hauptthread.
- Vor Fertigmeldung einer UI-Änderung: im Browser ansehen (Screenshot), nicht nur bauen.
- Commits auf Englisch nach Conventional Commits, keine KI-Attribution.

## Struktur
```
src/
  content/kapitel/*.mdx      Kapiteltexte (Frontmatter: title, order, summary)
  content.config.ts          Collection-Schema
  layouts/Base.astro         Seitengerüst mit Navigation
  pages/                     index.astro, kapitel/[slug].astro, simulator.astro
  components/                Svelte-Visualisierungen
  lib/                       Fachlogik (hash, merkle, keys, tx, script, block, sim/)
  styles/global.css          Tokens und Basistypografie
```
