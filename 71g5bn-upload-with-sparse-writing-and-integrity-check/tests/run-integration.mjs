import { spawn } from "node:child_process";
import net from "node:net";

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForPort(port) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, "127.0.0.1");
    });
    if (ok) return;
    // eslint-disable-next-line no-await-in-loop
    await sleep(200);
  }
  throw new Error("server_port_not_ready");
}

function runNode(args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`process_failed:${args.join(" ")}:${code}`));
    });
  });
}

async function main() {
  const serverPath = "/app/repository_after/backend/dist/server.js";

  const server = spawn("node", [serverPath], {
    stdio: "inherit",
    env: { ...process.env, PORT: String(PORT) },
  });

  try {
    await waitForPort(PORT);
    await runNode(["/app/tests/resumable-upload.integration.mjs"], {
      BASE_URL,
    });

    // Restart server to validate persisted metadata for resume
    server.kill("SIGTERM");
    await sleep(500);

    const server2 = spawn("node", [serverPath], {
      stdio: "inherit",
      env: { ...process.env, PORT: String(PORT) },
    });

    try {
      await waitForPort(PORT);
      await runNode(["/app/tests/resumable-upload.integration.mjs"], {
        BASE_URL,
      });
    } finally {
      server2.kill("SIGTERM");
    }
  } finally {
    server.kill("SIGTERM");
  }
}

main().catch((e) => {
  console.error("INTEGRATION RUN FAILED:", e?.stack || e);
  process.exit(1);
});
