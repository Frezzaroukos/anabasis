import { useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Dumbbell, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';

/** localStorage key: αν υπάρχει, ο χρήστης έχει ήδη δει το onboarding. */
export const ONBOARDING_STORAGE_KEY = 'anabasis.onboarded';

const SLIDE_COUNT = 3;
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

  if (dismissed) return null;

  const finish = () => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    } catch {
      // αγνόησε — απλά θα ξαναδείξει το onboarding στο επόμενο load
    }
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
      icon: <Logo className="h-14 w-14 text-primary" />,
      mark: true,
      title: t('onboarding.slide1.title'),
      desc: t('onboarding.slide1.desc'),
    },
    {
      icon: <Dumbbell className="h-14 w-14 text-primary" />,
      mark: false,
      title: t('onboarding.slide2.title'),
      desc: t('onboarding.slide2.desc'),
    },
    {
      icon: <Wifi className="h-14 w-14 text-primary" />,
      mark: false,
      title: t('onboarding.slide3.title'),
      desc: t('onboarding.slide3.desc'),
    },
  ] as const;

  const current = slides[slide]!;

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex flex-col bg-background safe-top safe-bottom focus:outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={t('onboarding.title')}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex justify-end p-4">
        <Button variant="ghost" size="sm" onClick={finish}>
          {t('onboarding.skip')}
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        <div
          className={cn(
            'flex items-center justify-center rounded-full p-6',
            current.mark && 'bg-elevated shadow-glow',
          )}
        >
          {current.icon}
        </div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">{current.title}</h2>
        <p className="max-w-xs text-sm text-muted-foreground">{current.desc}</p>
      </div>

      <div className="flex items-center justify-center gap-2 pb-6" aria-hidden="true">
        {slides.map((s, i) => (
          <span
            key={s.title}
            className={cn(
              'h-1.5 w-6 rounded-full transition-colors duration-300',
              i === slide ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>

      <div className="px-6 pb-8">
        <Button
          size="lg"
          className="w-full"
          onClick={() => {
            if (isLast) finish();
            else setSlide((s) => s + 1);
          }}
        >
          {isLast ? t('onboarding.start') : t('onboarding.next')}
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
