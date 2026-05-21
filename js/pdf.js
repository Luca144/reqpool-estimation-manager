/**
 * pdf.js — A4-PDF-Export der Schätzung via jsPDF (programmatisches Layout).
 *
 * Bewusst KEIN html2canvas: das würde ein gerastertes Bild produzieren, das
 * unscharf, groß und nicht durchsuchbar ist. Programmatisches jsPDF liefert ein
 * vektorisiertes, schlankes, durchsuchbares PDF — die seriöse Variante.
 *
 * jsPDF wird via CDN als `window.jspdf.jsPDF` erwartet (siehe index.html).
 */

import { formatPT, formatEUR } from './ui.js';
import { FIELD_LABELS } from './validation.js';

// ─────────────────────────────────────────────────────────────────────────────
// Layout-Konstanten
// ─────────────────────────────────────────────────────────────────────────────

const PAGE = Object.freeze({
  width: 210,
  height: 297,
  marginTop: 18,
  marginBottom: 22,
  marginLeft: 20,
  marginRight: 20,
});

const CONTENT_LEFT = PAGE.marginLeft;
const CONTENT_RIGHT = PAGE.width - PAGE.marginRight;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const PAGE_BREAK_THRESHOLD = PAGE.height - PAGE.marginBottom;

const COLORS = Object.freeze({
  royalBlue: [0, 46, 177],
  royalBlueBoxBg: [242, 245, 251],
  greenDark: [15, 122, 77],
  text: [11, 18, 32],
  muted: [85, 109, 115],
  border: [228, 231, 236],
  danger: [192, 39, 60],
  white: [255, 255, 255],
});

const SEVERITY_LABELS = Object.freeze({
  high: 'HOCH',
  medium: 'MITTEL',
  low: 'NIEDRIG',
});

const PARAM_ORDER = Object.freeze([
  'pages', 'useCases', 'businessObjects', 'interfaces',
  'batches', 'languages', 'roles', 'users',
]);

const PROJECT_TYPE_LABELS = Object.freeze({
  Greenfield: 'Greenfield',
  Brownfield: 'Brownfield',
  Migration: 'Migration',
});

const SCOPE_IN = Object.freeze([
  'Stakeholder-Analyse und Stakeholder-Interviews',
  'Anforderungserhebung in moderierten Workshops',
  'Erstellung Lastenheft und Use-Case-Spezifikationen',
  'Erstellung Schnittstellenbeschreibungen',
  'Definition Abnahmekriterien',
  'Reviewzyklen mit Fachbereich',
  'Projektmanagement durch ReqPOOL',
]);

const SCOPE_OUT = Object.freeze([
  'Software-Implementierung',
  'Testdurchführung (Testfälle werden spezifiziert, nicht ausgeführt)',
  'Betrieb und Wartung',
  'Datenmigration (bei Migrationsprojekten separat zu skopieren)',
  'Change-Management und Schulungen',
  'Lizenzkosten Drittsoftware',
  'Hardware-Beschaffung',
]);

