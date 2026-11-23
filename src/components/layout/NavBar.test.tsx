import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import en from '@/i18n/en.json';
import { NavBar } from './NavBar';
import { parentRouteOf } from './parentRoute';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
});

function Probe() {
  return <span data-testid="here">{useLocation().pathname}</span>;
}

function renderAt(path: string) {
  return render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter initialEntries={[path]}>
        <NavBar />
        <Routes>
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('parentRouteOf', () => {
  it('δίνει γονέα σε σελίδες βάθους', () => {
    expect(parentRouteOf('/exercises/abc')?.to).toBe('/exercises');
    expect(parentRouteOf('/skills/planche')?.to).toBe('/skills');
    expect(parentRouteOf('/history/w1')?.to).toBe('/history');
    expect(parentRouteOf('/programs/p1')?.to).toBe('/programs');
    expect(parentRouteOf('/settings/account')?.to).toBe('/settings');
    expect(parentRouteOf('/admin')?.to).toBe('/settings');
  });

  it('δεν δίνει γονέα στις ρίζες — εκεί πλοηγεί το bottom nav', () => {
    for (const p of ['/', '/calendar', '/exercises', '/settings', '/goals']) {
      expect(parentRouteOf(p)).toBeNull();
    }
  });

  it('αγνοεί trailing slash', () => {
    expect(parentRouteOf('/exercises/abc/')?.to).toBe('/exercises');
  });
});

describe('NavBar', () => {
  it('σε deep link (χωρίς ιστορικό) πέφτει στον γονέα και πλοηγεί εκεί', () => {
    renderAt('/exercises/abc');
    fireEvent.click(screen.getByRole('button', { name: 'Exercises' }));
    expect(screen.getByTestId('here').textContent).toBe('/exercises');
  });

  it('δεν δείχνει κανένα control σε σελίδα-ρίζα χωρίς ιστορικό', () => {
    renderAt('/');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('δεν δείχνει «μπροστά» όταν δεν υπάρχει τίποτα μπροστά', () => {
    renderAt('/history/w1');
    expect(screen.queryByRole('button', { name: 'Forward' })).toBeNull();
  });
});

describe('NavBar — settings shortcut', () => {
  it('shows the Settings shortcut on normal pages but not on the Settings hub', () => {
    const { unmount } = renderAt('/calendar');
    expect(screen.getByRole('link', { name: en.nav.settings })).toBeTruthy();
    unmount();
    renderAt('/settings');
    expect(screen.queryByRole('link', { name: en.nav.settings })).toBeNull();
  });

  it('keeps the shortcut on settings sub-pages (it is the way up to the hub)', () => {
    renderAt('/settings/training');
    expect(screen.getByRole('link', { name: en.nav.settings })).toBeTruthy();
  });
});

describe('NavBar — chrome on phones', () => {
  it('root pages: the bar scrolls away on mobile (sticky only from md up)', () => {
    const { container } = renderAt('/calendar');
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.getAttribute('data-sticky')).toBe('mobile-off');
    expect(bar.className).toContain('md:sticky');
    expect(bar.className.split(' ')).not.toContain('sticky');
  });

  it('deep pages keep a sticky bar: «back» is the way out', () => {
    const { container } = renderAt('/history/w1');
    const bar = container.firstElementChild as HTMLElement;
    expect(bar.getAttribute('data-sticky')).toBe('true');
    expect(bar.className.split(' ')).toContain('sticky');
  });
});
