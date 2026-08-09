/**
 * Το μητρώο των καρτών της Αρχικής.
 *
 * Μία λίστα-πηγή: και η Αρχική (τι ζωγραφίζω και με ποια σειρά) και οι
 * Ρυθμίσεις (τι μπορεί να κρύψει/μετακινήσει ο χρήστης) διαβάζουν από εδώ.
 * Χωρίς αυτό, μια νέα κάρτα θα έπρεπε να προστεθεί σε δύο σημεία και θα
 * ξεχνιόταν στο ένα.
 *
 * Οι προτιμήσεις αποθηκεύονται ως `[{key, visible}]` στο `app_settings`.
 * Κλειδί που δεν υπάρχει πια αγνοείται· κάρτα που δεν υπάρχει στις
 * προτιμήσεις προσαρτάται στο τέλος **ορατή** — έτσι ένα update που φέρνει
 * νέα κάρτα δεν την κρύβει σιωπηλά από παλιούς χρήστες.
 */

export const DASHBOARD_CARD_KEYS = [
  'skillLadder',
  'cta',
  'goals',
  'insights',
  'heatmap',
  'consistency',
  'volume',
  'prs',
  'skills',
  'body',
] as const;

export type DashboardCardKey = (typeof DASHBOARD_CARD_KEYS)[number];

/** i18n κλειδί για το όνομα κάθε κάρτας στις Ρυθμίσεις. */
export const CARD_LABEL: Record<DashboardCardKey, string> = {
  skillLadder: 'dashboard.skillLadder',
  cta: 'dashboard.startCta',
  goals: 'goals.title',
  insights: 'insights.title',
  heatmap: 'dashboard.last91days',
  consistency: 'dashboard.consistency',
  volume: 'dashboard.weeklyVolume',
  prs: 'history.recentPRs',
  skills: 'dashboard.skillsProgress',
  body: 'body.title',
};

/**
 * Κάρτες που ΔΕΝ επιτρέπεται να κρυφτούν.
 *
 * Το «Πρόσθεσε προπόνηση» είναι η πρωταρχική δράση όλης της εφαρμογής· αν
 * κρυβόταν, η Αρχική θα έμενε χωρίς τρόπο να ξεκινήσεις — μια ρύθμιση δεν
 * επιτρέπεται να οδηγεί σε αδιέξοδο. Μετακινείται όμως ελεύθερα.
 */
export const LOCKED_VISIBLE: DashboardCardKey[] = ['cta'];

/**
 * Κάρτες που πιάνουν ΟΛΟ το πλάτος στο desktop grid.
 * Η σκάλα χρειάζεται οριζόντιο χώρο για τα βήματά της, και η πρωταρχική
 * δράση δεν πρέπει να μοιράζεται σειρά με στατιστικά.
 */
export const FULL_WIDTH: DashboardCardKey[] = ['skillLadder', 'cta', 'consistency'];

export interface CardPref {
  key: string;
  visible: boolean;
}

/**
 * Συγχωνεύει τις αποθηκευμένες προτιμήσεις με το τρέχον μητρώο.
 * Επιστρέφει πάντα ΟΛΑ τα υπαρκτά κλειδιά, με τη σειρά του χρήστη πρώτα.
 */
export function resolveCardOrder(prefs: CardPref[] | undefined): CardPref[] {
  const known = new Set<string>(DASHBOARD_CARD_KEYS);
  const seen = new Set<string>();
  const out: CardPref[] = [];

  for (const p of prefs ?? []) {
    if (!known.has(p.key) || seen.has(p.key)) continue;
    seen.add(p.key);
    out.push({
      key: p.key,
      // Οι κλειδωμένες μένουν ορατές ακόμα κι αν παλιά δεδομένα λένε αλλιώς.
      visible: LOCKED_VISIBLE.includes(p.key as DashboardCardKey) ? true : p.visible,
    });
  }

  for (const key of DASHBOARD_CARD_KEYS) {
    if (!seen.has(key)) out.push({ key, visible: true });
  }

  return out;
}
