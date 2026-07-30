import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getBodyMetric, getBodyTrend, localDay, saveBodyMetric } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const RANGES = [30, 60, 90, 180] as const;

/**
 * Βάρος & θερμίδες. Δύο ξεχωριστά charts επίτηδες: το βάρος κινείται σε
 * κλίμακα ~kg και οι θερμίδες σε ~χιλιάδες — σε κοινό άξονα το βάρος θα ήταν
 * επίπεδη γραμμή. Το ισοζύγιο (πρόσληψη − δαπάνη) είναι το νούμερο που
 * εξηγεί ΓΙΑΤΙ κινείται το βάρος, γι' αυτό έχει δική του γραμμή στο μηδέν.
 */
export function BodyPage() {
  const { t } = useTranslation();
  const [days, setDays] = useState<(typeof RANGES)[number]>(60);
  const today = localDay();

  const trend = useLiveQuery(() => getBodyTrend(days), [days], []);
  const todayMetric = useLiveQuery(() => getBodyMetric(today), [today]);

  const [w, setW] = useState('');
  const [cin, setCin] = useState('');
  const [cout, setCout] = useState('');
  const [protein, setProtein] = useState('');
  const [bf, setBf] = useState('');

  // Πρόσθεσε τις υπάρχουσες τιμές της ημέρας στα πεδία (edit αντί για ξανα-εισαγωγή).
  // Εξαρτάται από το ίδιο το record: όταν αλλάξει (id/updated_at), τα πεδία
  // ξανασυγχρονίζονται· δεν χρειάζεται πιο στενό dep array.
  useEffect(() => {
    if (!todayMetric) return;
    setW(todayMetric.weight_kg?.toString() ?? '');
    setCin(todayMetric.calories_in?.toString() ?? '');
    setCout(todayMetric.calories_out?.toString() ?? '');
    setProtein(todayMetric.protein_g?.toString() ?? '');
    setBf(todayMetric.body_fat_pct?.toString() ?? '');
  }, [todayMetric]);

  const num = (s: string) => {
    const v = Number(s);
    return s.trim() !== '' && Number.isFinite(v) ? v : null;
  };

  const save = () =>
    void saveBodyMetric(today, {
      weight_kg: num(w),
      calories_in: num(cin),
      calories_out: num(cout),
      protein_g: num(protein),
      body_fat_pct: num(bf),
    });

  // Το βάρος γεφυρώνεται (connectNulls) — οι μέρες χωρίς ζύγισμα δεν είναι μηδέν.
  const weightPoints = trend.filter((p) => p.weight != null);
  const balancePoints = trend.filter((p) => p.balance != null);
  const latest = weightPoints.at(-1)?.weight ?? null;
  const first = weightPoints[0]?.weight ?? null;
  const delta = latest != null && first != null ? latest - first : null;

  // Πρωτεΐνη/kg σωματικού βάρους — χρησιμοποιεί το σημερινό βάρος αν
  // καταγράφηκε, αλλιώς το πιο πρόσφατο γνωστό (δεν χρειάζεται να ζυγιστείς
  // ΚΑΙ να μετρήσεις πρωτεΐνη την ίδια μέρα για να δεις τη μετρική).
  const weightForRatio = todayMetric?.weight_kg ?? latest;
  const proteinPerKg =
    todayMetric?.protein_g != null && weightForRatio != null
      ? Math.round((todayMetric.protein_g / weightForRatio) * 10) / 10
      : null;

  const bodyFatPoints = trend.filter((p) => p.bodyFatPct != null);
  const latestBF = bodyFatPoints.at(-1)?.bodyFatPct ?? null;
  const firstBF = bodyFatPoints[0]?.bodyFatPct ?? null;
  const bfDelta = latestBF != null && firstBF != null ? latestBF - firstBF : null;

  const proteinPoints = trend.filter((p) => p.proteinG != null);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('body.title')}</h1>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`rounded-md border border-border px-2 py-1 font-mono text-xs transition-colors ${
                days === r ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </header>

      {/* Καταγραφή σημερινής μέρας */}
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">{t('body.logToday')}</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              [t('body.weight'), w, setW, 'kg'],
              [t('body.caloriesIn'), cin, setCin, 'kcal'],
              [t('body.caloriesOut'), cout, setCout, 'kcal'],
              [t('body.protein'), protein, setProtein, 'g'],
              [t('body.bodyFat'), bf, setBf, '%'],
            ] as const
          ).map(([label, val, set, unit]) => (
            <label key={label} className="block">
              <span className="mb-1 block text-[10px] uppercase text-muted-foreground">
                {label} ({unit})
              </span>
              <Input
                type="number"
                inputMode="decimal"
                value={val}
                onChange={(e) => set(e.target.value)}
                className="h-9"
              />
            </label>
          ))}
        </div>
        <Button className="mt-3 h-9" onClick={save}>
          {t('body.save')}
        </Button>
        {todayMetric?.calories_in != null && todayMetric?.calories_out != null && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {t('body.balance')}:{' '}
            <span
              className={
                todayMetric.calories_in - todayMetric.calories_out >= 0
                  ? 'text-amber-400'
                  : 'text-emerald-400'
              }
            >
              {todayMetric.calories_in - todayMetric.calories_out > 0 ? '+' : ''}
              {todayMetric.calories_in - todayMetric.calories_out} kcal
            </span>
          </p>
        )}
        {(proteinPerKg != null || todayMetric?.body_fat_pct != null) && (
          <p className="mt-1 flex gap-3 font-mono text-xs text-muted-foreground">
            {proteinPerKg != null && (
              <span>
                {t('body.proteinPerKg')}: <span className="text-foreground">{proteinPerKg} g/kg</span>
              </span>
            )}
            {todayMetric?.body_fat_pct != null && (
              <span>
                {t('body.bodyFat')}: <span className="text-foreground">{todayMetric.body_fat_pct}%</span>
              </span>
            )}
          </p>
        )}
      </section>

      {/* Βάρος */}
      {weightPoints.length > 1 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">{t('body.weightTrend')}</h2>
            {delta != null && (
              <span
                className={`font-mono text-xs ${
                  delta > 0 ? 'text-amber-400' : delta < 0 ? 'text-emerald-400' : ''
                }`}
              >
                {delta > 0 ? '+' : ''}
                {Math.round(delta * 10) / 10} kg
              </span>
            )}
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  className="text-border"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  interval={Math.max(1, Math.floor(days / 6))}
                />
                <YAxis
                  domain={['dataMin - 1', 'dataMax + 1']}
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v} kg`, t('body.weight')]}
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="currentColor"
                  className="text-primary"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/*
        Σύσταση σώματος (body fat %). Ξεχωριστό chart από το βάρος: μιλάμε για
        ποσοστό 0-40%, όχι kg — στον ίδιο άξονα με το βάρος θα ήταν άχρηστο
        (ίδιος λόγος που το ισοζύγιο θερμίδων έχει το δικό του chart παρακάτω).
        Άξονας αγκυρωμένος στο 0 (όχι dataMin-1 όπως το βάρος): σε ποσοστό η
        απόλυτη θέση μετράει περισσότερο από τη σχετική διακύμανση.
      */}
      {bodyFatPoints.length > 1 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">{t('body.bodyFatTrend')}</h2>
            {bfDelta != null && (
              <span
                className={`font-mono text-xs ${
                  bfDelta > 0 ? 'text-amber-400' : bfDelta < 0 ? 'text-emerald-400' : ''
                }`}
              >
                {bfDelta > 0 ? '+' : ''}
                {Math.round(bfDelta * 10) / 10}%
              </span>
            )}
          </div>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  className="text-border"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  interval={Math.max(1, Math.floor(days / 6))}
                />
                <YAxis
                  domain={[0, 'dataMax + 5']}
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v}%`, t('body.bodyFat')]}
                />
                <Line
                  type="monotone"
                  dataKey="bodyFatPct"
                  stroke="currentColor"
                  className="text-rose-400"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Θερμιδικό ισοζύγιο */}
      {balancePoints.length > 0 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium">{t('body.calorieBalance')}</h2>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  className="text-border"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  interval={Math.max(1, Math.floor(days / 6))}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                />
                <ReferenceLine y={0} stroke="currentColor" className="text-border" />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v > 0 ? '+' : ''}${v} kcal`, t('body.balance')]}
                />
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="currentColor"
                  className="text-sky-400"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            {t('body.balanceHint')}
          </p>
        </section>
      )}

      {/*
        Πρωτεΐνη ως δικό της chart, όχι πάνω στο ισοζύγιο θερμίδων: το
        ισοζύγιο είναι ένα netto delta γύρω απ' το μηδέν (μπορεί να είναι
        αρνητικό), ενώ η πρωτεΐνη είναι πάντα θετική ποσότητα σε τελείως
        διαφορετική κλίμακα (~100-250g έναντι ~±500 kcal) — αν μπουν μαζί,
        η μία γραμμή θα «πλακώσει» την άλλη οπτικά χωρίς κοινό νόημα.
      */}
      {proteinPoints.length > 1 && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium">{t('body.proteinTrend')}</h2>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  className="text-border"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  interval={Math.max(1, Math.floor(days / 6))}
                />
                <YAxis
                  domain={[0, 'dataMax + 20']}
                  tick={{ fontSize: 10 }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v} g`, t('body.protein')]}
                />
                <Line
                  type="monotone"
                  dataKey="proteinG"
                  stroke="currentColor"
                  className="text-violet-400"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}
