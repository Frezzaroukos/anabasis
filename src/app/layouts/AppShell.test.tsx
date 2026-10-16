import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import en from '@/i18n/en.json';
import { AppBootContext } from '@/app/BootContext';
import { AppShell } from './AppShell';

vi.mock('@/hooks/useActiveWorkout', () => ({ useActiveWorkout: () => null }));

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
});


function renderShell(ready: boolean) {
  return render(
    <I18nextProvider i18n={i18next}>
      <AppBootContext.Provider value={ready}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<p>Database-backed page</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppBootContext.Provider>
    </I18nextProvider>,
  );
}

describe('AppShell boot rendering', () => {
  it('shows the shared shell while keeping route content gated until bootstrap completes', () => {
    const view = renderShell(false);

    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.queryByText('Database-backed page')).toBeNull();

    view.rerender(
      <I18nextProvider i18n={i18next}>
        <AppBootContext.Provider value>
          <MemoryRouter initialEntries={['/']}>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<p>Database-backed page</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AppBootContext.Provider>
      </I18nextProvider>,
    );

    expect(screen.getByText('Database-backed page')).toBeTruthy();
  });
});
