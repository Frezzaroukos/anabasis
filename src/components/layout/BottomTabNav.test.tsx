import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import en from '@/i18n/en.json';
import { CommandMenuProvider } from '@/components/CommandMenu';
import { BottomTabNav } from './BottomTabNav';
import { PRIMARY_NAV } from './navItems';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
});

function renderAt(path: string) {
  return render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter initialEntries={[path]}>
        <CommandMenuProvider>
          <BottomTabNav />
        </CommandMenuProvider>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('BottomTabNav — aria-current', () => {
  it('σημειώνει το ενεργό tab με aria-current="page" και μόνο αυτό', () => {
    const target = PRIMARY_NAV[0]!;
    renderAt(target.to);

    const active = screen.getByRole('link', { name: i18next.t(target.labelKey) });
    // Το ενεργό NavLink παίρνει aria-current="page" αυτόματα (react-router).
    const current = screen
      .getAllByRole('link')
      .filter((el) => el.getAttribute('aria-current') === 'page');
    expect(current.length).toBe(1);
    expect(active.getAttribute('aria-current')).toBe('page');
  });

  it('σε άλλη διαδρομή κανένα άλλο tab δεν είναι current', () => {
    renderAt('/definitely-not-a-nav-route');
    const current = screen.getAllByRole('link').filter((el) => el.getAttribute('aria-current') === 'page');
    expect(current.length).toBe(0);
  });
});
