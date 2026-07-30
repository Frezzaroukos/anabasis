import { describe, expect, it } from 'vitest';
import { db } from './index';
import { bootstrapDB, LOCAL_USER_ID } from './bootstrap';
import { SEED_EXERCISES } from './seeds';

/**
 * Regression: το seeding έτρεχε μόνο σε ΚΕΝΗ βάση (`count() === 0`), άρα μια
 * υπάρχουσα εγκατάσταση δεν έπαιρνε ποτέ νέες ασκήσεις/skills. Τώρα κάνει
 * upsert. Αυτά τα tests κλειδώνουν και τις δύο ιδιότητες:
 * (α) οι νέες system ασκήσεις φτάνουν σε παλιά DB,
 * (β) οι ασκήσεις του χρήστη δεν αγγίζονται.
 */
describe('bootstrapDB upgrade path', () => {
  it('φέρνει νέες system ασκήσεις σε DB που έχει ήδη μερικές', async () => {
    // προσομοίωσε «παλιά» εγκατάσταση: μόνο οι 2 πρώτες
    await db.exercises.bulkPut(SEED_EXERCISES.slice(0, 2));
    expect(await db.exercises.count()).toBe(2);

    await bootstrapDB();

    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length);
    expect(await db.skills.count()).toBeGreaterThan(0);
    expect(await db.skill_steps.count()).toBeGreaterThan(0);
  });

  it('δεν διπλασιάζει σε επαναλαμβανόμενο bootstrap (σταθερά IDs)', async () => {
    await bootstrapDB();
    const n = await db.exercises.count();
    await bootstrapDB();
    expect(await db.exercises.count()).toBe(n);
  });

  it('αφήνει άθικτες τις ασκήσεις του χρήστη', async () => {
    const custom = {
      ...SEED_EXERCISES[0]!,
      id: 'user-ex-1',
      user_id: LOCAL_USER_ID,
      name: 'Δική μου άσκηση',
    };
    await db.exercises.put(custom);
    await bootstrapDB();
    const still = await db.exercises.get('user-ex-1');
    expect(still?.name).toBe('Δική μου άσκηση');
    expect(still?.user_id).toBe(LOCAL_USER_ID);
  });
});
