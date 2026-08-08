import type { Activity } from '@/lib/db/types';
import { cn } from '@/lib/utils';

/**
 * Επιλογή δραστηριότητας — μία εμφάνιση, παντού.
 *
 * Πριν, κάθε δραστηριότητα εμφανιζόταν με το **emoji** της (🏃 🏀 🏊). Ένα
 * emoji δεν είναι εικονίδιο διεπαφής: αλλάζει σχέδιο ανά πλατφόρμα, δεν
 * ευθυγραμμίζεται με το κείμενο, δεν παίρνει το χρώμα του θέματος και κάνει
 * κάθε οθόνη να μοιάζει με πρόχειρο. Η ταυτότητα κάθε δραστηριότητας είναι
 * ήδη το **χρώμα** της (`dot_class`) — το ίδιο που βλέπεις ως κουκκίδα στο
 * ημερολόγιο. Χρησιμοποιώντας το ίδιο σημάδι και εδώ, οι δύο οθόνες δένουν:
 * μαθαίνεις μία φορά ότι «μπλε = τρέξιμο» και ισχύει παντού.
 *
 * Το πεδίο `icon` παραμένει στα δεδομένα (δικά σου custom αθλήματα μπορεί να
 * το έχουν) — απλώς δεν είναι πια το κύριο σήμα.
 */
export function ActivityChip({
  activity,
  selected = false,
  onClick,
  className,
}: {
  activity: Pick<Activity, 'key' | 'label' | 'dot_class'>;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm transition-all active:scale-[0.97]',
        selected
          ? 'border-primary bg-primary/10 font-medium text-foreground ring-1 ring-primary/30'
          : 'border-border/70 bg-card text-muted-foreground hover:border-border hover:text-foreground',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-2.5 w-2.5 shrink-0 rounded-full transition-transform',
          activity.dot_class,
          selected && 'scale-125',
        )}
      />
      <span className="truncate">{activity.label}</span>
    </button>
  );
}
