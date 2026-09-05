import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

/**
 * Θέση μέσα στο ιστορικό — για ορατά κουμπιά πίσω/μπροστά.
 *
 * Σε εγκατεστημένη PWA (`display: standalone`) και στο Tauri desktop ΔΕΝ
 * υπάρχει καθόλου browser chrome: ούτε βέλος πίσω, ούτε χειρονομία στο iOS.
 * Χωρίς δικό μας control, κάθε σελίδα βάθους είναι αδιέξοδο.
 *
 * Το `idx` το κρατά ο ίδιος ο react-router στο `history.state` (@remix-run/router),
 * οπότε δεν χρειάζεται δικός μας μετρητής. Το μόνο που λείπει είναι το
 * «υπάρχει κάτι μπροστά;»: το κρατάμε ως μέγιστο idx που έχουμε δει, γιατί
 * ένα PUSH σβήνει τις forward εγγραφές ενώ ένα POP τις αφήνει.
 *
 * Το Navigation API (`navigation.canGoBack/canGoForward`) θα τα έδινε έτοιμα,
 * αλλά έγινε Baseline μόλις τον Ιαν. 2026 — Safari 26.2 / Firefox 147. Πολύ
 * φρέσκο για να στηριχτεί εδώ πάνω η πλοήγηση.
 */
function readIdx(): number | null {
  if (typeof window === 'undefined') return null;
  const state = window.history.state as { idx?: unknown } | null;
  return typeof state?.idx === 'number' ? state.idx : null;
}

export interface HistoryNav {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
}

export function useHistoryNav(): HistoryNav {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const maxIdx = useRef(0);
  const [pos, setPos] = useState({ idx: 0, max: 0 });

  useEffect(() => {
    const idx = readIdx();
    // null = εγγραφή που δεν έβαλε ο router (π.χ. το overlay entry του
    // useBackToClose). Κράτα ό,τι ξέραμε αντί να μηδενίσεις τα κουμπιά.
    if (idx == null) return;
    maxIdx.current = navigationType === 'PUSH' ? idx : Math.max(maxIdx.current, idx);
    setPos({ idx, max: maxIdx.current });
  }, [location.key, navigationType]);

  return {
    canGoBack: pos.idx > 0,
    canGoForward: pos.idx < pos.max,
    goBack: () => navigate(-1),
    goForward: () => navigate(1),
  };
}
