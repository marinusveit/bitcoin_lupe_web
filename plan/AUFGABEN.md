# Backlog bitcoin_lupe_web

Offene Blöcke, so beschrieben, dass eine neue Session ohne Rückfrage starten kann. Erledigte Blöcke löschen.

## Braucht Marinus (Entscheidungen)

- **Nullen-Hervorhebung vereinheitlichen?** MiningDemo, BlockDemo und KettenDemo markieren führende Nullen mit einer lokalen Klasse `.z` (fetter Farbtext, in KettenDemo rot bei ungültig); `global.css` hat `.nullen` (farbig hinterlegter Block, in HashHero). Eine Klasse für alle wäre weniger CSS, ändert aber die Optik einer der beiden Seiten. Umfang: 15 LOC.
- **HashHero-Suche in den Web Worker?** `HashHero.svelte` sucht die Nonce weiter im Hauptthread (jetzt über `mineText` mit Midstate, im Mittel 4096 Hashes). Die AGENTS-Regel verlangt den Worker; `HashHero.test.ts` erwartet das Ergebnis aber synchron nach dem Klick und jsdom hat keinen Worker. Für den Worker muss der Test auf `await` umgestellt werden (Teständerung, deshalb Freigabe). Umfang: 30 LOC plus Test.
- **Nur in Tests genutzte Lib-Funktionen behalten?** `retarget`, `difficulty`, `wif`, `negate`, `hammingDistanceHex` und fünf weitere in `src/lib` haben keinen Verwender außer ihren Tests (Liste: Simplify-Bericht 25.09.2026, Abschnitt D). Behalten, wenn `src/lib` als Fachbibliothek zur Bachelorarbeit gedacht ist.

## Offene Vorschläge aus dem Review vom 25.09.2026 (nicht umgesetzt, weil Verhaltens- oder Schnittstellenänderung)

- `buildPayment` in `src/lib/sim/tx.ts` mit Dust-Option und `parseBtcAmount` in `src/lib`, damit TransaktionsDemo und TxFormular dieselbe Regel nutzen (heute rundet TxFormular still). Seed-Tests in `world.test.ts` müssen grün bleiben. Umfang: 60 LOC.
- `verifyTx(utxos, tx)` in `src/lib/transaction.ts` (validateTx plus Skriptausführung je Input), TransaktionsDemo ruft nur noch auf. Umfang: 40 LOC.
- `checkHeaderPow(header)` in `src/lib/block.ts`, BlockDemo prüft Wertebereiche nicht mehr selbst. Umfang: 40 LOC.
- `ScriptStep.consumed` in `src/lib/script.ts`, damit SkriptDemo bei OP_EQUALVERIFY nicht den Vorschritt lesen muss. Umfang: 20 LOC.
- `NetzwerkDemo.svelte` streichen und in `07-netzwerk.mdx` direkt `Simulator compact` einbinden. Umfang: 10 LOC.
