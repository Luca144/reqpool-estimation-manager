/**
 * wizard.js — Browser-Einstiegspunkt. State-Management, Step-Navigation.
 *
 * In Schritt 1 noch leer; die Wizard-Logik kommt in Schritt 9. Bis dahin
 * verhindert dieser Stub Konsolen-Fehler und dokumentiert, dass die App
 * korrekt geladen ist.
 */

const APP_ROOT_ID = 'app';

function bootstrap() {
  const root = document.getElementById(APP_ROOT_ID);
  if (!root) {
    return;
  }
  // Wizard-Initialisierung folgt in Schritt 9.
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
