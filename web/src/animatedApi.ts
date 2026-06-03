const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type BrandKit = {
  slug: string; name: string; logo: string;
  colors: any; fonts: any;
};

export async function listBrandKits(): Promise<BrandKit[]> {
  const r = await fetch(`${API}/brand-kits`);
  return r.json();
}

export async function createBrandKit(input: FormData): Promise<BrandKit> {
  const r = await fetch(`${API}/brand-kits`, { method: "POST", body: input });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateBrandKit(slug: string, input: FormData): Promise<BrandKit> {
  const r = await fetch(`${API}/brand-kits/${slug}`, { method: "PUT", body: input });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteBrandKit(slug: string): Promise<void> {
  const r = await fetch(`${API}/brand-kits/${slug}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
}

export async function createAnimatedJob(body: {
  brandKitSlug: string;
  scripts: { key: string; text: string }[];
  orientation: "16x9" | "9x16";
}): Promise<{ jobId: string }> {
  const r = await fetch(`${API}/jobs/animated`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export type TtsResult = {
  key: string; file: string; seconds: number; frames: number;
};

export async function generateTts(body: {
  jobId: string;
  scripts: { key: string; text: string }[];
}): Promise<TtsResult[]> {
  const r = await fetch(`${API}/tts/generate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
