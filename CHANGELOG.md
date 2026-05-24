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
