# Manuelle Test-Checkliste

Diese Checkliste wird vor der Demo (morgen früh) in ca. 5 Minuten durchgeklickt.
Die finalen Items werden in Schritt 14 (Manuelle Test-Checkliste durchgehen) ergänzt
und an die echte UI angepasst.

## Wizard-Flow

- [ ] Step 1: Projektname leer lassen, "Weiter" klicken → Fehler erscheint
- [ ] Step 1: Alle Pflichtfelder ausfüllen → "Weiter" funktioniert
- [ ] Step 2: Use Cases = 10 eingeben → Live-Preview zeigt ~25 PT Base
- [ ] Step 2: Alle 8 Parameter mit Werten füllen → "Schätzung berechnen" wird klickbar
- [ ] Step 3: Counter zählt von 0 hoch zur Endsumme
- [ ] Step 3: Donut-Chart zeigt 6 Phasen mit Prozenten
- [ ] Step 3: Annahmen-Liste enthält mindestens 5 Einträge
- [ ] Step 3: Risiken-Liste enthält mindestens 1 Eintrag bei interfaces=8
- [ ] Step 3: Sensitivity-Slider verändert PT-Range live
- [ ] Step 3: PDF-Export öffnet PDF mit allen Inhalten
- [ ] Step 3: "Neue Schätzung" setzt Wizard zurück

## Cross-Browser / Cross-Device

- [ ] Funktioniert in Chrome
- [ ] Funktioniert in Firefox
- [ ] Funktioniert in Safari
- [ ] Layout funktioniert auf 375px Breite (Mobile)
- [ ] PDF sieht im Layout sauber aus, keine abgeschnittenen Elemente

## Test-Datenkombinationen für die Demo

| Größe   | Pages | UseCases | BusinessObjects | Interfaces | Batches | Languages | Roles | Users |
|---------|-------|----------|------------------|------------|---------|-----------|-------|-------|
| Klein   | 5     | 3        | 4                | 1          | 0       | 1         | 2     | 20    |
| Mittel  | 15    | 10       | 12               | 4          | 2       | 2         | 5     | 150   |
| Groß    | 40    | 25       | 30               | 10         | 5       | 3         | 12    | 800   |

Jede Kombination muss sinnvolle PT-Ergebnisse liefern und korrekte Annahmen/Risiken triggern.
