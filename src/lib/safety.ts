/**
 * Safety / health-disclaimer acknowledgement.
 *
 * Το Anabasis δίνει δομή προπόνησης δύναμης (weighted calisthenics) σε
 * άγνωστους χρήστες. Πριν το δώσεις σε κάποιον, πρέπει να έχει δει το «train
 * at your own risk / consult a professional». Κρατάμε ΕΝΑ bit τοπικά: αν ο
 * χρήστης το έχει αποδεχθεί. Per-device, όπως όλα τα offline-first state.
 */
export const SAFETY_ACK_KEY = 'anabasis.safety.ack';

export function hasSafetyAck(): boolean {
  try {
    return window.localStorage.getItem(SAFETY_ACK_KEY) === '1';
  } catch {
    // Private browsing / disabled storage — μη μπλοκάρεις το app. Το notice
    // μπορεί να ξαναφανεί· αβλαβές.
    return false;
  }
}

export function setSafetyAck(): void {
  try {
    window.localStorage.setItem(SAFETY_ACK_KEY, '1');
  } catch {
    // αγνόησε — storage κλειστό· απλά θα ξαναδείξει το notice
  }
}
