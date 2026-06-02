/**
 * Sample agent goals — REAL tool ids (probed live 2026-06-01). The old goals
 * referenced mock tools (git.log, linear.list_issues) that don't exist on the
 * real provider. These reference the actual fs/github/linear/notion/slack tools.
 */
export interface SampleGoal {
  text: string;
  server: string;
  tools: string[];
}

export const SAMPLE_GOALS: SampleGoal[] = [
  {
    text: "List my GitHub repositories and summarise the 3 most recently updated.",
    server: "github",
    tools: ["github.search_repositories"],
  },
  {
    text: "Show my Linear teams and projects, then list the issues in the first project.",
    server: "linear",
    tools: ["linear.linear_getTeams", "linear.linear_getProjects", "linear.linear_getProjectIssues"],
  },
  {
    text: "List the files in the workspace and read the README.",
    server: "fs",
    tools: ["fs.list_directory", "fs.read_text_file"],
  },
  {
    text: "Search my Notion workspace for any shared pages and summarise them.",
    server: "notion",
    tools: ["notion.API-post-search"],
  },
];