const FOOTER_LINES = Object.freeze([
  'Diese Schätzung basiert auf parametrischer Aufwandsberechnung nach ReqPOOL-Methodik.',
  'Verbindliche Angebote nach detaillierter Anforderungsanalyse.',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Filename-Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Macht einen String dateinamen-tauglich: Umlaute ausschreiben, Sonderzeichen
 * durch Underscore ersetzen, Mehrfach-Underscores zusammenfassen, trim.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name) {
  if (typeof name !== 'string') return '';
  return name
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Formatiert ein Date als "DD.MM.YYYY" (für Anzeige) bzw. "YYYY-MM-DD" (für Filename).
 */
function formatDateGerman(date = new Date()) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
}

function formatDateIso(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF-Builder
// ─────────────────────────────────────────────────────────────────────────────

class PDFBuilder {
  constructor() {
    const jsPDF = window.jspdf?.jsPDF;
    if (typeof jsPDF !== 'function') {
      throw new Error('jsPDF (window.jspdf.jsPDF) ist nicht verfügbar.');
    }
    this.doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    this.y = PAGE.marginTop;
    this.pageNum = 1;
    this.todayLong = formatDateGerman();
  }

  /** Setzt Font + Size + Color in einem Schritt. */
  font({ size, style = 'normal', color = COLORS.text }) {
    this.doc.setFontSize(size);
    this.doc.setFont('helvetica', style);
    this.doc.setTextColor(color[0], color[1], color[2]);
  }

  text(str, x, opts = {}) {
    this.font({
      size: opts.size ?? 10,
      style: opts.style ?? 'normal',
      color: opts.color ?? COLORS.text,
    });
    this.doc.text(String(str), x, this.y, { align: opts.align ?? 'left' });
  }

  /** Bewegt y nach unten. */
  advance(mm) {
    this.y += mm;
  }

  /** Stellt sicher, dass für `neededHeight` mm noch Platz auf der Seite ist. */
  checkBreak(neededHeight) {
    if (this.y + neededHeight > PAGE_BREAK_THRESHOLD) {
      this.doc.addPage();
      this.pageNum += 1;
      this.y = PAGE.marginTop;
      this.drawPageHeader();
    }
  }

  drawPageHeader() {
    // "REQPOOL" links bold royal-blue, Datum rechts grau.
    this.font({ size: 12, style: 'bold', color: COLORS.royalBlue });
    this.doc.text('REQPOOL', CONTENT_LEFT, this.y);
    this.font({ size: 9, color: COLORS.muted });
    this.doc.text(this.todayLong, CONTENT_RIGHT, this.y, { align: 'right' });
    this.advance(4);

    // Royal-Blue-Akzentlinie.
    this.doc.setDrawColor(COLORS.royalBlue[0], COLORS.royalBlue[1], COLORS.royalBlue[2]);
    this.doc.setLineWidth(0.6);
    this.doc.line(CONTENT_LEFT, this.y, CONTENT_RIGHT, this.y);
    this.advance(8);
  }

  drawTitle(projectInfo) {
    this.text('Aufwandsschätzung Requirements Engineering', CONTENT_LEFT, {
      size: 18, style: 'bold', color: COLORS.text,
    });
    this.advance(8);

    if (projectInfo.projectName) {
      this.text(projectInfo.projectName, CONTENT_LEFT, {
        size: 14, style: 'bold', color: COLORS.royalBlue,
      });
      this.advance(6);
    }

    const metaLines = [];
    if (projectInfo.customerName) {
      metaLines.push(`Kunde: ${projectInfo.customerName}`);
    }
    if (projectInfo.projectType) {
      const typeLabel = PROJECT_TYPE_LABELS[projectInfo.projectType] ?? projectInfo.projectType;
      metaLines.push(`Projekttyp: ${typeLabel}`);
    }
    metaLines.push(`Erstellt am ${this.todayLong}`);

    for (const line of metaLines) {
      this.text(line, CONTENT_LEFT, { size: 10, color: COLORS.muted });
      this.advance(5);
    }
    this.advance(4);
  }

  drawTotalBox(estimation, sensitivityModified) {
    const boxHeight = 28;
    this.checkBreak(boxHeight + 6);

    // Hintergrund-Box (Royal-Blue-05).
    this.doc.setFillColor(...COLORS.royalBlueBoxBg);
    this.doc.rect(CONTENT_LEFT, this.y, CONTENT_WIDTH, boxHeight, 'F');
    // Akzent-Streifen links (Royal-Blue, 1.5mm breit).
    this.doc.setFillColor(...COLORS.royalBlue);
    this.doc.rect(CONTENT_LEFT, this.y, 1.5, boxHeight, 'F');

    const innerLeft = CONTENT_LEFT + 6;
    const headerY = this.y + 7;
    const valueY = this.y + 15;
    const rangeY = this.y + 23;

    // "GESAMTAUFWAND"-Caption.
    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(...COLORS.muted);
    this.doc.text('GESAMTAUFWAND', innerLeft, headerY);

    // Großer PT-Wert.
    this.doc.setFontSize(18);
    this.doc.setTextColor(...COLORS.royalBlue);
    this.doc.text(`${formatPT(estimation.likely)} PT`, innerLeft, valueY);

    // Likely-EUR-Wert (rechts daneben, grün).
    this.doc.setFontSize(14);
    this.doc.setTextColor(...COLORS.greenDark);
    this.doc.text(formatEUR(estimation.costs.likely), innerLeft + 50, valueY);

    // Range-Zeile.
    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(...COLORS.muted);
    const rangePt = `Range: ${formatPT(estimation.min)}–${formatPT(estimation.max)} PT`;
    const rangeEur = `${formatEUR(estimation.costs.min)} – ${formatEUR(estimation.costs.max)}`;
    this.doc.text(`${rangePt}  |  ${rangeEur}`, innerLeft, rangeY);

    this.y += boxHeight + 4;

    if (sensitivityModified) {
      this.font({ size: 9, style: 'italic', color: COLORS.royalBlue });
      const hint = 'Hinweis: Diese Schätzung enthält manuell angepasste Parameter gegenüber den ursprünglich erfassten Werten.';
      const lines = this.doc.splitTextToSize(hint, CONTENT_WIDTH);
      for (const line of lines) {
        this.doc.text(line, CONTENT_LEFT, this.y);
        this.advance(4.5);
      }
    }
    this.advance(4);
  }

  drawSectionHeading(label) {
    this.checkBreak(10);
    this.text(label.toUpperCase(), CONTENT_LEFT, {
      size: 11, style: 'bold', color: COLORS.royalBlue,
    });
    this.advance(2);
    // Dünne Trennlinie unter Heading.
    this.doc.setDrawColor(...COLORS.border);
    this.doc.setLineWidth(0.3);
    this.doc.line(CONTENT_LEFT, this.y, CONTENT_RIGHT, this.y);
    this.advance(5);
  }

  drawParamsTable(params) {
    // 2 Spalten à 4 Zeilen.
    const colWidth = CONTENT_WIDTH / 2;
    const rowHeight = 6;

    for (let i = 0; i < PARAM_ORDER.length; i += 2) {
      this.checkBreak(rowHeight);
      const leftKey = PARAM_ORDER[i];
      const rightKey = PARAM_ORDER[i + 1];

      this.font({ size: 10, style: 'bold' });
      this.doc.text(FIELD_LABELS[leftKey] + ':', CONTENT_LEFT, this.y);
      if (rightKey) {
        this.doc.text(FIELD_LABELS[rightKey] + ':', CONTENT_LEFT + colWidth, this.y);
      }

      this.font({ size: 10, style: 'normal' });
      this.doc.text(String(params[leftKey] ?? 0), CONTENT_LEFT + 45, this.y);
      if (rightKey) {
        this.doc.text(String(params[rightKey] ?? 0), CONTENT_LEFT + colWidth + 45, this.y);
      }

      this.advance(rowHeight);
    }
    this.advance(3);
  }

  drawPhasesTable(phases) {
    const total = phases.reduce((acc, p) => acc + p.pt, 0);
    const rowHeight = 6;

    for (const phase of phases) {
      this.checkBreak(rowHeight);
      this.font({ size: 10, style: 'normal' });
      this.doc.text(phase.name, CONTENT_LEFT, this.y);

      const pct = total > 0
        ? (phase.pt / total * 100).toFixed(1).replace('.', ',')
        : '0,0';

      // Rechts ausgerichtet: PT + Prozent.
      const ptText = `${formatPT(phase.pt)} PT`;
      const pctText = `(${pct}%)`;
      this.doc.text(ptText, CONTENT_RIGHT - 20, this.y, { align: 'right' });
      this.font({ size: 10, color: COLORS.muted });
      this.doc.text(pctText, CONTENT_RIGHT, this.y, { align: 'right' });

      this.advance(rowHeight);
    }
    this.advance(3);
  }

  drawBulletList(items) {
    for (const item of items) {
      const lines = this.doc.splitTextToSize(`• ${item}`, CONTENT_WIDTH - 4);
      const blockHeight = lines.length * 4.5 + 1;
      this.checkBreak(blockHeight);
      this.font({ size: 10, style: 'normal' });
      for (let i = 0; i < lines.length; i++) {
        // Folge-Zeilen leicht eingerückt für sauberen Hängepunkt.
        const x = i === 0 ? CONTENT_LEFT : CONTENT_LEFT + 4;
        this.doc.text(lines[i], x, this.y);
        this.advance(4.5);
      }
      this.advance(0.5);
    }
    this.advance(2);
  }

  drawRisksList(risks) {
    if (risks.length === 0) {
      this.font({ size: 10, style: 'italic', color: COLORS.muted });
      this.checkBreak(6);
      this.doc.text('Keine spezifischen Risiken identifiziert.', CONTENT_LEFT, this.y);
      this.advance(6);
      return;
    }

    for (const risk of risks) {
      const severityLabel = SEVERITY_LABELS[risk.severity] ?? risk.severity?.toUpperCase() ?? '';
      const prefixText = `[${severityLabel}] `;
      const fullText = prefixText + risk.text;
      const lines = this.doc.splitTextToSize(fullText, CONTENT_WIDTH);
      const blockHeight = lines.length * 4.5 + 1;
      this.checkBreak(blockHeight);

      // Severity-Prefix farblich differenzieren.
      const prefixColor = risk.severity === 'high'
        ? COLORS.royalBlue
        : risk.severity === 'medium'
          ? COLORS.muted
          : COLORS.border;
      this.font({ size: 10, style: 'bold', color: prefixColor });
      this.doc.text(`[${severityLabel}]`, CONTENT_LEFT, this.y);

      // Risiko-Text dahinter — Breite und Position berechnet ab dem Prefix.
      const prefixWidth = this.doc.getTextWidth(`[${severityLabel}] `);
      const textLines = this.doc.splitTextToSize(risk.text, CONTENT_WIDTH - prefixWidth);
      this.font({ size: 10, style: 'normal', color: COLORS.text });
      for (let i = 0; i < textLines.length; i++) {
        const x = i === 0 ? CONTENT_LEFT + prefixWidth : CONTENT_LEFT;
        this.doc.text(textLines[i], x, this.y);
        if (i < textLines.length - 1) this.advance(4.5);
      }
      this.advance(5);
    }
    this.advance(2);
  }

  drawScope() {
    // "Enthalten" als Sub-Heading in Green-Dark.
    this.checkBreak(7);
    this.font({ size: 10, style: 'bold', color: COLORS.greenDark });
    this.doc.text('Enthalten:', CONTENT_LEFT, this.y);
    this.advance(5);
    this.drawBulletList(SCOPE_IN);

    this.checkBreak(7);
    this.font({ size: 10, style: 'bold', color: COLORS.muted });
    this.doc.text('Nicht enthalten:', CONTENT_LEFT, this.y);
    this.advance(5);
    this.drawBulletList(SCOPE_OUT);
  }

  drawAssumptions(assumptions) {
    if (assumptions.length === 0) {
      this.font({ size: 10, style: 'italic', color: COLORS.muted });
      this.checkBreak(6);
      this.doc.text('Keine Annahmen.', CONTENT_LEFT, this.y);
      this.advance(6);
      return;
    }
    this.drawBulletList(assumptions.map(a => a.text));
  }

  /** Wird nach allem Content für jede Seite aufgerufen (Seitenzahl ist dann bekannt). */
  drawFootersAcrossAllPages() {
    const totalPages = this.doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      this.doc.setPage(p);

      // Dünne Trennlinie über Footer.
      this.doc.setDrawColor(...COLORS.border);
      this.doc.setLineWidth(0.3);
      const lineY = PAGE.height - PAGE.marginBottom + 4;
      this.doc.line(CONTENT_LEFT, lineY, CONTENT_RIGHT, lineY);

      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setTextColor(...COLORS.muted);

      let footerY = lineY + 5;
      for (const fl of FOOTER_LINES) {
        this.doc.text(fl, CONTENT_LEFT, footerY);
        footerY += 3.5;
      }

      this.doc.setFont('helvetica', 'bold');
      this.doc.text('ReqPOOL GmbH', CONTENT_LEFT, footerY + 1.5);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(`Seite ${p}/${totalPages}`, CONTENT_RIGHT, footerY + 1.5, { align: 'right' });
    }
  }

  save(filename) {
    this.doc.save(filename);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generiert das PDF aus dem übergebenen Datensatz und triggert den Download.
 *
 * @param {object} data
 * @param {object} data.projectInfo  Step-1-Werte (Name, Kunde, Typ, …)
 * @param {object} data.params       Aktuelles Parameter-Set (mit ggf. Sensitivity-Overrides)
 * @param {object} data.estimation   Result aus calculateEstimation
 * @param {Array}  data.assumptions  Liste aus generateAssumptions
 * @param {Array}  data.risks        Liste aus generateRisks
 * @param {boolean} [data.sensitivityModified] true wenn User Slider bewegt hat
 * @returns {Promise<void>}
 */
export async function exportEstimationToPDF(data) {
  if (data === null || typeof data !== 'object') {
    throw new TypeError('exportEstimationToPDF erwartet ein Datensatz-Objekt.');
  }
  const { projectInfo, params, estimation, assumptions, risks, sensitivityModified } = data;

  const builder = new PDFBuilder();
  builder.drawPageHeader();
  builder.drawTitle(projectInfo);
  builder.drawTotalBox(estimation, !!sensitivityModified);

  builder.drawSectionHeading('Systemparameter');
  builder.drawParamsTable(params);

  builder.drawSectionHeading('Phasenaufteilung');
  builder.drawPhasesTable(estimation.phases);

  builder.drawSectionHeading('Annahmen');
  builder.drawAssumptions(assumptions);

  builder.drawSectionHeading('Risiken');
  builder.drawRisksList(risks);

  builder.drawSectionHeading('Leistungsumfang');
  builder.drawScope();

  builder.drawFootersAcrossAllPages();

  const safeName = sanitizeFilename(projectInfo?.projectName ?? '') || 'unbenannt';
  const filename = `ReqPOOL_Aufwandsschaetzung_${safeName}_${formatDateIso()}.pdf`;
  builder.save(filename);
}
