import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ChevronDown, Info, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  GUIDE_SECTIONS,
  PASTE_EXAMPLES,
  QUICK_LOG_EXAMPLES,
} from './guideContent';

/** Αναζήτηση χωρίς τόνους/κεφαλαία — ίδια λογική σε EL και EN. */
function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * In-app οδηγός χρήσης: πραγματικές ροές και πραγματικά labels κουμπιών.
 * Κάθε ενότητα δηλώνει τα label keys της (guideContent.ts) και το test
 * επιβεβαιώνει ότι υπάρχουν σε EN + EL — ο οδηγός δεν μπορεί να ξεφύγει από
 * το UI.
 */
export function GuidePage() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set([GUIDE_SECTIONS[0]!.id]),
  );

  const sections = GUIDE_SECTIONS.map((section) => {
    const title = t(section.titleKey);
    const intro = t(section.introKey);
    const steps = section.stepKeys.map((key) => t(key));
    const note = section.noteKey ? t(section.noteKey) : null;
    const labels = section.labelKeys.map((key) => t(key));
    const searchText = normalize(
      [title, intro, ...steps, note ?? '', ...labels].join(' '),
    );
    return { ...section, title, intro, steps, note, labels, searchText };
  });

  const q = normalize(query);
  const visible = q
    ? sections.filter((section) => section.searchText.includes(q))
    : sections;

  const toggle = (id: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          {t('guide.eyebrow')}
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t('guide.title')}
        </h1>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t('guide.subtitle')}
        </p>
      </header>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('guide.searchLabel')}
          placeholder={t('guide.searchPlaceholder')}
          className="h-11 pl-9"
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('guide.noResults')}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((section) => {
            const expanded = q !== '' || openIds.has(section.id);
            const panelId = `guide-${section.id}`;
            return (
              <section key={section.id} className="rounded-xl bg-card">
                <h2>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggle(section.id)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-xl px-4 py-3 text-left ring-offset-background transition-colors hover:bg-elevated focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span className="min-w-0 flex-1 text-sm font-semibold">
                      {section.title}
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                        expanded && 'rotate-180',
                      )}
                      aria-hidden
                    />
                  </button>
                </h2>
                {expanded && (
                  <div
                    id={panelId}
                    role="region"
                    aria-label={section.title}
                    className="space-y-4 border-t border-border/60 px-4 pb-4 pt-3"
                  >
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {section.intro}
                    </p>
                    <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
                      {section.steps.map((step, index) => (
                        <li key={index}>{step}</li>
                      ))}
                    </ol>

                    {section.examples && (
                      <div className="space-y-3">
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('guide.quickExamples')}
                          </p>
                          <pre className="overflow-x-auto rounded-lg bg-elevated p-3 font-mono text-xs leading-6">
                            <code>{QUICK_LOG_EXAMPLES.join('\n')}</code>
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('guide.pasteExamples')}
                          </p>
                          <pre className="overflow-x-auto rounded-lg bg-elevated p-3 font-mono text-xs leading-6">
                            <code>{PASTE_EXAMPLES.join('\n')}</code>
                          </pre>
                        </div>
                      </div>
                    )}

                    {section.note && (
                      <div className="flex items-start gap-2 rounded-lg border-l-2 border-primary/50 bg-primary/5 px-3 py-2">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {section.note}
                        </p>
                      </div>
                    )}

                    {section.labels.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {t('guide.buttonsHeading')}
                        </p>
                        <ul className="flex flex-wrap gap-1.5">
                          {section.labels.map((label, index) => (
                            <li
                              key={`${section.id}-${index}`}
                              className="rounded-full border border-border/70 bg-elevated px-2.5 py-1 text-xs text-muted-foreground"
                            >
                              {label}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
