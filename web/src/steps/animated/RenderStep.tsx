import { useEffect, useState } from "react";
import { useAppStore } from "../../state";

const API = (import.meta.env.VITE_API_URL ?? "http://localhost:8000") as string;

type Progress = { percent: number; line?: string };

export function RenderStep() {
  const jobId = useAppStore((s) => s.animatedState.jobId);
  const [progress, setProgress] = useState<Progress>({ percent: 0 });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    // SSE endpoint for animated render progress.
    // Named events emitted by the backend: "progress", "done", "error".
    const es = new EventSource(`${API}/jobs/${jobId}/events`);

    es.addEventListener("progress", (ev) => {
      try {
        const data = JSON.parse(ev.data);
        // Backend emits: { n, total, kind, format } — derive percent from n/total.
        if (data.n != null && data.total != null && data.total > 0) {
          const percent = Math.min(100, Math.round((data.n / data.total) * 100));
          const line = `${data.kind ?? "rendering"} ${data.n}/${data.total}`;
          setProgress({ percent, line });
        } else if (data.percent != null) {
          setProgress({ percent: data.percent, line: data.line });
        }
      } catch {
        // Non-JSON SSE message — ignore
      }
    });

    es.addEventListener("done", () => {
      setDone(true);
      es.close();
    });

    es.addEventListener("error", (ev) => {
      try {
        const data = JSON.parse((ev as MessageEvent).data);
        setError(data.detail ?? data.message ?? "Erro no render");
      } catch {
        setError("Conexão SSE perdida");
      }
      es.close();
    });

    es.onerror = () => {
      setError("Conexão SSE perdida");
      es.close();
    };

    return () => es.close();
  }, [jobId]);

  if (!jobId) return <div style={{ padding: 32 }}>Nenhum job em andamento.</div>;

  return (
    <div style={{ padding: 32 }}>
      <h2>Render</h2>
      <p>Job: <code>{jobId}</code></p>
      {!done && !error && (
        <>
          <div style={{
            width: "100%", height: 8, background: "#e2e2dc",
            borderRadius: 4, overflow: "hidden",
          }}>
            <div style={{
              width: `${progress.percent}%`, height: "100%", background: "#16a34a",
              transition: "width 200ms",
            }} />
          </div>
          <p style={{ fontSize: 13, color: "#757568", marginTop: 8 }}>
            {progress.line ?? `${progress.percent.toFixed(0)}%`}
          </p>
        </>
      )}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {done && (
        <div style={{ marginTop: 16 }}>
          <p>Renderização completa.</p>
          <a
            href={`${API}/jobs/${jobId}/output`}
            download
            style={{
              display: "inline-block", padding: "8px 16px",
              background: "#16a34a", color: "white",
              textDecoration: "none", borderRadius: 8,
            }}
          >
            Baixar MP4
          </a>
        </div>
      )}
    </div>
  );
}
