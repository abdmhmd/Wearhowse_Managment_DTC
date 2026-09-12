import './api-mock';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// cmdk (and Radix Popover) depend on ResizeObserver / scrollIntoView / matchMedia,
// which jsdom does not provide. Provide lightweight stubs so the picker renders
// in jsdom.
if (typeof ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as any).ResizeObserver = ResizeObserverStub;
}

if (typeof window !== 'undefined' && !('scrollIntoView' in Element.prototype)) {
  (Element.prototype as any).scrollIntoView = () => {};
}

if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

afterEach(() => {
  cleanup();
});