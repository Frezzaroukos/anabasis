import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import en from '@/i18n/en.json';
import el from '@/i18n/el.json';
import { CommandMenuProvider, fuzzyScore, useCommandMenu } from './CommandMenu';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      fallbackLng: 'en',
      resources: {
        en: { translation: en },
        el: { translation: el },
      },
      interpolation: { escapeValue: false },
    });
  }
});

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function Trigger() {
  const { open } = useCommandMenu();
  return (
    <button data-testid="trigger" onClick={open}>
      trigger
    </button>
  );
}

function ExternalNav() {
  const navigate = useNavigate();
  return (
    <button data-testid="external" onClick={() => navigate('/body')}>
      external
    </button>
  );
}

function renderMenu() {
  return render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter initialEntries={['/']}>
        <CommandMenuProvider>
          <Trigger />
          <ExternalNav />
          <LocationProbe />
        </CommandMenuProvider>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

async function openWithKeyboard() {
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  await screen.findByRole('dialog');
}

describe('fuzzyScore', () => {
  it('αγνοεί τόνους, τελικό σίγμα και πεζά/κεφαλαία', () => {
    expect(fuzzyScore('ημερολογιο', 'Ημερολόγιο')).toBeGreaterThan(0);
    expect(fuzzyScore('προπονηση', 'Προπόνηση')).toBeGreaterThan(0);
    expect(fuzzyScore('calendar', 'Ημερολόγιο Calendar')).toBeGreaterThan(0);
    expect(fuzzyScore('zzz', 'Calendar')).toBe(0);
  });
});

describe('CommandMenu', () => {
  it('ανοίγει με Ctrl+K, είναι modal και παίρνει focus στο input', async () => {
    renderMenu();
    await openWithKeyboard();

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    await waitFor(() => expect(screen.getByRole('combobox')).toBe(document.activeElement));
  });

  it('φιλτράρει και εκτελεί την επιλεγμένη ενέργεια με Enter', async () => {
    renderMenu();
    await openWithKeyboard();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'changelog' } });

    expect(screen.getByRole('option', { name: /what's new/i })).toBeTruthy();
    expect(screen.queryByRole('option', { name: /achievements/i })).toBeNull();

    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/whats-new'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('μετακινεί την επιλογή με βελάκια και ανοίγει με Enter', async () => {
    renderMenu();
    await openWithKeyboard();

    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'settings' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(screen.getByTestId('location').textContent).toBe('/settings/profiles'),
    );
  });

  it('βρίσκει ελληνικές ετικέτες ακόμη κι όταν το UI είναι αγγλικό', async () => {
    renderMenu();
    await openWithKeyboard();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ημερολογιο' } });
    expect(screen.getByRole('option', { name: /calendar/i })).toBeTruthy();
  });

  it('κλείνει με Escape και επιστρέφει το focus στο trigger', async () => {
    renderMenu();
    const trigger = screen.getByTestId('trigger');
    trigger.focus();

    await openWithKeyboard();
    await waitFor(() => expect(screen.getByRole('combobox')).toBe(document.activeElement));

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('κλείνει όταν αλλάζει η διαδρομή', async () => {
    renderMenu();
    await openWithKeyboard();

    fireEvent.click(screen.getByTestId('external'));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/body'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
