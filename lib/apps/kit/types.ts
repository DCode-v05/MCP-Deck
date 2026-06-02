/**
 * Generic live-app kit. Every app in the catalogue (except McpDeck + Tillpoint,
 * which are bespoke) is expressed as an AppDef: a set of input fields, a
 * deterministic `compute` that derives live metrics (the engine→UI server-push),
 * and one approval-gated `action` (the engine→real-world side effect).
 *
 * The interaction is simplified (controls, not drag/canvas) but all three
 * bidirectional flows are real in every app.
 */

export type FieldValue = number | string | boolean;
export type AppState = Record<string, FieldValue>;

export type FieldKind = "slider" | "stepper" | "toggle" | "text" | "select";

export interface AppField {
  key: string;
  label: string;
  kind: FieldKind;
  default: FieldValue;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: string[];
  placeholder?: string;
  help?: string;
}

export type MetricTone = "default" | "good" | "warn" | "bad";

export interface Metric {
  key: string;
  label: string;
  value: string;
  tone?: MetricTone;
  /** 0..100 progress bar, optional */
  bar?: number;
}

export interface ComputeResult {
  metrics: Metric[];
  note?: string;
  /** when set, the UI shows a "suggested action" banner (engine wants attention) */
  trigger?: string | null;
}

/** A real file the action produces — written to disk via the MCP filesystem server. */
export interface ActionArtifact {
  filename: string;
  content: string;
}

export interface ActionOutcome {
  ok: boolean;
  message: string;
  /** when present, this file is written through the real MCP filesystem server */
  artifact?: ActionArtifact;
}

export interface AppAction {
  label: string;
  confirmTitle: string;
  /** describe the real-world side effect for the approval modal */
  confirmBody: (state: AppState, metrics: Metric[]) => string;
  /** the side effect; returns the verdict + an optional real file to write. May be async. */
  run: (state: AppState, metrics: Metric[]) => ActionOutcome | Promise<ActionOutcome>;
}

export interface AppLive {
  /** synthetic streaming value merged into state under this key each tick */
  stateKey: string;
  initial: number;
  intervalMs: number;
  next: (prev: number) => number;
}

export interface AppSample {
  label: string;
  values: AppState;
}

export interface AppDef {
  id: string;
  name: string;
  tagline: string;
  fields: AppField[];
  compute: (state: AppState) => ComputeResult;
  action: AppAction;
  live?: AppLive;
  /** one-click preset scenarios shown as chips */
  samples?: AppSample[];
}

export interface AppMeta {
  accent: string; // hex
  icon: string; // key into the icon map
  category: string;
  blurb: string; // one-liner for the launcher
}

/** Serializable subset of an AppDef — safe to pass to a client component. */
export interface AppDefView {
  id: string;
  name: string;
  tagline: string;
  fields: AppField[];
  actionLabel: string;
  hasLive: boolean;
  accent: string;
  icon: string;
  category: string;
  samples: AppSample[];
}

// ---- wire protocol (shared by every kit app) ----

export interface LiveAppStatePayload {
  values: AppState;
  metrics: Metric[];
  note: string | null;
  trigger: string | null;
}

export interface PendingAction {
  actionId: string;
  title: string;
  body: string;
}

export interface ActionResult {
  actionId: string;
  ok: boolean;
  message: string;
  /** path (relative to the MCP output root) of the file this action wrote, if any */
  artifactPath?: string;
}

export type LiveAppEvent =
  | { type: "session_ready"; sessionId: string; appId: string }
  | { type: "state"; payload: LiveAppStatePayload }
  | { type: "action_pending"; pending: PendingAction }
  | { type: "action_running"; actionId: string }
  | { type: "action_result"; result: ActionResult };

export type LiveAppMessage =
  | { kind: "set_field"; key: string; value: FieldValue }
  | { kind: "set_fields"; values: AppState }
  | { kind: "run_action" }
  | { kind: "resolve_action"; actionId: string; approve: boolean };
