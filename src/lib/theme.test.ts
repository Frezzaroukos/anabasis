import { describe, it, expect, beforeEach } from 'vitest';
import { updateFavicon } from './theme';

describe('updateFavicon', () => {
  beforeEach(() => {
    document.head.querySelectorAll('link[rel~="icon"]').forEach((l) => l.remove());
  });

  it('δημιουργεί link[rel=icon] με SVG data URI αν δεν υπάρχει', () => {
    updateFavicon(212, 90, 60);
    const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    expect(link).not.toBeNull();
    expect(link!.type).toBe('image/svg+xml');
    expect(link!.href.startsWith('data:image/svg+xml,')).toBe(true);
    // Το accent hue μπαίνει στο mark χρώμα (hsl 212,...).
    expect(decodeURIComponent(link!.href)).toContain('hsl(212,90%,62%)');
  });

  it('ενημερώνει το υπάρχον link αντί να προσθέτει δεύτερο', () => {
    updateFavicon(212, 90, 60);
    updateFavicon(348, 83, 58);
    const links = document.querySelectorAll('link[rel~="icon"]');
    expect(links.length).toBe(1);
    expect(decodeURIComponent((links[0] as HTMLLinkElement).href)).toContain('hsl(348,83%,62%)');
  });

  it('σκούρο accent (mono light) → κλαμπάρει τη φωτεινότητα ώστε να διαβάζεται', () => {
    updateFavicon(240, 8, 12); // mono σε light theme = πολύ σκούρο
    const href = decodeURIComponent(
      document.querySelector<HTMLLinkElement>('link[rel~="icon"]')!.href,
    );
    // low-sat → ανεβαίνει στο ≥88 ώστε να μη χαθεί στο γραφίτη πλακίδιο.
    expect(href).toContain('hsl(240,8%,88%)');
  });
});
