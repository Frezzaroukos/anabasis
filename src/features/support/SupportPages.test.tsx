import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18next from 'i18next';
import en from '@/i18n/en.json';
import { HelpPage } from './HelpPage';
import { ChangelogPage } from './ChangelogPage';
import { FeedbackPage } from './FeedbackPage';

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

const renderPage = (ui: React.ReactElement) =>
  render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nextProvider>,
  );

describe('HelpPage', () => {
  it('renders every FAQ question from i18n', () => {
    renderPage(<HelpPage />);
    expect(screen.getByText(en.help.title)).toBeTruthy();
    for (const f of en.help.faq) {
      expect(screen.getByText(f.q)).toBeTruthy();
    }
  });
});

describe('ChangelogPage', () => {
  it('renders each release with its items', () => {
    renderPage(<ChangelogPage />);
    expect(screen.getByText(en.changelog.title)).toBeTruthy();
    for (const r of en.changelog.releases) {
      expect(screen.getByText(r.title)).toBeTruthy();
      expect(screen.getByText(r.items[0]!)).toBeTruthy();
    }
  });
});

describe('FeedbackPage', () => {
  it('shows an error and does not navigate when the message is empty', () => {
    const assign = vi.fn();
    const original = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, set href(v: string) { assign(v); } },
    });

    renderPage(<FeedbackPage />);
    fireEvent.click(screen.getByText(en.feedback.send));
    expect(screen.getByText(en.feedback.emptyError)).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();

    if (original) Object.defineProperty(window, 'location', original);
  });

  it('opens a prefilled mailto to contact@axonos.dev when a message is written', () => {
    let href = '';
    const original = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, origin: 'https://anabasis.axonos.dev', set href(v: string) { href = v; } },
    });

    renderPage(<FeedbackPage />);
    fireEvent.change(screen.getByLabelText(en.feedback.messageLabel), {
      target: { value: 'pull-up weight is wrong' },
    });
    fireEvent.click(screen.getByText(en.feedback.send));

    expect(href.startsWith('mailto:contact@axonos.dev?')).toBe(true);
    expect(decodeURIComponent(href)).toContain('pull-up weight is wrong');

    if (original) Object.defineProperty(window, 'location', original);
  });
});
