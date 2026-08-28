import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { BodyMetric } from '@/lib/db/types';

/**
 * Κατανομή μακροθρεπτικών ως donut + θερμίδες από macros. Εμφανίζεται ΜΟΝΟ
 * όταν υπάρχει τουλάχιστον ένα macro καταγεγραμμένο — αλλιώς ένα άδειο donut
 * θα υπονοούσε δεδομένα που δεν υπάρχουν.
 */
export function MacroSplit({ metric }: { metric: BodyMetric | undefined }) {
  const { t } = useTranslation();
  const p = metric?.protein_g ?? 0;
  const c = metric?.carbs_g ?? 0;
  const f = metric?.fat_g ?? 0;
  if (p + c + f <= 0) return null;

  // 4 kcal/g πρωτεΐνη & υδατάνθρακες, 9 kcal/g λίπος
  const kcal = Math.round(p * 4 + c * 4 + f * 9);
  // Χρώματα από τα ΙΔΙΑ category tokens που ήδη κουβαλάει το app (--cat-*)
  // αντί για ασύνδετο hardcoded hex — «harmonized» με την υπόλοιπη παλέτα,
  // παραμένουν 3 ξεχωριστά semantic tones για να διαβάζονται τα macros.
  const data = [
    { key: 'protein', label: t('body.protein'), grams: p, color: 'hsl(var(--cat-pull))' },
    { key: 'carbs', label: t('body.carbs'), grams: c, color: 'hsl(var(--cat-core))' },
    { key: 'fat', label: t('body.fat'), grams: f, color: 'hsl(var(--cat-push))' },
  ].filter((d) => d.grams > 0);

  return (
    <div className="mt-4 flex items-center gap-4 border-t border-border/60 pt-4">
      <div className="h-24 w-24 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="grams"
              innerRadius={28}
              outerRadius={44}
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="min-w-0 flex-1 space-y-1 text-sm">
        <p className="font-mono text-xs text-muted-foreground">{kcal} kcal</p>
        {data.map((d) => (
          <p key={d.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} aria-hidden />
            <span className="flex-1">{d.label}</span>
            <span className="font-mono text-muted-foreground">{d.grams}g</span>
          </p>
        ))}
      </div>
    </div>
  );
}
