import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check } from 'lucide-react';
import { parseNotionCalories, type ParsedCalorieRow } from '@/lib/import/notionCalories';
import { importBodyMetrics } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Εισαγωγή ιστορικών θερμίδων από Notion. Η πηγή είναι messy (math, σχόλια,
 * λάθη ημερομηνιών), οπότε: preview με ΚΑΘΕ ύποπτη τιμή σημαδεμένη πριν το
 * import — ο χρήστης έχει τον έλεγχο, καμία σιωπηλή μαντεψιά.
 */
export function ImportPage() {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [year, setYear] = useState(2025);
  const [result, setResult] = useState<{ added: number; updated: number } | null>(null);
  const [busy, setBusy] = useState(false);
  // ημερομηνίες που ο χρήστης ξεδιάλεξε να ΜΗΝ εισαχθούν (τα ύποπτα)
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const parsed = useMemo(() => parseNotionCalories(text, year), [text, year]);
  const rows = parsed.rows;
  const reviewCount = rows.filter((r) => r.needsReview).length;

  const toggle = (date: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const onImport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const toImport = rows
        .filter((r) => !excluded.has(r.date))
        .map((r) => ({ date: r.date, patch: { calories_in: r.calories } }));
      const res = await importBodyMetrics(toImport);
      setResult(res);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <Link to="/settings" className="text-xs text-muted-foreground hover:text-foreground">
          ← {t('settings.title')}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('import.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('import.hint')}</p>
      </header>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <label className="text-sm">{t('import.startYear')}</label>
          <div className="flex gap-1">
            {[2024, 2025, 2026].map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={cn(
                  'rounded-md border border-border px-3 py-1 font-mono text-sm transition-colors',
                  year === y ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('import.placeholder')}
          rows={8}
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">{t('import.formatHint')}</p>
      </section>

      {rows.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">
              {t('import.preview')} · {rows.length} {t('import.days')}
            </h2>
            {reviewCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-500">
                <AlertTriangle className="h-3 w-3" />
                {reviewCount} {t('import.needReview')}
              </span>
            )}
          </div>

          <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
            {rows.map((r) => (
              <PreviewRow
                key={r.date}
                row={r}
                excluded={excluded.has(r.date)}
                onToggle={() => toggle(r.date)}
              />
            ))}
          </ul>

          <Button
            className="w-full"
            disabled={busy || rows.length === excluded.size}
            onClick={() => void onImport()}
          >
            {t('import.doImport', { count: rows.length - excluded.size })}
          </Button>
        </section>
      )}

      {result && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">
          <Check className="h-4 w-4 text-primary" />
          {t('import.done', { added: result.added, updated: result.updated })}
        </div>
      )}
    </div>
  );
}

function PreviewRow({
  row,
  excluded,
  onToggle,
}: {
  row: ParsedCalorieRow;
  excluded: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-sm',
        excluded && 'opacity-40',
        row.needsReview && !excluded && 'bg-amber-500/5',
      )}
    >
      <input
        type="checkbox"
        checked={!excluded}
        onChange={onToggle}
        className="h-4 w-4 shrink-0 accent-primary"
        aria-label={row.date}
      />
      <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{row.date}</span>
      <span className="w-16 shrink-0 font-mono">{row.calories}</span>
      {row.needsReview && (
        <span className="flex min-w-0 items-center gap-1 text-xs text-amber-500">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">{row.raw}</span>
        </span>
      )}
    </li>
  );
}
