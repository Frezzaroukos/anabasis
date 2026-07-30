/**
 * Test setup: IndexedDB σε μνήμη + polyfills, ώστε τα components να
 * render-άρουν πραγματικά (Dexie, Recharts) χωρίς browser.
 */
import 'fake-indexeddb/auto';

// Το jsdom δεν υλοποιεί ResizeObserver· το Recharts ResponsiveContainer το απαιτεί.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: ResizeObserverStub,
    writable: true,
  });
}
