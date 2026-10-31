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
    const href = decodeURIComponent(link!.href);
    // Νέο simplified «Ascent A»: σταθερό dark A + accent διαδρομή.
    expect(href).toContain("M5 59 L29 5 H35 L59 59 H47 L32 27 L17 59 Z");
    expect(href).toContain('#1C1C21');
    expect(href).toContain('hsl(212,90%,60%)');
  });

  it('ενημερώνει το υπάρχον link αντί να προσθέτει δεύτερο', () => {
    updateFavicon(212, 90, 60);
    updateFavicon(348, 83, 58);
    const links = document.querySelectorAll('link[rel~="icon"]');
    expect(links.length).toBe(1);
    expect(decodeURIComponent((links[0] as HTMLLinkElement).href)).toContain('hsl(348,83%,58%)');
  });

  it('κλαμπάρει τη φωτεινότητα της διαδρομής στο εύρος 42–64%', () => {
    updateFavicon(240, 8, 12); // πολύ σκούρο
    let href = decodeURIComponent(
      document.querySelector<HTMLLinkElement>('link[rel~="icon"]')!.href,
    );
    expect(href).toContain('hsl(240,8%,42%)');

    updateFavicon(240, 8, 95); // πολύ ανοιχτό
    href = decodeURIComponent(document.querySelector<HTMLLinkElement>('link[rel~="icon"]')!.href);
    expect(href).toContain('hsl(240,8%,64%)');
  });
});
