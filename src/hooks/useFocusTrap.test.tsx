import { describe, expect, it } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useFocusTrap } from './useFocusTrap';

function TestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open);
  if (!open) return null;
  return (
    <div ref={ref} tabIndex={-1} data-testid="modal">
      <button>first</button>
      <button>middle</button>
      <button onClick={onClose}>last-and-close</button>
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>outside-trigger</button>
      <TestModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

describe('useFocusTrap', () => {
  it('μεταφέρει το focus στο πρώτο εστιάσιμο στοιχείο όταν ανοίγει', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('outside-trigger'));
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('Tab από το τελευταίο τυλίγεται στο πρώτο', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('outside-trigger'));
    screen.getByText('last-and-close').focus();
    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('Shift+Tab από το πρώτο τυλίγεται στο τελευταίο', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('outside-trigger'));
    screen.getByText('first').focus();
    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('last-and-close'));
  });

  it('Tab στη μέση δεν αλλάζει τίποτα (το browser χειρίζεται το φυσιολογικό tab-order)', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('outside-trigger'));
    screen.getByText('middle').focus();
    fireEvent.keyDown(screen.getByTestId('modal'), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('middle'));
  });

  it('επαναφέρει το focus στο στοιχείο που το άνοιξε, όταν κλείνει', () => {
    render(<Harness />);
    const trigger = screen.getByText('outside-trigger');
    // jsdom δεν εστιάζει αυτόματα σε click (σε αντίθεση με πραγματικό
    // browser) — προσομοιώνουμε ρητά ότι ο trigger είχε ήδη focus, όπως θα
    // συνέβαινε σε πραγματική χρήση (mouse ή πληκτρολόγιο).
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByText('first'));

    fireEvent.click(screen.getByText('last-and-close'));
    expect(document.activeElement).toBe(trigger);
  });
});
