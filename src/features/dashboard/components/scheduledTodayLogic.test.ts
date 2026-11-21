import { describe, expect, it } from 'vitest';
import { scheduledRowAction } from './scheduledTodayLogic';

describe('scheduledRowAction', () => {
  it('planned χωρίς ενεργή προπόνηση → start', () => {
    expect(scheduledRowAction({ status: 'planned' }, null)).toBe('start');
  });

  it('planned με ενεργή προπόνηση → continue (αντί για δεύτερο start)', () => {
    expect(scheduledRowAction({ status: 'planned' }, { id: 'workout-1' })).toBe('continue');
  });

  it('όσο φορτώνει το active query → loading (disabled, όχι flicker Start→Continue)', () => {
    expect(scheduledRowAction({ status: 'planned' }, undefined)).toBe('loading');
  });

  it('done/skipped → none', () => {
    expect(scheduledRowAction({ status: 'done' }, null)).toBe('none');
    expect(scheduledRowAction({ status: 'skipped' }, { id: 'workout-1' })).toBe('none');
  });
});
