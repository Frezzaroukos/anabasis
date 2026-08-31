import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CategoryBadge } from './CategoryBadge';

describe('CategoryBadge', () => {
  it('δείχνει το όνομα της κατηγορίας (σήμα όχι μόνο χρώμα → a11y)', () => {
    const { getByText } = render(<CategoryBadge category="push" />);
    expect(getByText('push')).toBeTruthy();
  });

  it('χρωματίζει ανά κατηγορία exercise', () => {
    const { getByText } = render(<CategoryBadge category="pull" />);
    expect(getByText('pull').className).toContain('text-category-pull');
  });

  it('κανονικοποιεί κατηγορίες skill: lower→legs, other→mixed', () => {
    const lower = render(<CategoryBadge category="lower" />);
    expect(lower.getByText('lower').className).toContain('text-category-legs');
    const other = render(<CategoryBadge category="other" />);
    expect(other.getByText('other').className).toContain('text-category-mixed');
  });

  it('άγνωστη κατηγορία → mixed tone (χωρίς σπάσιμο)', () => {
    const { getByText } = render(<CategoryBadge category="grip" />);
    expect(getByText('grip').className).toContain('text-category-mixed');
  });
});
