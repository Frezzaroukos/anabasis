import { useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowRight, Dumbbell, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo, Wordmark } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { setSafetyAck } from '@/lib/safety';

/** localStorage key: αν υπάρχει, ο χρήστης έχει ήδη δει το onboarding. */
export const ONBOARDING_STORAGE_KEY = 'anabasis.onboarded';

const SLIDE_COUNT = 4;
const SWIPE_THRESHOLD_PX = 40;

function hasOnboarded(): boolean {
  try {
    return window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    // Private browsing / disabled storage — μην μπλοκάρεις το app, δείξε το app.
    return true;
  }
}

/**
 * Full-screen overlay 3 slides που παρουσιάζει το Anabasis στην πρώτη
 * επίσκεψη. Ελέγχει μόνο του το localStorage — αν έχει ήδη ολοκληρωθεί το
 * onboarding, δεν render-άρει τίποτα (null). Δεν είναι route, mount-άρεται
 * πάνω από το κανονικό app ώστε να μη χάνεται state πλοήγησης.
 */
export function OnboardingOverlay() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(hasOnboarded);
  const [slide, setSlide] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusTrap(containerRef, !dismissed);

  useEffect(() => {
    if (dismissed) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [dismissed]);

  if (dismissed) return null;

  const finish = () => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    } catch {
      // αγνόησε — απλά θα ξαναδείξει το onboarding στο επόμενο load
    }
    // Το τελευταίο slide είναι το health-disclaimer· η ολοκλήρωση = αποδοχή.
    setSafetyAck();
    setDismissed(true);
  };

  const isLast = slide === SLIDE_COUNT - 1;

  const onTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    setTouchStartX(e.touches[0]?.clientX ?? null);
  };

  const onTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    if (touchStartX == null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX;
    const dx = endX - touchStartX;
    if (dx <= -SWIPE_THRESHOLD_PX && slide < SLIDE_COUNT - 1) setSlide((s) => s + 1);
    if (dx >= SWIPE_THRESHOLD_PX && slide > 0) setSlide((s) => s - 1);
    setTouchStartX(null);
  };

  const slides = [
    {
      // Το σήμα εδώ είναι brand moment, όχι απλό εικονίδιο — παίρνει τη δική
      // του «ανυψωμένη» πλατφόρμα + λάμψη.
      icon: <Logo summit className="h-12 w-12 text-foreground" />,
      mark: true,
      title: t('onboarding.slide1.title'),
      desc: t('onboarding.slide1.desc'),
    },
    {
      icon: <Dumbbell className="h-12 w-12 text-foreground" />,
      mark: false,
      title: t('onboarding.slide2.title'),
      desc: t('onboarding.slide2.desc'),
    },
    {
      icon: <Wifi className="h-12 w-12 text-foreground" />,
      mark: false,
      title: t('onboarding.slide3.title'),
      desc: t('onboarding.slide3.desc'),
    },
    {
      icon: <AlertTriangle className="h-12 w-12 text-foreground" />,
      mark: false,
      title: t('onboarding.safety.title'),
      desc: t('onboarding.safety.desc'),
    },
  ] as const;

  const current = slides[slide]!;
  const step = String(slide + 1).padStart(2, '0');
  const next = () => {
    if (isLast) finish();
    else setSlide((s) => s + 1);
  };

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background safe-top safe-bottom focus:outline-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={t('onboarding.title')}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full text-foreground/[0.055]"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M-80 760 C 180 580, 340 650, 500 500 S 760 330, 980 400 S 1260 270, 1540 330" />
          <path d="M-80 800 C 190 620, 360 690, 520 540 S 780 370, 1000 440 S 1280 310, 1540 370" />
          <path d="M-80 840 C 200 660, 380 730, 540 580 S 800 410, 1020 480 S 1300 350, 1540 410" />
          <path d="M-80 880 C 210 700, 400 770, 560 620 S 820 450, 1040 520 S 1320 390, 1540 450" />
          <path d="M-80 920 C 220 740, 420 810, 580 660 S 840 490, 1060 560 S 1340 430, 1540 490" />
        </g>
      </svg>
      <div className="pointer-events-none absolute -right-40 -top-48 h-[34rem] w-[34rem] rounded-full bg-gold/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -left-44 h-[30rem] w-[30rem] rounded-full bg-foreground/[0.035] blur-3xl" />

      <header className="relative z-10 flex items-center justify-between px-5 pt-5 sm:px-10 sm:pt-8">
        <Wordmark />
        <div className="flex items-center gap-3 sm:gap-5">
          <span className="font-mono text-[10px] tracking-[0.24em] text-muted-foreground">
            {step} / 04
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="border border-border/80 bg-background/40 px-4 text-muted-foreground hover:text-foreground tap:min-h-11 tap:min-w-11"
            onClick={finish}
          >
            {t('onboarding.skip')}
          </Button>
        </div>
      </header>

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 items-center overflow-y-auto overscroll-contain px-5 py-6 sm:px-10 sm:py-10">
        <div className="grid w-full items-center gap-8 sm:grid-cols-[1.15fr_0.85fr] sm:gap-14">
          <div key={slide} className="animate-rise-in">
            <div className="mb-5 flex items-center gap-3 sm:hidden">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gold/25 bg-card/70">
                {current.icon}
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold/90">
                RUNG {step}
              </span>
            </div>
            <p className="hidden font-mono text-[10px] uppercase tracking-[0.28em] text-gold/90 sm:block">
              RUNG {step} · ANABASIS
            </p>
            <h2 className="mt-4 max-w-xl font-display text-[2.6rem] font-semibold leading-[0.98] tracking-tight sm:mt-5 sm:text-6xl">
              {current.title}
            </h2>
            <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground sm:mt-6 sm:text-base sm:leading-7">
              {current.desc}
            </p>
            <div className="mt-8 flex items-center gap-4 sm:mt-10">
              <Button size="lg" className="w-full sm:w-auto" onClick={next}>
                {isLast ? t('onboarding.start') : t('onboarding.next')}
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <aside className="relative hidden min-h-[26rem] overflow-hidden rounded-[2rem] border border-border/80 bg-card/45 p-7 shadow-elevated sm:flex sm:flex-col sm:justify-between">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,hsl(var(--gold)/0.12),transparent_52%)]" />
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full text-foreground/[0.05]"
              viewBox="0 0 600 420"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <g fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M-40 300 C 70 220, 160 250, 230 180 S 360 90, 460 130 S 590 80, 680 120" />
                <path d="M-40 330 C 80 250, 170 280, 240 210 S 370 120, 470 160 S 600 110, 690 150" />
                <path d="M-40 360 C 90 280, 180 310, 250 240 S 380 150, 480 190 S 610 140, 700 180" />
                <path d="M-40 390 C 100 310, 190 340, 260 270 S 390 180, 490 220 S 620 170, 710 210" />
              </g>
            </svg>
            <div className="relative flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              <span>RUNG {step}</span>
              <span className="text-gold/80">ANABASIS</span>
            </div>
            <div className="relative flex flex-1 items-center justify-center py-8">
              <div className="absolute h-48 w-48 rounded-full border border-border/60" />
              <div className="absolute h-64 w-64 rounded-full border border-border/35" />
              <div
                className={cn(
                  'relative flex h-28 w-28 items-center justify-center rounded-full border border-gold/25 bg-background/70 shadow-glow',
                  current.mark && 'ring-1 ring-gold/15',
                )}
              >
                {current.icon}
              </div>
            </div>
            <div className="relative">
              <div className="mb-4 h-px bg-gradient-to-r from-gold/70 via-border to-transparent" />
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground">
                    ALTITUDE
                  </p>
                  <p className="mt-1 font-display text-5xl leading-none tracking-tight text-foreground">
                    {step}
                  </p>
                </div>
                <div className="flex items-end gap-1.5" aria-hidden="true">
                  {slides.map((s, i) => (
                    <span
                      key={s.title}
                      className={cn(
                        'w-1 rounded-full transition-all duration-500',
                        i <= slide ? 'bg-gold' : 'bg-border',
                        i === slide ? 'h-10' : 'h-6',
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <footer className="relative z-10 border-t border-border/60 bg-background/35">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5 sm:px-10 sm:py-6">
          <div className="flex items-center gap-2" aria-hidden="true">
            {slides.map((s, i) => (
              <span
                key={s.title}
                className={cn(
                  'h-1 rounded-full transition-all duration-300',
                  i === slide ? 'w-10 bg-gold' : 'w-5 bg-muted',
                )}
              />
            ))}
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {step} / 04
          </p>
        </div>
      </footer>
    </div>
  );
}
