# Netzwerk-Simulator: Spezifikation

Ziel: Schüler sehen ein kleines Bitcoin-Netzwerk arbeiten. Wallets senden Coins, Transaktionen
verbreiten sich über das Peer-to-Peer-Netz, Miner konkurrieren, Blöcke verbreiten sich, Ketten
gabeln sich und finden wieder zusammen, Guthaben ändern sich. Zwei Lehrszenarien kommen dazu:
gleichzeitiger Blockfund (Fork) und Double Spend mit Mehrheit der Rechenleistung (51 %).

## Aufteilung
- `src/lib/sim/` Engine, framework-frei, deterministisch (seedbarer Zufall), tickbasiert, mit Vitest-Tests.
- `src/components/sim/` Svelte-5-Oberfläche (SVG), eingebunden auf `src/pages/simulator.astro` mit `client:only="svelte"`.

## Modell (Engine)
- **World**: `tick`, `nodes`, `links`, `messagesInFlight`, `log`, `params`, `rng`.
- **Knoten** `{ id, name, kind: 'wallet' | 'full' | 'miner', peers: id[], pos: {x,y} }`.
  - *Wallet*: hängt an genau einem Full Node oder Miner (`via`), besitzt eine Adresse (Label, z. B. `alice`),
    Guthaben = Summe der UTXOs auf diese Adresse in der besten Kette ihres Knotens. Kennt bestätigte
    und unbestätigte Beträge getrennt.
  - *Full Node*: `mempool: Map<txid, Tx>`, `blocks: Map<hash, Block>`, `tip: hash`, UTXO-Menge der besten
    Kette (bei Toy-Größe nach jeder Kettenänderung ab Genesis neu berechnen ist erlaubt), validiert
    Transaktionen und Blöcke nach den vereinfachten Regeln unten, leitet Neues an alle Peers außer dem
    Absender weiter.
  - *Miner*: Full Node plus `hashrate: number`, `dishonest: boolean`, `privateChain` (nur bei dishonest).
- **Links** `{ a, b, latencyTicks }`; Nachrichten `{ kind: 'tx' | 'block', payload, from, to, arrivesAt }`.
- **Transaktion**: vereinfachtes UTXO-Modell aus `src/lib/transaction.ts`, sobald vorhanden; bis dahin eigenes
  Minimalmodell mit gleichen Feldern (`inputs[{txid, vout}]`, `outputs[{value, address}]`). `txid` = sha256d der
  kanonischen JSON-Serialisierung (via `@noble/hashes`). Gebühr = Inputs minus Outputs. Coinbase hat keinen Input.
- **Block** `{ height, prevHash, txs, merkleRoot, nonce, minerId, timestampTick, hash }`. `hash` = sha256d über
  `prevHash|merkleRoot|nonce|height`. Beim Fund sucht der Miner tatsächlich eine Nonce, deren Hash die
  Anzeige-Schwierigkeit erfüllt (Standard 12 führende Nullbits, damit sichtbar Nullen vorne stehen und die
  Suche unter 10 ms bleibt). Die *Zeit* bis zum Fund kommt nicht aus dieser Suche, sondern aus dem Zufall unten.
- **Mining-Zufall**: je Tick und Miner Bernoulli mit
  `p = hashrate / params.difficulty`; `params.difficulty` wird alle `retargetInterval` Blöcke (Standard 10) so
  angepasst, dass im Mittel alle `targetBlockTicks` (Standard 60) ein Block entsteht: neue Difficulty =
  alte × (tatsächliche Ticks / erwartete Ticks)⁻¹, begrenzt auf Faktor 4 wie in Bitcoin.
- **Blockbelohnung**: `subsidy(height)` = 50 BTC halbiert alle `halvingInterval` Blöcke (Standard 20, damit man
  es im Unterricht erlebt), plus Gebühren. Maximal `maxTxPerBlock` (Standard 5) Transaktionen, nach Gebühr sortiert.
- **Konsens**: beste Kette = größte kumulierte Arbeit (bei gleicher Difficulty = Höhe), Gleichstand: zuerst
  gesehen gewinnt. Bei Kettenwechsel (Reorganisation) wandern Transaktionen verwaister Blöcke zurück in den
  Mempool, sofern sie in der neuen Kette noch gültig sind.
- **Validierung** (deutsche Fehlermeldungen): Tx: alle Inputs sind unverbrauchte UTXOs der besten Kette und
  nicht schon im Mempool ausgegeben, Summe Outputs ≤ Summe Inputs, Werte > 0. Block: prevHash bekannt,
  erste Tx ist Coinbase mit Wert ≤ subsidy + Gebühren, alle weiteren Tx gültig gegen die UTXO-Menge an dieser
  Stelle der Kette, Hash erfüllt Anzeige-Schwierigkeit, Merkle-Root stimmt.
- **Angreifer-Modus**: ein Miner mit `dishonest = true` erhält eine Ziel-Transaktion (Double Spend): Er sendet
  öffentlich `Angreifer → Opfer`, mined privat ab dem Block davor eine Kette mit `Angreifer → Angreifer`, ohne
  seine Blöcke zu senden. Sobald seine private Kette länger ist als die öffentliche, sendet er alle Blöcke auf
  einmal; ehrliche Knoten reorganisieren. Die Engine meldet je Tick den Vorsprung (`z`) und ob der Angriff
  gelungen ist.
