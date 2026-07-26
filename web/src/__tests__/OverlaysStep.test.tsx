import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { OverlaysStep } from "../steps/OverlaysStep";

afterEach(cleanup);

function mockFetch() {
  const calls: any[] = [];
  const f = vi.fn(async (url: string, init?: any) => {
    calls.push({ url, init });
    if (url.endsWith("/overlays") && (!init || init.method === "GET" || !init.method))
      return { ok: true, json: async () => [] } as any;
    if (url.match(/\/jobs\/.+$/) && (!init || !init.method))
      return { ok: true, json: async () => ({ slug: "s1", probe: { width: 1920, height: 1080, fps: 30, duration: 10 } }) } as any;
    return { ok: true, json: async () => ({ ok: true }) } as any;
  });
  vi.stubGlobal("fetch", f);
  return calls;
}

describe("OverlaysStep", () => {
  beforeEach(() => { mockFetch(); });
  afterEach(() => vi.unstubAllGlobals());

  const props = { slug: "s1", setSlug: () => {}, next: () => {}, back: () => {} };

  it("adiciona um texto e ele aparece na lista", async () => {
    render(<OverlaysStep {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: /texto/i }));
    expect(await screen.findByDisplayValue(/novo texto/i)).toBeInTheDocument();
  });

  it("salvar chama PUT /overlays com o item", async () => {
    const calls = mockFetch();
    render(<OverlaysStep {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: /texto/i }));
    fireEvent.click(screen.getByRole("button", { name: /salvar/i }));
    await waitFor(() => {
      const put = calls.find((c) => c.init?.method === "PUT" && c.url.endsWith("/overlays"));
      expect(put).toBeTruthy();
      expect(JSON.parse(put.init.body).length).toBe(1);
    });
  });

  it("remover tira o item da lista", async () => {
    render(<OverlaysStep {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: /texto/i }));
    expect(await screen.findByDisplayValue(/novo texto/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remover/i }));
    expect(screen.queryByDisplayValue(/novo texto/i)).not.toBeInTheDocument();
  });

  it("não avança de passo quando o salvar falha", async () => {
    const next = vi.fn();
    const f = vi.fn(async (url: string, init?: any) => {
      if (url.endsWith("/overlays") && (!init || !init.method || init.method === "GET"))
        return { ok: true, json: async () => [] } as any;
      if (url.match(/\/jobs\/.+$/) && (!init || !init.method))
        return { ok: true, json: async () => ({ slug: "s1", probe: { fps: 30 } }) } as any;
      if (init?.method === "PUT")
        return { ok: false, statusText: "erro", json: async () => ({ detail: "boom" }) } as any;
      return { ok: true, json: async () => ({ ok: true }) } as any;
    });
    vi.stubGlobal("fetch", f);
    render(<OverlaysStep {...props} next={next} />);
    fireEvent.click(await screen.findByRole("button", { name: /texto/i }));
    fireEvent.click(screen.getByRole("button", { name: /próximo/i }));
    await waitFor(() => expect(screen.getByText(/boom/i)).toBeInTheDocument());
    expect(next).not.toHaveBeenCalled();
  });
});
