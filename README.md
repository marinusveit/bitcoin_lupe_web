# Bitcoin unter der Lupe – Lehr-Website

Statische Website, die Schülerinnen und Schülern ab etwa 15 Jahren die Technik hinter Bitcoin
mit interaktiven Visualisierungen erklärt: Hashfunktionen, Schlüssel und Signaturen,
Transaktionen, Bitcoin Script, Blöcke, Mining und die Blockchain als Ganzes. Inhaltliche
Grundlage ist die Bachelorarbeit „Bitcoin unter der Lupe“ von Marinus Veit.

## Stack

- Astro 7 (rein statisch, kein Server nötig) mit Svelte 5 als Inseln für die Visualisierungen
- Kapiteltexte als MDX, Formeln mit KaTeX
- Kryptografie im Browser über `@noble/hashes` und `@noble/curves`
- Keine externen Dienste zur Laufzeit: die Seite läuft offline von einem USB-Stick oder
  einem einfachen Webserver

## Entwicklung

Voraussetzung: Node.js ab 22.12.

```sh
npm install
npm run dev      # Dev-Server
npm run build    # statischer Build nach dist/
npm run preview  # gebauten Stand ansehen
npm test         # Vitest
npm run check    # astro check (Typen)
```

## Struktur

```
src/
  content/kapitel/*.mdx      Kapiteltexte
  pages/                     Startseite, Kapitel, Simulator, Werkstatt
  components/                Svelte-Visualisierungen
  lib/                       Fachlogik (hash, merkle, keys, tx, script, block, sim/)
  styles/global.css          Design-Tokens und Basistypografie
docs/SIMULATOR.md            Spezifikation des Netzwerk-Simulators
```

Regeln für die Mitarbeit stehen in `AGENTS.md`.

## Lizenz

Der Quellcode steht unter der MIT-Lizenz (`LICENSE`). Die Lehrtexte und Grafiken stehen unter
CC BY-SA 4.0 (`LICENSE-CONTENT.md`).
