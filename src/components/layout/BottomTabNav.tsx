import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { BottomSheet } from '@/components/ui/sheet';
import { PRIMARY_NAV, SECONDARY_NAV } from './navItems';

/**
 * Πέντε tabs + «Περισσότερα».
 *
 * Ήταν έξι ισότιμα tabs: σε 390px έπεφταν ~65px το καθένα, οι ελληνικές
 * ετικέτες κόβονταν, και ΠΑΡΑ ΤΑΥΤΑ οι μισές σελίδες (Σώμα, Ιστορικό,
 * Πρόοδος, Ασκήσεις…) δεν είχαν καθόλου θέση — ζούσαν ως μια σειρά από
 * μικρά κουμπάκια στην Αρχική. Πέντε tabs για ό,τι αγγίζεις καθημερινά,
 * ένα φύλλο για τα υπόλοιπα.
 */
export function BottomTabNav() {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();

  const go = (to: string) => {
    setMoreOpen(false);
    navigate(to);
  };

  return (
    <>
      {/* bg-elevated αντί για border-t: το βήμα φωτεινότητας από το bg-background
          πίσω αρκεί για να «σηκώσει» το nav — δεν χρειάζεται γραμμή. */}
      <nav className="fixed inset-x-0 bottom-0 z-50 bg-elevated/95 backdrop-blur safe-bottom md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {PRIMARY_NAV.map(({ to, labelKey, Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'relative flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors duration-200',
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* «rung» δείκτης — ίδια γλώσσα με το σήμα (σκαλί), όχι
                        γενική υπογράμμιση. Το χρώμα μόνο του δεν αρκεί σε
                        colour-blind χρήστες, γι' αυτό μένει και το εικονίδιο accent. */}
                    <span
                      className={cn(
                        'absolute inset-x-5 top-0 h-[3px] rounded-full transition-all duration-200',
                        isActive ? 'bg-primary opacity-100 shadow-glow-sm' : 'opacity-0',
                      )}
                    />
                    <Icon className="h-5 w-5" />
                    <span className="w-full truncate px-0.5 text-center">{t(labelKey)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors duration-200',
                moreOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="w-full truncate px-0.5 text-center">{t('nav.more')}</span>
            </button>
          </li>
        </ul>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')}>
        <ul className="grid grid-cols-2 gap-2 px-4 pb-4">
          {SECONDARY_NAV.map(({ to, labelKey, Icon }) => (
            <li key={to}>
              <button
                onClick={() => go(to)}
                className="flex w-full items-center gap-3 rounded-lg bg-card px-3 py-3 text-left text-sm transition-colors hover:bg-accent"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{t(labelKey)}</span>
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
