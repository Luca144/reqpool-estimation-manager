# Changelog

Alle nutzersichtbaren und maintainer-relevanten Änderungen am ReqPOOL
Estimation Manager werden in dieser Datei dokumentiert.

Format orientiert sich an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung folgt [Semantic Versioning](https://semver.org/lang/de/).

Granularität: User-sichtbare Änderungen und für Maintainer relevante
Architektur-Umzüge. Reine Code-Hygiene und kosmetische Refactorings werden
nicht aufgeführt.

## [Unreleased]

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
