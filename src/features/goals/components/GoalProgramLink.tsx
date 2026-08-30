import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarCheck } from 'lucide-react';
import { getProgramAdherence, listPrograms } from '@/lib/db/queries';
import type { Goal, Program } from '@/lib/db/types';

interface ProgramLink {
  program: Program;
  adherence: { target: number; completedThisWeek: number };
}

/**
 * Γέφυρα στόχος-συχνότητας ↔ πρόγραμμα: ένας στόχος «Χ προπονήσεις/εβδομάδα»
 * δεν ζει σε κενό — αν υπάρχει My Program με δικό του weekly target στο ίδιο
 * (ή σε κάθε) άθλημα, δείχνουμε ΚΑΙ την πρόοδο του προγράμματος εδώ, με το
 * ίδιο x/y language που ήδη χρησιμοποιεί το ProgramDetailPage.
 *
 * Δεν είναι FK — ένας στόχος συχνότητας μπορεί λογικά να αφορά πάνω από ένα
 * πρόγραμμα (π.χ. στόχος «όλες οι δραστηριότητες»), οπότε δείχνουμε όλα τα
 * προγράμματα με ρητό weekly target που ταιριάζουν στο εύρος του στόχου.
 */
export function GoalProgramLink({ goal }: { goal: Goal }) {
  const { t } = useTranslation();

  const links = useLiveQuery(
    async (): Promise<ProgramLink[]> => {
      const programs = await listPrograms();
      const matches = programs.filter(
        (p) =>
          p.target_sessions_per_week != null &&
          (goal.activity_key == null || p.activity_kind === goal.activity_key),
      );
      const withAdherence = await Promise.all(
        matches.map(async (program) => ({ program, adherence: await getProgramAdherence(program.id) })),
      );
      return withAdherence.filter((w): w is ProgramLink => w.adherence != null);
    },
    [goal.activity_key],
    [],
  );

  if (links.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {links.map(({ program, adherence }) => (
        <Link
          key={program.id}
          to={`/programs/${program.id}`}
          className="flex items-center gap-1 rounded-full bg-elevated px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <CalendarCheck className="h-3 w-3 shrink-0" aria-hidden />
          {program.name} ·{' '}
          <span className="font-mono">
            {adherence.completedThisWeek}/{adherence.target}
          </span>{' '}
          {t('programs.thisWeek')}
        </Link>
      ))}
    </div>
  );
}
