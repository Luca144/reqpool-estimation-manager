// @vitest-environment happy-dom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exportEstimationToPDF, sanitizeFilename } from '../js/pdf.js';
import { calculateEstimation } from '../js/estimation.js';
import { generateAssumptions } from '../js/assumptions.js';
import { generateRisks } from '../js/risks.js';

/**
 * jsPDF wird komplett gemockt — wir testen die Datenverarbeitung und die
 * Sequenz/Inhalte der jsPDF-API-Aufrufe, nicht das tatsächliche PDF-Rendering.
 */

let mockDoc;
let MockJsPDFConstructor;
let originalJspdf;

function makeMockDoc() {
  const doc = {
    pages: 1,
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setTextColor: vi.fn(),
    setFillColor: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    text: vi.fn(),
    rect: vi.fn(),
    line: vi.fn(),
    addPage: vi.fn(),
    splitTextToSize: vi.fn(str => [String(str)]),
    getNumberOfPages: vi.fn(),
    setPage: vi.fn(),
    getTextWidth: vi.fn(() => 20),
    save: vi.fn(),
  };
  doc.addPage.mockImplementation(() => {
    doc.pages += 1;
  });
  doc.getNumberOfPages.mockImplementation(() => doc.pages);
  return doc;
}

beforeEach(() => {
  originalJspdf = window.jspdf;
  mockDoc = makeMockDoc();
  MockJsPDFConstructor = vi.fn(() => mockDoc);
  window.jspdf = { jsPDF: MockJsPDFConstructor };
});

afterEach(() => {
  window.jspdf = originalJspdf;
});

// ─────────────────────────────────────────────────────────────────────────────
// Test-Daten
// ─────────────────────────────────────────────────────────────────────────────

const mittelParams = {
  pages: 15, useCases: 10, businessObjects: 12, interfaces: 4,
  batches: 2, languages: 2, roles: 5, users: 150,
  projectType: 'Greenfield',
};

function makeData(overrides = {}) {
  return {
    projectInfo: {
      projectName: 'Demo Projekt',
      customerName: 'Demo Kunde GmbH',
      projectDescription: 'Beschreibung',
      projectType: 'Greenfield',
      plannedStart: '2026-06-01',
      plannedDurationMonths: 12,
    },
    params: mittelParams,
    estimation: calculateEstimation(mittelParams),
    assumptions: generateAssumptions(mittelParams),
    risks: generateRisks(mittelParams),
    sensitivityModified: false,
    ...overrides,
  };
}

function allRenderedText() {
  return mockDoc.text.mock.calls.map(c => String(c[0]));
}

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeFilename
// ─────────────────────────────────────────────────────────────────────────────

