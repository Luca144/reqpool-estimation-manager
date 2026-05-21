# ReqPOOL Estimation Manager

Parametrischer Aufwandsschätzer für Requirements-Engineering-Projekte der ReqPOOL.
Web-App auf Basis von Vanilla HTML/CSS/JavaScript, deployt via GitHub Pages.

> Status: in Entwicklung. Diese README wird in Schritt 16 finalisiert.

## Überblick

Ein Drei-Schritt-Wizard für ReqPOOL-Senior-Berater:

1. **Projektkontext** — Projektname, Kunde, Projekttyp, geplante Eckdaten.
2. **Systemparameter** — die 8 Pflicht-Parameter (Pages, Use Cases, Business Objects,
   Interfaces, Batches, Languages, Roles, Users). Live-Preview rechts in der Sidebar.
3. **Ergebnis** — animierter PT-Counter, Kosten-Range in EUR, Donut-Chart der
   Phasen-Aufteilung, auto-generierte Annahmen und Risiken, Sensitivity-Slider,
   PDF-Export.

Die Berechnungslogik liegt isoliert in [`js/estimation.js`](./js/estimation.js) und ist
pur funktional (keine DOM-Abhängigkeiten), wodurch sie als Single Source of Truth direkt
testbar ist.

## Tech-Stack

- Vanilla HTML, CSS, JavaScript (ES-Modules) — kein Build-Step, kein Framework
- [Tailwind CSS](https://tailwindcss.com/) via CDN
- [Chart.js](https://www.chartjs.org/) via CDN
- [jsPDF](https://github.com/parallax/jsPDF) + [html2canvas](https://html2canvas.hertzen.com/) via CDN
- [Vitest](https://vitest.dev/) für Unit-Tests (devDependency)

## Setup

```bash
# Dependencies (nur für Tests, nicht für die App selbst)
npm install

# Tests einmalig ausführen
npm test

# Tests im Watch-Modus
npm run test:watch
```

Die App selbst hat **keine** Build- oder Install-Schritte. `index.html` direkt im
Browser öffnen reicht — alle Runtime-Libraries kommen via CDN.

### Lokal entwickeln

Für lokale Entwicklung am einfachsten ein statischer HTTP-Server:

```bash
# Beispiel mit Python (jeder andere statische Server tut es auch)
python -m http.server 8000
```

Dann [http://localhost:8000](http://localhost:8000) öffnen. ES-Module benötigen ein
`http://`-Schema; das direkte Öffnen via `file://` funktioniert in einigen Browsern
nicht.

## Projektstruktur

```
/
├── index.html              # Single-page Wizard
├── css/
│   ├── reset.css           # Modern CSS Reset
│   ├── tokens.css          # CSS-Variablen (Farben, Spacing, Typo)
│   ├── components.css      # Buttons, Inputs, Cards, etc.
│   ├── wizard.css          # Step-spezifische Styles
│   └── print.css           # PDF/Print-Styles
├── js/
│   ├── estimation.js       # Pure Berechnungsfunktionen (testbar)
│   ├── assumptions.js      # Regel-Engine Annahmen
│   ├── risks.js            # Regel-Engine Risiken
│   ├── wizard.js           # Einstiegspunkt, State, Step-Navigation
│   ├── ui.js               # DOM, Live-Preview, Animationen
│   ├── charts.js           # Chart.js-Setup
│   ├── pdf.js              # PDF-Export-Logik
│   └── validation.js       # Input-Validation
├── tests/
│   ├── estimation.test.js
│   ├── assumptions.test.js
│   ├── risks.test.js
│   ├── validation.test.js
│   └── manual-checklist.md # Manuelle Test-Checkliste für die Demo
├── .github/workflows/
│   └── test.yml            # CI: Tests bei Push / PR
├── package.json            # devDependencies (Vitest)
└── README.md
```

## Deployment

GitHub Pages, deployt vom Repo-Root des Branches `main`:

1. Repo auf GitHub anlegen (Public, Name `reqpool-estimation-manager`).
2. Lokal pushen.
3. In Repo-Settings → Pages → Source: **Deploy from a branch** → Branch `main`, Folder `/` (root).
4. Live-URL: `https://<username>.github.io/reqpool-estimation-manager/`
5. Initiales Deployment dauert 1–2 Minuten.

Wichtig: Alle Pfade in HTML/CSS/JS sind **relative Pfade** (`./css/...`), damit das
unter dem Subpfad von GitHub Pages funktioniert.

## Branding

Farben und Designprinzipien siehe [`css/tokens.css`](./css/tokens.css) — Royal Blue als
Hauptakzent, Grün als Sekundär-Akzent, keine Farbverläufe (CI-Vorgabe).
