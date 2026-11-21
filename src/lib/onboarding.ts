/**
 * Ελαφρύ flag onboarding — χωριστά από το (lazy) overlay ώστε το AppShell να
 * μπορεί να αποφασίσει αν χρειάζεται καν να κατεβάσει το chunk.
 */
export const ONBOARDING_STORAGE_KEY = 'anabasis.onboarded';

export function hasOnboarded(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    // Private browsing / disabled storage — μην μπλοκάρεις το app, δείξε το app.
    return true;
  }
}
