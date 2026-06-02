// Server-only module: imported solely by lib/apps/kit/session.ts (Node runtime).
// Uses node: built-ins + spawns a child process, so it must never reach a client bundle.
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * The apps' real-world side effect: every kit app's approved action writes a
 * genuine file through a REAL MCP filesystem server (the official
 * `@modelcontextprotocol/server-filesystem`, spawned over stdio).
 *
 * Output root resolution:
 *   APPS_MCP_DIR env var (absolute path)  →  used as-is
 *   unset                                 →  <cwd>/app-output
 *
 * The server is sandboxed to that one directory, so apps can only write there.
 * The connection is cached on globalThis so Next.js HMR doesn't respawn it.
 */

export interface WriteResult {
  ok: boolean;
  /** path relative to the output root, e.g. "whenly/invite-....ics" */
  relPath: string;
  /** absolute path on disk */
  absPath: string;
  error?: string;
}

function outputRoot(): string {
  const fromEnv = process.env.APPS_MCP_DIR?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : path.join(process.cwd(), "app-output");
}

interface FsConn {
  client: Client;
  root: string;
}

const FS_KEY = Symbol.for("apps.mcp.fs");
type GlobalWithFs = typeof globalThis & { [FS_KEY]?: Promise<FsConn> };
const g = globalThis as GlobalWithFs;

function getDefaultEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["PATH", "HOME", "USER", "SHELL", "LANG", "TMPDIR", "SystemRoot", "APPDATA", "ProgramFiles"]) {
    const v = process.env[k];
    if (v) out[k] = v;
  }
  return out;
}

async function connect(): Promise<FsConn> {
  const root = outputRoot();
  // Ensure the sandbox root exists before the server locks onto it. The server
  // only allows dirs that exist, so create it here with the host fs first.
  const fs = await import("node:fs/promises");
  await fs.mkdir(root, { recursive: true });

  // On Windows the npx shim is npx.cmd; spawning needs the .cmd on win32.
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  const transport = new StdioClientTransport({
    command: npx,
    args: ["-y", "@modelcontextprotocol/server-filesystem", root],
    env: getDefaultEnv(),
  });
  const client = new Client({ name: "apps-kit", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  return { client, root };
}

function getConn(): Promise<FsConn> {
  if (!g[FS_KEY]) {
    g[FS_KEY] = connect().catch((err) => {
      // Clear the cache so a later attempt can retry instead of returning a
      // permanently-rejected promise.
      g[FS_KEY] = undefined;
      throw err;
    });
  }
  return g[FS_KEY]!;
}

/** Sanitize a model-supplied filename so it can't escape its app subdir. */
function safeName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_{2,}/g, "_");
  return base.replace(/^[._]+/, "") || "output.txt";
}

function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return String(content ?? "");
  return content
    .map((b) => (b && typeof b === "object" && "text" in b ? String((b as { text: unknown }).text ?? "") : ""))
    .join("\n");
}

/**
 * Write one artifact for an app through the real MCP filesystem server.
 * Creates the per-app subdirectory, then calls the server's `write_file` tool.
 */
export async function writeArtifact(
  appId: string,
  filename: string,
  content: string,
): Promise<WriteResult> {
  const subdir = safeName(appId);
  const file = safeName(filename);
  const relPath = `${subdir}/${file}`;
  try {
    const { client, root } = await getConn();
    const absDir = path.join(root, subdir);
    const absPath = path.join(absDir, file);

    // Real MCP tool calls: ensure the app's folder exists, then write the file.
    await client.callTool({ name: "create_directory", arguments: { path: absDir } });
    const res = await client.callTool({
      name: "write_file",
      arguments: { path: absPath, content },
    });
    if (res.isError) {
      return { ok: false, relPath, absPath, error: contentToText(res.content) };
    }
    return { ok: true, relPath, absPath };
  } catch (err) {
    return {
      ok: false,
      relPath,
      absPath: path.join(outputRoot(), relPath),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function outputRootForDisplay(): string {
  return outputRoot();
}
