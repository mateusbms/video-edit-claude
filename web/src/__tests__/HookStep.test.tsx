import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { HookStep } from "../steps/HookStep";

afterEach(cleanup);

function mockFetch() {
  const calls: any[] = [];
  const f = vi.fn(async (url: string, init?: any) => {
    calls.push({ url, init });
    if (url.endsWith("/hook") && (!init || !init.method || init.method === "GET"))
      return { ok: true, json: async () => ({ title: "T", subtitle: "", duration_frames: 90 }) } as any;
    if (url.endsWith("/transcript"))
      return { ok: true, json: async () => [] } as any;
    if (url.match(/\/jobs\/[^/]+$/) && (!init || !init.method))
      return { ok: true, json: async () => ({ slug: "s1", captionStyle: { fontSize: 48, bottom: 120, color: "", highlightColor: "", fontFamily: "" }, probe: { fps: 30 } }) } as any;
    return { ok: true, json: async () => ({ ok: true }) } as any;
  });
  vi.stubGlobal("fetch", f);
  return calls;
}

const props = { slug: "s1", setSlug: () => {}, next: () => {}, back: () => {} };

describe("HookStep", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mostra os controles de estilo do hook", async () => {
    mockFetch();
    render(<HookStep {...props} />);
    expect(await screen.findByLabelText(/tamanho do hook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fonte do hook/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/ancora do hook/i)).toBeInTheDocument();
  });

  it("mudar o tamanho persiste via PUT /hook (debounce)", async () => {
    const calls = mockFetch();
    render(<HookStep {...props} />);
    const range = await screen.findByLabelText(/tamanho do hook/i);
    fireEvent.change(range, { target: { value: "120" } });
    await waitFor(() => {
      const put = calls.find((c) => c.init?.method === "PUT" && c.url.endsWith("/hook"));
      expect(put).toBeTruthy();
      expect(JSON.parse(put.init.body).fontSize).toBe(120);
    }, { timeout: 2000 });
  });
});
