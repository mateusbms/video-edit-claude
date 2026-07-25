import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// localStorage in-memory: o ambiente Node do Vitest não o expõe de forma
// confiável (aviso "localStorage is not available"), quebrando os testes de state.
class MemStorage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
}
Object.defineProperty(globalThis, "localStorage", {
  value: new MemStorage(), writable: true, configurable: true,
});

// Sem globals:true, o React Testing Library não registra cleanup automático;
// sem isto, renders de testes anteriores vazam no document.body.
afterEach(() => {
  cleanup();
  localStorage.clear();
});
