# Manuelle Test-Checkliste

## Schnellcheck vor Demo (5–10 Min)

Diese Checkliste deckt alle User-sichtbaren Features ab. Reihenfolge ist zum
linearen Durchklicken optimiert — von oben nach unten arbeiten.

---

### Setup

- [ ] Lokaler Server läuft: `py -m http.server 8000` (im Repo-Root)
- [ ] Browser auf `http://localhost:8000/` (Inkognito empfohlen, damit
      Extensions keine Konsolen-Errors werfen)
- [ ] DevTools-Konsole offen → **keine roten Errors beim Page-Load**
- [ ] Netzwerk-Tab: alle CDNs (Chart.js, jsPDF) liefern HTTP 200, kein 404 auf
      CSS/JS-Pfade

---

### Step 1 — Projektkontext

- [ ] **Pflichtfelder leer + „Weiter"** → Fehlertexte unter Projektname,
      Kundenname und Projekttyp; Page scrollt smooth zum ersten Fehler;
      roter Border um die kaputten Felder
- [ ] Während des Tippens in einem Feld mit Fehler → Fehler verschwindet
      sofort, Border wieder normal
- [ ] Whitespace-only-Eingabe in Projektname (z.B. `"   "`) → wird als leer
      gewertet, „Pflichtfeld"-Fehler erscheint
- [ ] Projekttyp-Select: „Bitte wählen…" ist initial selektiert und disabled;
      die drei Optionen Greenfield/Brownfield/Migration sind verfügbar
- [ ] „Geplanter Start" als Date-Picker funktioniert (Browser-native)
- [ ] Alle Felder gültig + „Weiter" → Slide-in-Animation zu Step 2,
      Progress-Indikator: 1 wird grün abgehakt, 2 wird Royal-Blue aktiv

---

### Step 2 — Systemparameter

- [ ] Alle Pflichtfelder leer + „Schätzung berechnen" → 8 Fehlertexte;
      Smooth-Scroll zum ersten Feld
