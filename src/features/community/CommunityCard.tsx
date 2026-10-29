import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Users } from 'lucide-react';
import { useAuth } from '@/lib/api/auth';
import { useSocial } from '@/features/achievements/useSocial';
import { SectionTitle } from '@/components/ui/Section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function rowName(row: { display_name?: string | null; username?: string | null }, anon: string): string {
  if (row.display_name) return row.display_name;
  if (row.username) return `@${row.username}`;
  return anon;
}

/**
 * Μικρή κάρτα της Αρχικής: οι πρώτοι τρεις της παρέας + δρόμος προς την
 * Κοινότητα. Χωρίς λογαριασμό/φίλους δεν αφήνει κενό κουτί — εξηγεί τι κερδίζει
 * κάποιος και δίνει μία καθαρή είσοδο. Τα δεδομένα έρχονται από το ίδιο social
 * hook (χωρίς publish — δεν χρειάζεται να ξαναστείλουμε stats για μια ματιά).
 */
export function CommunityCard() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [state] = useSocial(auth != null, null);
  const top = state.leaderboard.slice(0, 3);

  return (
    <section className="rounded-xl bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SectionTitle>{t('community.cardTitle')}</SectionTitle>
        <Users className="h-4 w-4 text-muted-foreground" />
      </div>

      {!auth ? (
        <>
          <p className="text-sm text-muted-foreground">{t('community.cardSignIn')}</p>
          <Button asChild variant="outline" size="sm" className="mt-3 w-full">
            <Link to="/community">{t('community.cardCta')}</Link>
          </Button>
        </>
      ) : state.loading ? (
        <div className="space-y-2 py-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-elevated" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <>
          <p className="text-sm text-muted-foreground">{t('community.cardEmpty')}</p>
          <Button asChild variant="outline" size="sm" className="mt-3 w-full">
            <Link to="/community">{t('community.cardCta')}</Link>
          </Button>
        </>
      ) : (
        <>
          <ul className="divide-y divide-border/60">
            {top.map((row, i) => (
              <li key={row.username ?? `rank-${i}`} className="flex items-center gap-2.5 py-2">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] tabular-nums',
                    i === 0
                      ? 'bg-[hsl(var(--gold)/0.14)] text-[hsl(var(--gold))]'
                      : 'bg-elevated text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {rowName(row, t('social.anon'))}
                  {row.is_self && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {t('social.board.you')}
                    </span>
                  )}
                </span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {row.xp.toLocaleString()} XP
                </span>
              </li>
            ))}
          </ul>
          <Link
            to="/community"
            className="mt-1 flex items-center justify-center gap-1 border-t border-border/60 pt-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('community.cardCta')}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </>
      )}
    </section>
  );
}