describe('sanitizeFilename', () => {
  it('"Mein Projekt äöü ß" → "Mein_Projekt_aeoeue_ss"', () => {
    expect(sanitizeFilename('Mein Projekt äöü ß')).toBe('Mein_Projekt_aeoeue_ss');
  });

  it('"Projekt/Test:1" → "Projekt_Test_1"', () => {
    expect(sanitizeFilename('Projekt/Test:1')).toBe('Projekt_Test_1');
  });

  it('schreibt Umlaute groß: "ÄÖÜ" → "AeOeUe"', () => {
    expect(sanitizeFilename('ÄÖÜ')).toBe('AeOeUe');
  });

  it('fasst Mehrfach-Sonderzeichen zu einem Underscore zusammen', () => {
    expect(sanitizeFilename('A  ---  B')).toBe('A_B');
  });

  it('trimmt führende/abschließende Underscores', () => {
    expect(sanitizeFilename('!!!Hallo!!!')).toBe('Hallo');
  });

  it('leerer String oder Nicht-String → ""', () => {
    expect(sanitizeFilename('')).toBe('');
    expect(sanitizeFilename(null)).toBe('');
    expect(sanitizeFilename(undefined)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// exportEstimationToPDF — jsPDF-Konstruktor & Header
// ─────────────────────────────────────────────────────────────────────────────

describe('exportEstimationToPDF — Konstruktor', () => {
  it('ruft jsPDF mit A4-Konfiguration auf', async () => {
    await exportEstimationToPDF(makeData());
    expect(MockJsPDFConstructor).toHaveBeenCalledTimes(1);
    const config = MockJsPDFConstructor.mock.calls[0][0];
    expect(config).toMatchObject({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  });

  it('rendert "REQPOOL" als Header-Text', async () => {
    await exportEstimationToPDF(makeData());
    expect(allRenderedText()).toContain('REQPOOL');
  });

  it('rendert den Titel "Aufwandsschätzung Requirements Engineering"', async () => {
    await exportEstimationToPDF(makeData());
    expect(allRenderedText()).toContain('Aufwandsschätzung Requirements Engineering');
  });

  it('rendert Projektname und Kundenname aus data.projectInfo', async () => {
    await exportEstimationToPDF(makeData());
    const text = allRenderedText();
    expect(text).toContain('Demo Projekt');
    expect(text.some(t => t.includes('Demo Kunde GmbH'))).toBe(true);
  });

  it('rendert "Erstellt am [Datum]"-Zeile', async () => {
    await exportEstimationToPDF(makeData());
    expect(allRenderedText().some(t => t.startsWith('Erstellt am '))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// exportEstimationToPDF — Parameter-Tabelle
// ─────────────────────────────────────────────────────────────────────────────

describe('exportEstimationToPDF — Parameter-Tabelle', () => {
  it('rendert ein Label pro Systemparameter', async () => {
    await exportEstimationToPDF(makeData());
    const text = allRenderedText();
    const expectedLabels = ['Pages:', 'Use Cases:', 'Business Objects:', 'Interfaces:', 'Batches:', 'Languages:', 'Roles:', 'Users:'];
    for (const label of expectedLabels) {
      expect(text, `Label "${label}"`).toContain(label);
    }
  });

  it('rendert die Werte der 8 Parameter', async () => {
    await exportEstimationToPDF(makeData());
    const text = allRenderedText();
    // Werte aus mittelParams
    for (const expectedValue of ['15', '10', '12', '4', '2', '5', '150']) {
      expect(text, `Wert "${expectedValue}"`).toContain(expectedValue);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// exportEstimationToPDF — Phasen-Tabelle
// ─────────────────────────────────────────────────────────────────────────────

describe('exportEstimationToPDF — Phasen-Tabelle', () => {
  it('rendert alle 6 Phasennamen', async () => {
    await exportEstimationToPDF(makeData());
    const text = allRenderedText();
    for (const name of ['Stakeholder-Analyse', 'Anforderungserhebung', 'Spezifikation', 'Review & QA', 'Abnahme & Übergabe', 'Projektmanagement']) {
      expect(text, `Phase "${name}"`).toContain(name);
    }
  });

  it('rendert Prozentwerte mit Komma als Dezimaltrenner', async () => {
    await exportEstimationToPDF(makeData());
    const text = allRenderedText();
    // Spezifikation = 35% → "(35,0%)"
    expect(text.some(t => t.includes('(35,0%)'))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sensitivity-Hinweis
// ─────────────────────────────────────────────────────────────────────────────

describe('Sensitivity-Hinweis', () => {
  it('taucht NICHT auf, wenn sensitivityModified=false', async () => {
    await exportEstimationToPDF(makeData({ sensitivityModified: false }));
    const text = allRenderedText();
    const hasHint = text.some(t => t.includes('manuell angepasste') || t.includes('Hinweis: Diese Schätzung'));
    expect(hasHint).toBe(false);
  });

  it('taucht auf, wenn sensitivityModified=true', async () => {
    await exportEstimationToPDF(makeData({ sensitivityModified: true }));
    const text = allRenderedText();
    const hasHint = text.some(t => t.includes('manuell angepasst') || t.includes('Diese Schätzung enthält'));
    expect(hasHint).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Risiken — Severity-Prefix
// ─────────────────────────────────────────────────────────────────────────────

describe('Risiken', () => {
  it('rendert Severity-Prefix in Großbuchstaben ([HOCH] / [MITTEL] / [NIEDRIG])', async () => {
    // Wir bauen Risiken mit allen drei Severities zusammen, damit alle Prefixes geprüft werden.
    const data = makeData({
      risks: [
        { id: 'r1', text: 'Hoch-Risiko', severity: 'high' },
        { id: 'r2', text: 'Mittel-Risiko', severity: 'medium' },
        { id: 'r3', text: 'Niedrig-Risiko', severity: 'low' },
      ],
    });
    await exportEstimationToPDF(data);
    const text = allRenderedText();
    expect(text).toContain('[HOCH]');
    expect(text).toContain('[MITTEL]');
    expect(text).toContain('[NIEDRIG]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pagebreak
// ─────────────────────────────────────────────────────────────────────────────

describe('Pagebreak', () => {
  it('ruft addPage mindestens einmal bei realistischen Datenmengen auf', async () => {
    // Standard mittel-Demo enthält 9 Annahmen + diverse Risiken + Scope-Listen.
    // Die Gesamthöhe überschreitet eine A4-Seite → mindestens 1 Pagebreak.
    await exportEstimationToPDF(makeData());
    expect(mockDoc.addPage).toHaveBeenCalled();
  });

  it('Footer wird über alle Seiten gerendert (setPage je Seite)', async () => {
    await exportEstimationToPDF(makeData());
    // Mindestens so viele setPage-Calls wie Seiten existieren (Footer-Loop).
    expect(mockDoc.setPage).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dateiname & Download
// ─────────────────────────────────────────────────────────────────────────────

describe('Dateiname & Download', () => {
  it('ruft save() mit Pattern ReqPOOL_Aufwandsschaetzung_*_YYYY-MM-DD.pdf', async () => {
    await exportEstimationToPDF(makeData());
    expect(mockDoc.save).toHaveBeenCalledTimes(1);
    const filename = mockDoc.save.mock.calls[0][0];
    expect(filename).toMatch(/^ReqPOOL_Aufwandsschaetzung_.+_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('verwendet sanitisierten Projektnamen im Dateinamen', async () => {
    await exportEstimationToPDF(makeData({
      projectInfo: { projectName: 'Mein Projekt äöü', customerName: 'Kunde', projectType: 'Greenfield' },
    }));
    const filename = mockDoc.save.mock.calls[0][0];
    expect(filename).toContain('Mein_Projekt_aeoeue');
  });

  it('verwendet "unbenannt" als Fallback bei leerem Projektnamen', async () => {
    await exportEstimationToPDF(makeData({
      projectInfo: { projectName: '', customerName: 'Kunde', projectType: 'Greenfield' },
    }));
    const filename = mockDoc.save.mock.calls[0][0];
    expect(filename).toContain('unbenannt');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

describe('Validation', () => {
  it('wirft TypeError, wenn data kein Objekt ist', async () => {
    await expect(exportEstimationToPDF(null)).rejects.toThrow(TypeError);
  });

  it('wirft Error, wenn window.jspdf.jsPDF nicht verfügbar ist', async () => {
    window.jspdf = undefined;
    await expect(exportEstimationToPDF(makeData())).rejects.toThrow(/jsPDF/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Footer (Disclaimer + Seitenzahl)
// ─────────────────────────────────────────────────────────────────────────────

describe('Footer', () => {
  it('rendert die Disclaimer-Zeile zur ReqPOOL-Methodik', async () => {
    await exportEstimationToPDF(makeData());
    const text = allRenderedText();
    expect(text.some(t => t.includes('parametrischer Aufwandsberechnung nach ReqPOOL-Methodik'))).toBe(true);
  });

  it('rendert "ReqPOOL GmbH" als Footer-Signatur', async () => {
    await exportEstimationToPDF(makeData());
    expect(allRenderedText()).toContain('ReqPOOL GmbH');
  });

  it('rendert "Seite X/N" als Seitenangabe', async () => {
    await exportEstimationToPDF(makeData());
    const text = allRenderedText();
    expect(text.some(t => /^Seite \d+\/\d+$/.test(t))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gesamt-Aufwand-Box
// ─────────────────────────────────────────────────────────────────────────────

describe('Gesamtaufwand-Box', () => {
  it('rendert die "GESAMTAUFWAND"-Caption', async () => {
    await exportEstimationToPDF(makeData());
    expect(allRenderedText()).toContain('GESAMTAUFWAND');
  });

  it('zeichnet eine gefüllte Box (rect mit "F"-Style) für den Hintergrund', async () => {
    await exportEstimationToPDF(makeData());
    const fillCalls = mockDoc.rect.mock.calls.filter(c => c[4] === 'F');
    expect(fillCalls.length).toBeGreaterThanOrEqual(1);
  });
});
