import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { server } from "./msw";

// jsdom has no layout; the router's scroll restoration calls this on navigation.
Object.defineProperty(window, "scrollTo", { value: () => undefined, writable: true });
// Elements have no scroll methods in jsdom either; the chat keeps its newest message in view.
Object.defineProperty(Element.prototype, "scrollTo", { value: () => undefined, writable: true });
Object.defineProperty(Element.prototype, "scrollIntoView", {
  value: () => undefined,
  writable: true,
});

// Node 25+ ships its own experimental localStorage global. Without --localstorage-file it is
// undefined, and it shadows jsdom's. Give every test a working in-memory Storage.
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}
for (const name of ["localStorage", "sessionStorage"] as const) {
  Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true });
}

// MSW answers fetch for every test; an unhandled request is a failure, never
// a silent network call. Only src/lib/api.test.ts stubs fetch with
// vi.stubGlobal, to assert on the request the client builds; that bypasses it.
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.unstubAllGlobals();
});

afterAll(() => {
  server.close();
});
