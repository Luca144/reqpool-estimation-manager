# Changelog

Alle nutzersichtbaren und maintainer-relevanten Änderungen am ReqPOOL
Estimation Manager werden in dieser Datei dokumentiert.

Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

Granularität: User-sichtbare Änderungen und für Maintainer relevante
Architektur-Umzüge. Reine Code-Hygiene und kosmetische Refactorings werden
nicht aufgeführt.

## [Unreleased]

### Added

- **Polish: Hero-Reveal und Live-Pulse in Step 3** — beim Eintritt zu Step
  3 erscheinen Counter, Kosten-Range, Donut, Timeline, Sensitivity,
  Annahmen, Risiken und Scope nicht mehr schlagartig, sondern gestaffelt
  mit feinem Fade-in (opacity + leichtes translateY) im 100–200 ms-Raster.
  Bei Slider- oder Scope-Änderungen pulsen PT-Counter (Royal-Blue-Glow),
  Kosten-Range (Opacity-Bounce) und Donut (subtile Skalierung) kurz auf,
  damit das visuelle Feedback nicht untergeht. Alle Effekte respektieren
  `prefers-reduced-motion`.
- **Beratungs-Termin-Modal nach PDF-Export** — Lead-Funnel-Mock: nach
  erfolgreichem PDF-Download öffnet sich automatisch ein Modal, in dem
  der User einen Beratungstermin in einem 5-Werktag-Raster (15-Min-Slots,
  9:00–12:00 und 13:30–17:00) auswählen und ein Kontaktformular (Name,
  E-Mail, Firma) absenden kann. Belegt-Pattern deterministisch via
  `generateCalendarSlots` in `js/calendar-mock.js` und `BUSY_PATTERN`
  in `config.js` (Mi-Vormittag relativ frei, Fr-Nachmittag stark
  belegt, Mittagspause immer belegt, …). Empfohlener Slot wird mit
  subtilem Royal-Blue-Pulse hervorgehoben (deaktiviert bei
  `prefers-reduced-motion`). Submit triggert ein Confirmation-Modal mit
  expliziter Konzept-Vorschlag-Hinweis (in der Live-Variante würde
  Cal.com o.Ä. eingebunden).
- **Indikative Timeline in Step 3** — neue Section unter dem Donut zeigt
  die Phasen seriell auf einer Werktag-Achse: pro Phase eine Zeile mit
  Phasenname, horizontalem Balken (alternierend Royal-Blue/Green) und
  Datum-Range. Berechnung über `computeTimeline(phases, startDate,
  consultantCount)` in `js/timeline.js`: `durationDays = ceil(pt /
  consultantCount)`, mindestens 1 Werktag pro Phase, Wochenenden werden
  übersprungen (Feiertage absichtlich nicht — vereinfacht). Reagiert
  live auf Berater-Slider, Sensitivity-Slider und Scope-Toggle. Wenn in
  Step 1 ein „Geplanter Start" gesetzt ist, wird dieser als Startdatum
  verwendet; sonst „heute".
- **Scope-Konfigurator in Step 3** — die bisher statische „Enthalten / Nicht
  enthalten"-Box wurde durch einen interaktiven Konfigurator ersetzt. 18
  kuratierte Leistungs-Items in fünf Kategorien (Erhebung, Spezifikation,
  Review, Übergabe, Optional/Spezial) sind als Toggle-Buttons abgebildet.
  Click verschiebt das Item zwischen den beiden Spalten und passt die
  Schätzung live an: Aktivierung eines optionalen Items addiert dessen
  Default-PT-Wert auf den Gesamtaufwand, Deaktivierung eines Standard-
  Items subtrahiert ihn. Counter, Cost-Range, Donut und Machbarkeits-
  Karte updaten alle synchron. Beim PDF-Export werden die dynamischen
  Listen statt der bisherigen statischen verwendet. Item-Katalog in
  `config.js` (`SCOPE_ITEMS`), Pure-Logic in `js/scope.js`.
