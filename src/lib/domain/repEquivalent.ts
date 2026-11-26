/**
 * Ισοδυναμία επαναλήψεων ↔ πρόσθετου βάρους για ασκήσεις σωματικού βάρους
 * (έλξεις, dips, muscle-up…). ΠΡΟΣΩΠΙΚΟΣ κανόνας του χρήστη, βγαλμένος από τις
 * δικές του παλιές προπονήσεις — όχι επιστημονική φόρμουλα:
 *
 *   «ανά 3 reps μπορείς 1–3 μονές με +5 kg· ανά 6 reps 1–3 μονές με +10 kg»
 *   ⇒ +5 kg ≈ 3 reps ⇒ 0.6 rep ανά kg (≈ 5/3 kg ανά rep).
 *
 * Έτσι συγκρίνονται σετ με διαφορετικό φορτίο: 40 kg × 1 (≈ 25) νικά το
 * 30 kg × 3 (≈ 21). Είναι ΣΚΟΡ σε reps, ποτέ βάρος — στο UI «≈ 25», όχι kg.
 *
 * Ο συντελεστής ζει ΜΟΝΟ εδώ. Αν γίνει ρύθμιση αργότερα, αυτό είναι το σημείο
 * (και το κείμενο `guide.sections.prs.step5`, που γράφει «+5 kg ≈ 3 reps»).
 */
export const REP_EQUIVALENT_REPS_PER_KG = 0.6;

/**
 * reps + πρόσθετο βάρος × συντελεστή. Χωρίς πρόσθετο βάρος (null/0) = σκέτες
 * reps. 0 όταν δεν υπάρχουν reps (hold, κενό σετ) — ο caller δεν φτιάχνει ρεκόρ.
 */
export function repEquivalentScore(reps: number | null | undefined, addedKg: number | null | undefined): number {
  if (reps == null || !Number.isFinite(reps) || reps <= 0) return 0;
  const kg = addedKg != null && Number.isFinite(addedKg) && addedKg > 0 ? addedKg : 0;
  // 2 δεκαδικά: σταθερή τιμή για το reconcile (type|set_id|value), χωρίς 0.6·7.5 = 4.499…
  return Math.round((reps + kg * REP_EQUIVALENT_REPS_PER_KG) * 100) / 100;
}
