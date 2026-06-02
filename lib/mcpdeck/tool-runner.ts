import { findTool } from "./catalogue";

/**
 * Mock execution. Returns text the LLM can reason about.
 * `hasSideEffect: true` tools also "perform" their side effect — recorded in the replay entry.
 */
export async function runMockTool(
  toolId: string,
  args: Record<string, unknown>,
): Promise<{ result: string; isError: boolean }> {
  const tool = findTool(toolId);
  if (!tool) return { result: `Unknown tool: ${toolId}`, isError: true };

  // Simulate network latency tied to the server.
  await wait(80 + Math.random() * 120);

  try {
    switch (toolId) {
      case "fs.list":
        return ok(mockFsList(String(args.path ?? "/workspace")));
      case "fs.read":
        return ok(mockFsRead(String(args.path ?? "")));
      case "fs.write":
        return ok(
          `wrote ${String(args.path)} (${String(args.contents ?? "").length} bytes)`,
        );
      case "fs.search":
        return ok(mockFsSearch(String(args.query ?? "")));
      case "git.status":
        return ok(
          [
            "On branch main",
            "Changes not staged for commit:",
            "  modified: lib/engine/run-engine.ts",
            "  modified: lib/types/engine-widgets.ts",
            "Untracked files:",
            "  lib/mcpdeck/",
            "  components/mcpdeck/",
          ].join("\n"),
        );
      case "git.log": {
        const limit = Number(args.limit ?? 5);
        const lines = [
          "a1b2c3 fix: race in approval queue (2h ago, alice)",
          "d4e5f6 feat: bidirectional UI primitives (4h ago, bob)",
          "9c8d7e chore: bump anthropic sdk (1d ago, alice)",
          "1a2b3c docs: ideation pass on apps 1-20 (2d ago, sharan)",
          "5f6g7h test: pause-on-approval golden path (3d ago, bob)",
        ];
        return ok(lines.slice(0, limit).join("\n"));
      }
      case "git.diff":
        return ok(
          [
            `diff --git a/lib/engine/run-engine.ts b/lib/engine/run-engine.ts`,
            `@@ async function* runEngine(...)`,
            `+  await session.awaitApproval(call);`,
            `   const exec = executeTool(call);`,
          ].join("\n"),
        );
      case "git.branch": {
        if (args.action === "create") {
          return ok(`Branch '${String(args.name)}' created from main.`);
        }
        return ok("* main\n  feat/mcpdeck\n  fix/approval-race");
      }
      case "linear.list_issues": {
        const status = String(args.status ?? "todo");
        if (status === "todo") {
          return ok(
            "ENG-204 · pause-on-approval primitive · P1 · @alice\n" +
              "ENG-211 · server-push widget patch · P2 · unassigned\n" +
              "ENG-218 · Tillpoint stripe wiring · P2 · @carla",
          );
        }
        if (status === "in_progress") {
          return ok("ENG-198 · McpDeck UI surfaces · P0 · @bob");
        }
        return ok("ENG-100..ENG-180 (24 issues, omitted)");
      }
      case "linear.read_issue": {
        const id = String(args.id ?? "");
        if (id === "ENG-204") {
          return ok(
            "ENG-204 · pause-on-approval primitive\n" +
              "status: todo · priority: P1 · assignee: alice\n\n" +
              "Engine must await widget state before continuing the loop. " +
              "Unblocks McpDeck inflight approvals + Tillpoint payment flow.",
          );
        }
        return ok(`${id} · (synthesized record) · P3`);
      }
      case "linear.create_issue":
        return ok(
          `Created ${String(args.team ?? "ENG")}-${300 + Math.floor(Math.random() * 99)} · "${String(args.title)}"`,
        );
      case "linear.comment":
        return ok(`Comment posted on ${String(args.id)}.`);
      default:
        return { result: `Tool ${toolId} not implemented in mock layer.`, isError: true };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { result: msg, isError: true };
  }
}

function ok(s: string) {
  return { result: s, isError: false };
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function mockFsList(path: string): string {
  if (path === "/workspace") return "src/\npackage.json\nREADME.md\ntsconfig.json";
  if (path === "/workspace/src") return "index.ts\napp.ts\nlib/\ncomponents/";
  return `(empty or path not found: ${path})`;
}

function mockFsRead(path: string): string {
  if (path.endsWith("package.json"))
    return `{\n  "name": "mini-bap",\n  "version": "0.1.0"\n}`;
  if (path.endsWith("README.md"))
    return `# mini-bap\n\nInteractive UI Responses prototype.`;
  return `(${path} is 0 bytes or not readable in mock)`;
}

function mockFsSearch(query: string): string {
  const hits = [
    `src/app.ts:42  // ${query}`,
    `lib/engine/run-engine.ts:88  ${query} pattern matched`,
  ];
  return hits.join("\n");
}
