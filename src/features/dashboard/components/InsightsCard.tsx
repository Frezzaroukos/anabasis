import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Flame, TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { getTrainingInsights } from '@/lib/db/queries';

/**
 * Rule-based insights: κάθε πρόταση εμφανίζεται ΜΟΝΟ αν περνά κατώφλι δεδομένων
 * (streak≥2, volume-delta με προηγούμενο μη-μηδενικό, weight-trend≥2 ζυγίσματα).
 * Χωρίς τα κατώφλια θα «αφηγούμασταν» θόρυβο από 1-2 σημεία — χειρότερο από
 * σιωπή. Καμία μαντεψιά, μόνο ό,τι στηρίζεται στα δεδομένα.
 */
export function InsightsCard() {
  const { t } = useTranslation();
  const ins = useLiveQuery(() => getTrainingInsights(30), []);
  if (!ins) return null;

  const lines: { icon: JSX.Element; text: string }[] = [];

  if (ins.streakDays >= 2) {
    lines.push({
      icon: <Flame className="h-4 w-4 text-amber-500" />,
      text: t('insights.streak', { count: ins.streakDays }),
    });
  }

  if (ins.volumeDeltaPct != null && Math.abs(ins.volumeDeltaPct) >= 5) {
    const up = ins.volumeDeltaPct > 0;
    lines.push({
      icon: up ? (
        <TrendingUp className="h-4 w-4 text-emerald-500" />
      ) : (
        <TrendingDown className="h-4 w-4 text-amber-500" />
      ),
      text: t(up ? 'insights.volumeUp' : 'insights.volumeDown', {
        pct: Math.abs(ins.volumeDeltaPct),
      }),
    });
  }

  if (ins.weightTrend && Math.abs(ins.weightTrend.ratePerWeekKg) >= 0.1) {
    const gaining = ins.weightTrend.ratePerWeekKg > 0;
    lines.push({
      icon: gaining ? (
        <TrendingUp className="h-4 w-4 text-sky-500" />
      ) : (
        <TrendingDown className="h-4 w-4 text-sky-500" />
      ),
      text: t('insights.weightRate', {
        rate: Math.abs(ins.weightTrend.ratePerWeekKg).toFixed(2),
        dir: t(gaining ? 'insights.gaining' : 'insights.losing'),
      }),
    });
  }

  if (ins.prsThisPeriod > 0) {
    lines.push({
      icon: <Trophy className="h-4 w-4 text-amber-500" />,
      text: t('insights.prs', { count: ins.prsThisPeriod }),
    });
  }

  if (lines.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-medium">{t('insights.title')}</h2>
      <ul className="space-y-2">
        {lines.map((l, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="shrink-0">{l.icon}</span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
