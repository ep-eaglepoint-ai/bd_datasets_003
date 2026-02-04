import React, { useMemo, useState } from "react";
import { ResumableUploadEngine } from "./uploadEngine/uploadEngine";

export function App() {
  const engine = useMemo(() => new ResumableUploadEngine(), []);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("Idle");

  return (
    <div style={{ fontFamily: "system-ui", padding: 16, maxWidth: 720 }}>
      <h1>Resumable Upload</h1>
      <p>Chunks: 5MB, concurrency: 3, resume via HEAD handshake.</p>

      <input
        type="file"
        onChange={(e) => {
          setFile(e.target.files?.[0] ?? null);
          setStatus("Idle");
        }}
      />

      <div style={{ marginTop: 12 }}>
        <button
          disabled={!file}
          onClick={async () => {
            if (!file) return;
            setStatus("Uploading...");
            try {
              const st = await engine.startOrResume(file, (s) => {
                setStatus(
                  `${s.state} (${s.uploadedChunks}/${s.totalChunks} chunks)`
                );
              });
              setStatus(`Done (${st.uploadId})`);
            } catch (e: any) {
              setStatus(`Error: ${String(e?.message ?? e)}`);
            }
          }}
        >
          Start / Resume
        </button>
      </div>

      <pre
        style={{
          marginTop: 12,
          background: "#f6f8fa",
          padding: 12,
          borderRadius: 6,
        }}
      >
        {status}
      </pre>
    </div>
  );
}
