import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from './toast';
import { useToast } from './toast-context';

function Trigger({ onAction }: { onAction: () => void }) {
  const { showToast } = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        showToast({ message: 'Workout deleted', actionLabel: 'Undo', onAction, durationMs: 5000 })
      }
    >
      delete
    </button>
  );
}

describe('ToastProvider', () => {
  it('shows the message and runs the undo action on tap', async () => {
    const onAction = vi.fn();
    render(
      <ToastProvider>
        <Trigger onAction={onAction} />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Workout deleted'));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    // μετά την ενέργεια το toast κλείνει
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });
});
