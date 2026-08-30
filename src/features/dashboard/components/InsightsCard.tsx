import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { TrendingDown, TrendingUp, Trophy } from 'lucide-react';
import { getTrainingInsights } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { kgToLb } from '@/lib/units';
import { SectionTitle } from '@/components/ui/Section';

/**
 * Rule-based insights: κάθε πρόταση εμφανίζεται ΜΟΝΟ αν περνά κατώφλι δεδομένων
 * (volume-delta με προηγούμενο μη-μηδενικό, weight-trend≥2 ζυγίσματα).
 * Χωρίς τα κατώφλια θα «αφηγούμασταν» θόρυβο από 1-2 σημεία — χειρότερο από
 * σιωπή. Καμία μαντεψιά, μόνο ό,τι στηρίζεται στα δεδομένα.
 *
 * Το σερί ΔΕΝ εμφανίζεται εδώ πια — το hero του Home το δείχνει ήδη μεγάλο
 * στην κορυφή· ίδιο fact σε δύο κάρτες θα ήταν επανάληψη (ARCHITECTURE-V4 §6).
 */
export function InsightsCard() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const ins = useLiveQuery(() => getTrainingInsights(30), []);
  if (!ins) return null;

  const lines: { icon: JSX.Element; text: string }[] = [];

  if (ins.volumeDeltaPct != null && Math.abs(ins.volumeDeltaPct) >= 5) {
    const up = ins.volumeDeltaPct > 0;
    lines.push({
      // Βέλος για κατεύθυνση, μηδέν off-palette χρώμα (Carbon: no
      // emerald/amber/sky) — το σχήμα του βέλους ΕΙΝΑΙ το νόημα.
      icon: up ? (
        <TrendingUp className="h-4 w-4 text-foreground" />
      ) : (
        <TrendingDown className="h-4 w-4 text-foreground" />
      ),
      text: t(up ? 'insights.volumeUp' : 'insights.volumeDown', {
        pct: Math.abs(ins.volumeDeltaPct),
      }),
    });
  }

  if (ins.weightTrend && Math.abs(ins.weightTrend.ratePerWeekKg) >= 0.1) {
    const gaining = ins.weightTrend.ratePerWeekKg > 0;
    const rateInUnit =
      unit === 'lb' ? kgToLb(Math.abs(ins.weightTrend.ratePerWeekKg)) : Math.abs(ins.weightTrend.ratePerWeekKg);
    lines.push({
      icon: gaining ? (
        <TrendingUp className="h-4 w-4 text-foreground" />
      ) : (
        <TrendingDown className="h-4 w-4 text-foreground" />
      ),
      text: t('insights.weightRateUnit', {
        rate: rateInUnit.toFixed(2),
        unit: t(`common.${unit}`),
        dir: t(gaining ? 'insights.gaining' : 'insights.losing'),
      }),
    });
  }

  if (ins.prsThisPeriod > 0) {
    lines.push({
      icon: <Trophy className="h-4 w-4 text-[hsl(var(--gold))]" />,
      text: t('insights.prs', { count: ins.prsThisPeriod }),
    });
  }

  if (lines.length === 0) return null;

  return (
    <div className="rounded-xl bg-card p-4">
      <SectionTitle>{t('insights.title')}</SectionTitle>
      <ul className="space-y-2.5">
        {lines.map((l, i) => (
          <li key={i} className="flex items-center gap-2.5 text-sm">
            <span className="shrink-0">{l.icon}</span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
