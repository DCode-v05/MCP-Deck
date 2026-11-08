export type ChannelOp = "snapshot" | "error";

export interface ChannelFrame {
  channel: string;
  as: string;
  op: ChannelOp;
  rev: number;
  payload: unknown;
}

export interface ChannelBinding {
  channel: string;
  args?: Record<string, unknown>;
  as: string;
  poll_s: number;
}

export interface SubscribeRequest {
  thread_id: string;
  craft_id: string;
  channels: ChannelBinding[];
}

export interface SubscribeResponse {
  session_id: string;
  channels: Array<{ channel: string; key: string; rev: number }>;
}

export interface RequestBody {
  op: string;
  args?: Record<string, unknown>;
}
export interface RequestResponse {
  ok: boolean;
  result: unknown;
  isError: boolean;
}

export function encodeFrame(f: ChannelFrame): string {
  return `id: ${f.rev}\nevent: data\ndata: ${JSON.stringify(f)}\n\n`;
}