- **Geplante-Dauer-Slider direkt in Step 3** — zusätzlich zum Berater-Slider
  gibt es im Machbarkeits-Block einen zweiten Slider „Geplante Dauer
  (Monate)" (Range 1–36, mit dynamischer Ober-Anhebung wenn der Step-1-
  Wert höher ist). Bewegung des Sliders aktualisiert sowohl die
  Machbarkeits-Karte als auch das Step-1-Input bidirektional — der User
  muss nicht mehr zwischen Steps wechseln, um die Plan-Annahmen zu
  variieren. Der Block bleibt weiterhin versteckt, solange in Step 1
  keine Dauer eingegeben wurde.
- **Erweiterte Sensitivity-Slider** — unter den drei Top-Slidern in Step 3
  gibt es jetzt einen aufklappbaren Bereich „Weitere Parameter anpassen",
  der die übrigen fünf Parameter als zusätzliche Slider anbietet. Damit
  lassen sich alle acht Systemparameter live justieren, ohne den
  Hauptbereich zu überladen. Browser-native `<details>`/`<summary>` ohne
  eigenes JS-Toggle. Reset-Button räumt auch die zusätzlichen Slider mit
  auf. Neue Helper-Funktion `getAllDriversSorted(params)` in
  `js/sensitivity.js`.
- **Konfigurierbarer Tagessatz** — Zahnrad-Icon oben rechts im Header
  öffnet ein Settings-Modal, in dem der User den Tagessatz (Default
  1.200 €, max 10.000 €) für die EUR-Umrechnung überschreiben kann.
  Der Wert wird lokal im Browser gespeichert (localStorage) und bleibt
  über Page-Reloads erhalten. Bei aktivem Step 3 werden Counter,
  Cost-Range, Chart und Feasibility-Karte sofort mit dem neuen Wert
  live neu berechnet. „Auf Standard zurücksetzen"-Button im Modal
  entfernt den Override wieder. Helper `getTagessatz()` /
  `setTagessatz()` / `resetTagessatz()` in `js/config.js`.
- **Machbarkeits-Check in Step 3** — ein neuer Block unter „Schritt 3:
  Schätzung" vergleicht die geplante Projektdauer aus Step 1 mit der
  errechneten realistischen Dauer und zeigt eine Ampel (grün / blau /
  rot mit Indikator). Berater-Slider (1–10, Default 2) erlaubt
  Was-wäre-wenn-Spielen. Block bleibt automatisch versteckt, wenn in
  Step 1 keine geplante Dauer angegeben wurde. Reagiert live auf
  Sensitivity-Slider-Bewegungen, weil sie den Gesamtaufwand verändern.
  Pure-Logic in `js/feasibility.js` (`assessFeasibility(totalPT,
  plannedMonths, consultantCount)`).

### Changed

- **Architektur** — Schätzformel-Konstanten und Default-Tagessatz zentral in
  `js/config.js` verschoben. Maintainer können Gewichte
  (`WEIGHTS`), User-Skalierung (`USER_SCALING_THRESHOLDS`),
  Projekttyp-Multiplikatoren (`PROJECT_TYPE_MULTIPLIERS`),
  Komplexitäts-Puffer (`COMPLEXITY_BUFFER`), Range-Faktoren
  (`RANGE_FACTORS`), Phasen-Aufteilung (`PHASE_DISTRIBUTION`) und Default-
  Tagessatz (`DEFAULT_TAGESSATZ`) jetzt an einer einzigen Stelle anpassen,
  ohne `estimation.js` anzufassen. `estimation.js` ist reine Berechnungslogik.
- `TAGESSATZ_EUR` wurde in `DEFAULT_TAGESSATZ` umbenannt — eindeutiger im
  Hinblick auf die kommende User-Override-Funktion (Sprint-2-A2).
