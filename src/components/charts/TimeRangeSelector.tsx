import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { CHART_RANGE_KEYS, CHART_RANGE_LABEL_KEY, type ChartRangeKey } from './timeRange';

/** Κοινός επιλογέας χρονικού εύρους (1M/3M/6M/1Y/All) — βλ. ./timeRange.ts. */
export function TimeRangeSelector({
  value,
  onChange,
  className,
}: {
  value: ChartRangeKey;
  onChange: (key: ChartRangeKey) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex gap-1', className)} role="group">
      {CHART_RANGE_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          aria-label={t(CHART_RANGE_LABEL_KEY[key])}
          className={cn(
            'rounded-md px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums transition-colors',
            value === key
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-elevated hover:text-foreground',
          )}
        >
          {key}
        </button>
      ))}
    </div>
  );
}