- [ ] Number-Input außerhalb min/max (z.B. Pages = `1500`) → bei Submit
      Browser-native-Tooltip ODER unser Custom-Error („darf höchstens 1000
      sein") — beides akzeptabel, kein Crash
- [ ] Negative Zahl im Number-Input (z.B. Pages = `-5`) → `below-min`-Fehler
- [ ] Kommazahl im Number-Input (z.B. Pages = `3.5`) → `not-integer`-Fehler
- [ ] **Live-Preview rechts** updates während der Eingabe (mit 300ms Debounce):
      - Bei 10 Use Cases: Sidebar zeigt etwa `25 PT` (Greenfield-Default)
      - Bei allen Mittel-Werten (siehe unten): `109,1 PT / 130.928 €`
- [ ] Live-Preview bleibt ohne Anzeige (`— PT / — EUR`), solange noch nichts
      eingegeben wurde
- [ ] „Zurück" → Step 1, Werte sind erhalten
- [ ] Wieder „Weiter" → Step 2, Werte aus Step 1 noch da; Live-Preview
      aktualisiert sich beim erneuten Eintritt automatisch
- [ ] Alle Felder gültig + „Schätzung berechnen" → Slide-in zu Step 3

---

### Step 3 — Schätzung (Ergebnis)

- [ ] **Counter-Animation:** PT-Zahl zählt von 0 auf den Zielwert hoch
      (~1,2 Sekunden, mit weichem Auslaufen)
- [ ] Cost-Range zeigt drei EUR-Beträge (Min – Likely – Max) im de-DE-Format
      (Punkt als Tausender-Trennzeichen, z.B. `130.928 €`)
- [ ] **Donut-Chart:** 6 Segmente in ReqPOOL-Farben (Royal-Blue / Green
      alternierend), Legende rechts mit den Phasennamen
- [ ] Hover auf Donut-Segment → Tooltip mit z.B.
      `Spezifikation: 38,2 PT (35,0%)`
- [ ] **Annahmen-Liste**: mindestens 3 Einträge (Always-Regeln), bei Mittel-
      Brownfield 9 Einträge
- [ ] **Risiken-Liste**: Items haben Severity-Akzent (Border-Left in
      unterschiedlicher Farbe). Bei Mittel-Greenfield: leerere Liste oder
      „Keine spezifischen Risiken…"; bei Groß-Migration: 6 Items
- [ ] **Sensitivitäts-Slider**: drei Slider erscheinen mit den Top-3-Cost-
      Drivern
      - Mittel-Greenfield: Use Cases / Business Objects / Pages
      - Groß-Migration: Users / Use Cases / Business Objects
- [ ] **Slider-Drag updaten live**: PT-Counter, Cost-Range und Donut
      aktualisieren sich beim Ziehen ohne Flackern
- [ ] **Modifizierter Slider-Wert** wird Royal-Blue + bold, unmodifizierte
      Werte bleiben muted-grey
- [ ] Hinweis: Donut-Aufteilung bleibt **visuell konstant** beim Slidern, weil
      die Phasenanteile fix sind (12/28/35/15/5/5). Das ist by design — nur
      die absoluten PT-Werte ändern sich (sichtbar im Tooltip)
- [ ] „Werte zurücksetzen" → alle Slider zurück auf Original, Highlight weg,
      Counter/Cost-Range/Donut zurück auf Original-Werte
- [ ] **Scope-Box**: 7 Items unter „Enthalten" (Green-Akzent), 7 unter „Nicht
      enthalten" (Grey-Akzent)

---

### PDF-Export

- [ ] „Als PDF exportieren" → Button geht kurz auf „Generiere PDF…" und
      disabled, dann Download startet automatisch
- [ ] Dateiname-Pattern: `ReqPOOL_Aufwandsschaetzung_<Projektname>_<YYYY-MM-DD>.pdf`
- [ ] Bei Projektname mit Umlauten („Schöne Müller"): Dateiname enthält
      `Schoene_Mueller`
- [ ] PDF öffnen — **A4, Text mit Maus markierbar** (kein gerastertes Bild)
- [ ] Inhalt von oben nach unten:
  - [ ] Header: „REQPOOL" links, Datum rechts, Royal-Blue-Akzentlinie
  - [ ] Titel: „Aufwandsschätzung Requirements Engineering"
  - [ ] Projektname (Royal-Blue), Kunde, Projekttyp, „Erstellt am…"
  - [ ] Gesamtaufwand-Box mit großer PT-Zahl + EUR + Range-Zeile
  - [ ] Section SYSTEMPARAMETER mit allen 8 Werten
  - [ ] Section PHASENAUFTEILUNG mit 6 Phasen + PT + %
  - [ ] Section ANNAHMEN mit Bullet-Liste
  - [ ] Section RISIKEN mit `[HOCH]/[MITTEL]/[NIEDRIG]`-Prefixen
  - [ ] Section LEISTUNGSUMFANG mit „Enthalten" + „Nicht enthalten"
  - [ ] Footer auf jeder Seite: Disclaimer + „ReqPOOL GmbH" + „Seite X/N"
- [ ] **PDF nach Sensitivity-Modifikation**: Slider verschieben, dann
      exportieren → unter der Total-Box steht der italic-Hinweis
      „Hinweis: Diese Schätzung enthält manuell angepasste Parameter…"
- [ ] PDF ohne Modifikation: Hinweis fehlt

---

### Reset & Navigation

- [ ] „Neue Schätzung" (in Step 3) → Wizard springt zurück zu Step 1, alle
      Form-Felder leer, Projekttyp wieder auf „Bitte wählen…"
- [ ] Bei nochmaligem Durchklick: Step 3 zeigt korrekt die NEUEN Werte
      (kein Geister-Donut, keine alten Annahmen/Risiken, kein veralteter
      PT-Counter beim Step-Eintritt)
- [ ] Progress-Indikator zeigt nach Reset wieder Step 1 als aktiv, 2/3
      ohne Done-Häkchen

---

### Edge Cases

- [ ] Cross-Browser: **Chrome** (Primary), **Firefox** (Secondary). PDF-
      Generation und Donut-Tooltips in beiden testen
- [ ] **Mobile-Layout** via DevTools (Strg+Shift+M):
  - [ ] 375 × 667 (iPhone SE): einspaltiges Layout in allen Steps; Live-
        Preview erscheint OBEN auf Step 2 als Sticky-Bar; Buttons gut
        klickbar; keine horizontalen Scrollbalken
  - [ ] 768 × 1024 (iPad): step2-layout einspaltig (Live-Preview oben),
        Result-Sections aufeinander gestapelt
- [ ] **Sehr langer Projektname** (60+ Zeichen) → PDF wrappt den Namen
      sauber, kein Margin-Overflow
- [ ] **Sehr langer Kundenname** → analog: wrappt im PDF
- [ ] **Tab-Navigation**: durch alle Felder in sinnvoller Reihenfolge;
      jedes Feld zeigt Royal-Blue-Focus-Ring
- [ ] **Reduce-Motion** (Windows: Einstellungen → Barrierefreiheit →
      Visuelle Effekte → „Animationseffekte" deaktivieren): kein Counter-
      Hochzählen (springt direkt auf Endwert), keine Step-Slide-Animation,
      Donut erscheint ohne Anim-Phase

---

### Demo-Datenkombinationen zum Durchklicken

Greenfield ist der Default-Projekttyp im Slider-Verhalten. Für die Demo
empfehlen sich diese drei zum Show-and-Tell, weil sie unterschiedliche
Größenordnungen + Severity-Profile produzieren:

| Größe   | Pages | UseCases | BusinessObjects | Interfaces | Batches | Languages | Roles | Users | Projekttyp |
|---------|-------|----------|------------------|------------|---------|-----------|-------|-------|------------|
| **Klein**  | 5     | 3        | 4                | 1          | 0       | 1         | 2     | 20    | Greenfield |
| **Mittel** | 15    | 10       | 12               | 4          | 2       | 2         | 5     | 150   | Greenfield |
| **Groß**   | 40    | 25       | 30               | 10         | 5       | 3         | 12    | 800   | Migration  |

Erwartete Ergebnisse (Likely-Wert, gerundet):

| Größe   | Likely PT | Likely €     | Top-3-Slider                       |
|---------|-----------|--------------|------------------------------------|
| Klein   | ~29       | ~34.800 €    | Use Cases / Business Objects / Pages |
| Mittel  | ~109      | ~131.000 €   | Use Cases / Business Objects / Pages |
| Groß    | ~414      | ~496.500 €   | Users / Use Cases / Business Objects |

---

### Known issues / Bewusst nicht gefixt

- **Browser-Extension-Errors** in der Konsole (z.B. „The message port closed
  before a response was received") kommen von Adblockern/Password-Managern,
  nicht aus unserem Code. Für die Demo Inkognito-Fenster verwenden.
- **Donut-Aufteilung bleibt visuell konstant beim Slidern.** Phasenanteile
  sind eine RE-Methodik-Konstante (12/28/35/15/5/5) und ändern sich nicht
  mit Projekt-Parametern. Nur die absoluten PT pro Phase (im Tooltip).
- Bei Locale-Browsern, die Komma im Number-Input akzeptieren: das Verhalten
  hängt vom Browser ab. Chrome/Firefox geben in `.value` den kanonischen
  Punkt zurück — funktioniert.
