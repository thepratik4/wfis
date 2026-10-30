import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

function getBackendBaseUrl(): string {
  const envUrl = process.env.BACKEND_URL;
  if (envUrl) {
    return envUrl.endsWith("/") ? envUrl.slice(0, -1) : envUrl;
  }
  return "http://127.0.0.1:8000";
}

let startupPromise: Promise<void> | null = null;

async function isBackendHealthy(timeoutMs = 600): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const healthUrl = new URL("/api/health", getBackendBaseUrl());
    const res = await fetch(healthUrl, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensurePythonBackendRunning(): Promise<void> {
  // On Vercel, serverless containers do not support long-running uvicorn child processes;
  // backend service is managed independently via Vercel Services or external host.
  if (process.env.VERCEL || process.env.NODE_ENV === "production" || process.env.BACKEND_URL) {
    return;
  }

  if (await isBackendHealthy(500)) {
    return;
  }

  if (startupPromise) {
    return startupPromise;
  }

  startupPromise = (async () => {
    try {
      if (await isBackendHealthy(500)) {
        return;
      }

      const rootDir = process.cwd();
      const backendDir = path.join(rootDir, "backend");
      const isWin = process.platform === "win32";
      const venvUvicorn = isWin
        ? path.join(rootDir, ".venv", "Scripts", "uvicorn.exe")
        : path.join(rootDir, ".venv", "bin", "uvicorn");
      const venvPython = isWin
        ? path.join(rootDir, ".venv", "Scripts", "python.exe")
        : path.join(rootDir, ".venv", "bin", "python");

      let executable = "uvicorn";
      let args = ["app.main:app", "--host", "127.0.0.1", "--port", "8000"];

      if (fs.existsSync(venvUvicorn)) {
        executable = venvUvicorn;
      } else if (fs.existsSync(venvPython)) {
        executable = venvPython;
        args = ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"];
      } else {
        executable = "python";
        args = ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"];
      }

      const child = spawn(executable, args, {
        cwd: backendDir,
        env: {
          ...process.env,
          PYTHONPATH: backendDir,
        },
        detached: true,
        stdio: "ignore",
        shell: isWin,
      });
      child.unref();

      // Poll up to 8 seconds for FastAPI to accept connections
      for (let i = 0; i < 32; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (await isBackendHealthy(600)) {
          return;
        }
      }
    } finally {
      startupPromise = null;
    }
  })();

  return startupPromise;
}

async function proxyToFastAPI(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<NextResponse> {
  await ensurePythonBackendRunning();

  const { path: pathSegments } = await context.params;
  const encodedSegments = pathSegments.map((seg) => encodeURIComponent(seg));
  const search = req.nextUrl.search || "";
  const relativePath = `/api/${encodedSegments.join("/")}${search}`;
  const targetUrl = new URL(relativePath, getBackendBaseUrl());

  try {
    const init: RequestInit = {
      method: req.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      cache: "no-store",
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      const bodyText = await req.text();
      if (bodyText) {
        init.body = bodyText;
      }
    }

    const upstreamRes = await fetch(targetUrl, init);
    const dataText = await upstreamRes.text();

    return new NextResponse(dataText, {
      status: upstreamRes.status,
      headers: {
        "Content-Type":
          upstreamRes.headers.get("Content-Type") || "application/json",
        "X-Powered-By": "Python-FastAPI-Elexon-Analytics",
      },
    });
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Failed to communicate with Python FastAPI backend.";
    return NextResponse.json({ detail: msg }, { status: 502 });
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyToFastAPI(req, context);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyToFastAPI(req, context);
}
