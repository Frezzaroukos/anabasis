import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { CopyCheck, Merge } from 'lucide-react';
import { listAllExercises } from '@/lib/db/queries';
import { getMergeImpact, mergeExercises } from '@/lib/db/exerciseMerge';
import type { Exercise } from '@/lib/db/types';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { groupLikelyDuplicates } from '../utils';

/**
 * «Πιθανά διπλότυπα» — ασκήσεις που κανονικοποιούνται στο ίδιο όνομα
 * («Pull up» / «Pull-ups»). Δεν ενώνει αυτόματα: δείχνει το group, ο χρήστης
 * διαλέγει ΠΟΙΑ κρατά (target) και επιβεβαιώνει με πλήθος επηρεαζόμενων.
 *
 * Οι builtin ασκήσεις ΔΕΝ μπορούν να είναι «πηγή» (δεν αρχειοθετούνται από τον
 * χρήστη) — μπορούν όμως να είναι ο στόχος, ώστε ένα custom διπλότυπο να
 * απορροφηθεί στη seeded άσκηση.
 */
export function DuplicateSuggestions() {
  const { t } = useTranslation();
  const all = useLiveQuery(() => listAllExercises(), [], []);
  const groups = groupLikelyDuplicates(all.filter((e) => !e.is_archived));

  // Επιλογή: για κάθε group, ποιο id κρατάμε (default: το πρώτο χωρίς user_id —
  // builtin αν υπάρχει — αλλιώς το πιο «παλιό»).
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ group: Exercise[]; target: Exercise } | null>(null);
  const [impact, setImpact] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (groups.length === 0) return null;

  const defaultKeep = (grp: Exercise[]) =>
    grp.find((e) => e.user_id === null)?.id ?? grp[0]!.id;

  const openConfirm = async (grp: Exercise[], targetId: string) => {
    const target = grp.find((e) => e.id === targetId);
    if (!target) return;
    setPending({ group: grp, target });
    // Άθροισμα impact από όλες τις πηγές του group → μία γραμμή «N θα μετακινηθούν».
    let total = 0;
    for (const src of grp) {
      if (src.id === target.id) continue;
      total += (await getMergeImpact(src.id, target.id)).total;
    }
    setImpact(total);
  };

  const confirmMerge = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      for (const src of pending.group) {
        if (src.id === pending.target.id) continue;
        // Η πηγή builtin? Τότε δεν την «σβήνουμε» — αντιστρέφουμε: κρατάμε το
        // custom σαν πηγή; Απλούστερο: μόνο custom πηγές ενώνονται. Τα builtin
        // δεν αρχειοθετούνται ποτέ από εδώ.
        if (src.user_id === null) continue;
        await mergeExercises(src.id, pending.target.id);
      }
    } finally {
      setBusy(false);
      setPending(null);
      setImpact(null);
    }
  };

  return (
    <details className="rounded-xl border border-border/60 bg-card">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium text-muted-foreground">
        <CopyCheck className="h-4 w-4" aria-hidden />
        {t('exercises.duplicates.title', { count: groups.length })}
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('exercises.duplicates.hint')}
        </p>
        {groups.map((grp) => {
          const keepId = keep[grp[0]!.id] ?? defaultKeep(grp);
          return (
            <div key={grp.map((g) => g.id).join('|')} className="rounded-lg bg-elevated p-3">
              <ul className="space-y-1">
                {grp.map((ex) => (
                  <li key={ex.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`dup-${grp[0]!.id}`}
                      checked={keepId === ex.id}
                      onChange={() => setKeep((k) => ({ ...k, [grp[0]!.id]: ex.id }))}
                      aria-label={t('exercises.duplicates.keep', { name: ex.name })}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate">{ex.name}</span>
                    {ex.user_id === null && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {t('exercises.builtin')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full"
                onClick={() => void openConfirm(grp, keepId)}
              >
                <Merge className="h-4 w-4" aria-hidden />
                {t('exercises.duplicates.merge')}
              </Button>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={pending != null}
        title={t('exercises.duplicates.confirmTitle', { name: pending?.target.name ?? '' })}
        description={t('exercises.duplicates.confirmDesc', {
          name: pending?.target.name ?? '',
          count: impact ?? 0,
        })}
        confirmLabel={t('exercises.duplicates.merge')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void confirmMerge()}
        onCancel={() => {
          setPending(null);
          setImpact(null);
        }}
      />
    </details>
  );
}
