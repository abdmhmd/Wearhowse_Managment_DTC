import { vi } from 'vitest';

/**
 * Shared '@/api/client' mock.
 *
 * Must NOT import any application module (doing so would evaluate the real
 * axios client before the mock registers). Registered globally from the vitest
 * setup file so every test-module import of '@/api/client' receives this stub.
 */
export const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  put: vi.fn(),
};
vi.mock('@/api/client', () => ({ default: mockApi }));

type HttpMethod = keyof typeof mockApi;
interface Handler {
  method: HttpMethod;
  test: (url: string, config?: any) => boolean;
  respond: (url: string, config?: any) => any;
}
const handlers: Handler[] = [];

export function when(method: HttpMethod, test: (url: string, config?: any) => boolean, respond: any) {
  handlers.push({ method, test, respond });
}

for (const method of ['get', 'post', 'patch', 'delete', 'put'] as HttpMethod[]) {
  mockApi[method].mockImplementation((url: string, config?: any) => {
    const match = handlers.find((h) => h.method === method && h.test(url, config));
    if (!match) {
      return Promise.reject(new Error(`No mock handler registered for ${method.toUpperCase()} ${url}`));
    }
    return Promise.resolve({ data: match.respond(url, config) });
  });
}

export function resetApiMock() {
  handlers.length = 0;
}