- **API**: `createWorld(preset, seed)`, `step(world)` (ein Tick, mutiert und liefert Ereignisse), `sendTransaction(world,
  fromWallet, toWallet, amount)`, `addMiner`, `removeNode`, `setHashrate`, `setDishonest`, `startDoubleSpend(world,
  attackerMinerId, victimWalletId, amount)`, `bestChain(node)`, `balances(node)`, `stats(world)`.
- **Presets**: `normal` (3 Wallets Alice 50 / Bob 20 / Carol 10 in der Genesis, 4 Full Nodes im Ring mit Querverbindung,
  3 Miner mit Hashrate 3/2/1), `fork` (zwei Miner mit gleicher Hashrate, hohe Latenz zwischen zwei Netzhälften),
  `attack` (Angreifer mit 55 % der Hashrate, Opfer Bob).
- **Ereignisse** (für Log und Animation): `{ tick, kind, text, nodeId?, txid?, blockHash? }` mit deutschen Texten wie
  „Alice sendet 2 BTC an Bob“, „Knoten 3 nimmt Transaktion a1b2… in den Mempool“, „Miner M1 findet Block 7 (0000f3…)“,
  „Knoten 2 wechselt auf längere Kette (Reorganisation, 1 Block verworfen)“.

### Tests (Vitest, deterministisch über Seed)
- Genesis: Guthaben Alice 50, Bob 20, Carol 10 auf jedem Knoten.
- Nach `sendTransaction(Alice→Bob 5)` und genug Ticks: Tx in jedem Mempool genau einmal, Bob unbestätigt +5.
- Ein Miner, Difficulty klein: nach 500 Ticks Höhe ≥ 3, Coinbase-Guthaben des Miners = Summe der Subsidies.
- Zwei Miner, erzwungener gleichzeitiger Fund (Test-Hook `forceBlock(minerId)` im selben Tick): Knoten sehen zwei
  Tipps gleicher Höhe; nach einem weiteren Block haben alle Knoten denselben Tip.
- Double-Spend-Test: Angreifer 60 % Hashrate, nach genügend Ticks ist die Opfer-Tx aus der besten Kette
  verschwunden und das Ereignis „Angriff gelungen“ geloggt; mit 30 % Hashrate und 2000 Ticks misslingt er in der Regel
  (Test mit festem Seed, der das zeigt).
- Retarget: mit Hashrate 6 und Zielintervall 60 liegt der Mittelwert der Blockabstände über 200 Blöcke zwischen 40 und 80 Ticks.
- Halving: Coinbase in Block 20 = 25 BTC.

## Oberfläche (Svelte)
- **Netzkarte** (SVG, links): Knoten als Kreise (Wallet mit Anfangsbuchstabe, Full Node als Sechseck, Miner als
  Sechseck mit Hashrate-Balken), Links als Linien, Nachrichten als bewegte Punkte (Tx orange, Block blau) zwischen
  Absende- und Ankunftstick interpoliert. Klick wählt einen Knoten aus. Angreifer rot umrandet.
- **Steuerung**: Start/Pause, Ein Tick, Geschwindigkeit (1 bis 20 Ticks pro Sekunde), Zurücksetzen, Szenario-Auswahl
  (Normalbetrieb, Gleichzeitiger Fund, Double Spend), Formular „Neue Transaktion“ (von, an, Betrag, Gebühr), Miner
  hinzufügen/entfernen, Hashrate je Miner, Schalter „unehrlich“.
- **Detailtafel** rechts für den gewählten Knoten: Wallet zeigt Guthaben bestätigt/unbestätigt und UTXO-Liste;
  Full Node und Miner zeigen Mempool, Kettenansicht (Blöcke als Chips mit Höhe und Kurz-Hash, Farbe je Miner,
  Gabelungen als Zweige), Statuszeile.
- **Kettenübersicht** unten: alle bekannten Blöcke als Graph (Block-DAG), beste Kette hervorgehoben, verwaiste Blöcke grau.
- **Kennzahlen**: Höhe, Difficulty, Gesamt-Hashrate, mittlerer Blockabstand, Coins im Umlauf, Anzahl Tx im Mempool.
- **Ereignisprotokoll**: letzte 50 Ereignisse mit Tick, neueste oben, klickbare Tx/Block-Kürzel heben das Element hervor.
- Erklärkasten oben mit drei Sätzen, was man sieht, und drei Aufgaben („Sende Alice → Bob und verfolge den Punkt“,
  „Gib einem Miner die doppelte Hashrate“, „Starte das Szenario Double Spend und beobachte Bobs Bestätigungen“).
- Mobil: Karte oben, Tafeln darunter; keine horizontale Scrollleiste bei 360 px.
- Barrierefreiheit: alle Steuerelemente sind echte Buttons/Inputs mit Label, Live-Region für das Protokoll.
