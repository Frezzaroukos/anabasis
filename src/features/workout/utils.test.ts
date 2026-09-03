import { describe, expect, it } from 'vitest';
import {
  formatLoad,
  formatPaceMinPerKm,
  groupColorClass,
  isChainSetType,
  isEmptyDraftWorkout,
  resolveSetGroup,
} from './utils';

describe('formatLoad', () => {
  it('bodyweight χωρίς πρόσθετο φορτίο → "BW"', () => {
    expect(formatLoad(null, null)).toBe('BW');
  });

  it('kg (default unit): δείχνει το βάρος όπως αποθηκεύτηκε', () => {
    expect(formatLoad(80, null)).toBe('80kg');
    expect(formatLoad(80, null, 'kg')).toBe('80kg');
  });

  it('BW + πρόσθετο φορτίο', () => {
    expect(formatLoad(20, 75, 'kg')).toBe('BW+20kg');
  });

  it('lb: μετατρέπει το αποθηκευμένο kg στη μονάδα του χρήστη', () => {
    // 100kg → 220.5lb (plate-realistic, βήμα 0.5)
    expect(formatLoad(100, null, 'lb')).toBe('220.5lb');
    expect(formatLoad(20, 75, 'lb')).toBe('BW+44lb');
  });
});

describe('isEmptyDraftWorkout', () => {
  it('set-logged χωρίς κανένα σετ → draft (discard, όχι finish)', () => {
    expect(isEmptyDraftWorkout(true, 0)).toBe(true);
  });

  it('set-logged με τουλάχιστον ένα σετ → όχι draft', () => {
    expect(isEmptyDraftWorkout(true, 1)).toBe(false);
    expect(isEmptyDraftWorkout(true, 5)).toBe(false);
  });

  it('δραστηριότητα χωρίς σετ (run/bike/...) → ποτέ draft, ακόμα και με 0 "σετ"', () => {
    expect(isEmptyDraftWorkout(false, 0)).toBe(false);
  });
});

describe('resolveSetGroup', () => {
  it('δεν ανοίγει αλυσίδα για normal/warmup/amrap/failure', () => {
    expect(resolveSetGroup('normal', null, 'new-id')).toEqual({ groupId: null, chain: null });
    expect(resolveSetGroup('warmup', null, 'new-id')).toEqual({ groupId: null, chain: null });
    expect(resolveSetGroup('amrap', null, 'new-id')).toEqual({ groupId: null, chain: null });
    expect(resolveSetGroup('failure', null, 'new-id')).toEqual({ groupId: null, chain: null });
  });

  it('ανοίγει νέα αλυσίδα όταν δεν υπάρχει ενεργή', () => {
    const result = resolveSetGroup('dropset', null, 'group-1');
    expect(result).toEqual({ groupId: 'group-1', chain: { id: 'group-1', type: 'dropset' } });
  });

  it('συνεχίζει την ίδια αλυσίδα (ίδιο group_id) όταν ο τύπος ταιριάζει', () => {
    const active = { id: 'group-1', type: 'superset' as const };
    const result = resolveSetGroup('superset', active, 'ignored-new-id');
    expect(result.groupId).toBe('group-1');
    expect(result.chain).toBe(active); // ίδια instance — δεν δημιουργεί νέα
  });

  it('ανοίγει νέα αλυσίδα όταν ο τύπος chain αλλάζει (π.χ. superset → dropset)', () => {
    const active = { id: 'group-1', type: 'superset' as const };
    const result = resolveSetGroup('dropset', active, 'group-2');
    expect(result).toEqual({ groupId: 'group-2', chain: { id: 'group-2', type: 'dropset' } });
  });

  it('rest_pause συνεχίζει επίσης σωστά αλυσίδα', () => {
    const active = { id: 'group-9', type: 'rest_pause' as const };
    const result = resolveSetGroup('rest_pause', active, 'ignored');
    expect(result.groupId).toBe('group-9');
  });
});

describe('isChainSetType', () => {
  it('αναγνωρίζει μόνο dropset/superset/rest_pause', () => {
    expect(isChainSetType('dropset')).toBe(true);
    expect(isChainSetType('superset')).toBe(true);
    expect(isChainSetType('rest_pause')).toBe(true);
    expect(isChainSetType('normal')).toBe(false);
    expect(isChainSetType('warmup')).toBe(false);
    expect(isChainSetType('amrap')).toBe(false);
    expect(isChainSetType('failure')).toBe(false);
  });
});

describe('groupColorClass', () => {
  it('δίνει σταθερό χρώμα για το ίδιο group_id', () => {
    const a = groupColorClass('same-group-id');
    const b = groupColorClass('same-group-id');
    expect(a).toBe(b);
  });

  it('παράγει έγκυρη Tailwind class', () => {
    expect(groupColorClass('abc')).toMatch(/^border-l-2 border-\w+-500\/80$/);
  });
});

describe('formatPaceMinPerKm', () => {
  it('υπολογίζει ρυθμό σε min:ss/km', () => {
    // 5km σε 25 λεπτά (1500s) = 5:00/km
    expect(formatPaceMinPerKm(1500, 5)).toBe('5:00/km');
  });

  it('στρογγυλοποιεί σωστά τα δευτερόλεπτα', () => {
    // 10km σε 47:30 (2850s) = 4:45/km
    expect(formatPaceMinPerKm(2850, 10)).toBe('4:45/km');
  });

  it('επιστρέφει null όταν λείπει απόσταση ή χρόνος', () => {
    expect(formatPaceMinPerKm(0, 5)).toBeNull();
    expect(formatPaceMinPerKm(1500, 0)).toBeNull();
    expect(formatPaceMinPerKm(1500, -1)).toBeNull();
  });
});
