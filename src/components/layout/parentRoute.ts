export interface ParentRoute {
  to: string;
  labelKey: string;
}

/**
 * Ο «από πάνω» προορισμός μιας διαδρομής — ΜΟΝΟ για deep links.
 *
 * Όταν κάποιος ανοίγει απευθείας ένα link (κοινοποίηση, PWA shortcut, restore
 * καρτέλας) το ιστορικό είναι άδειο: το `navigate(-1)` δεν έχει πού να πάει και
 * το κουμπί «πίσω» θα ήταν νεκρό. Τότε πέφτουμε σε αυτόν τον χάρτη.
 *
 * Όταν ΥΠΑΡΧΕΙ ιστορικό χρησιμοποιούμε πάντα το πραγματικό `navigate(-1)` με
 * γενική ετικέτα: το να γράφαμε «← Ιστορικό» ενώ η προηγούμενη σελίδα ήταν άλλη
 * θα ήταν ψέμα.
 */
const PARENTS: { match: RegExp; parent: ParentRoute }[] = [
  { match: /^\/settings\/.+/, parent: { to: '/settings', labelKey: 'nav.settings' } },
  { match: /^\/exercises\/.+/, parent: { to: '/exercises', labelKey: 'exercises.title' } },
  { match: /^\/skills\/.+/, parent: { to: '/skills', labelKey: 'skills.title' } },
  { match: /^\/history\/.+/, parent: { to: '/history', labelKey: 'history.title' } },
  { match: /^\/programs\/.+/, parent: { to: '/programs', labelKey: 'nav.programs' } },
  { match: /^\/admin$/, parent: { to: '/settings', labelKey: 'nav.settings' } },
];

export function parentRouteOf(pathname: string): ParentRoute | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PARENTS.find((p) => p.match.test(path))?.parent ?? null;
}
