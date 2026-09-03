export type AgentBridgeCommand = {
  id: number;
  sequence: number;
  name: "create_scene" | "create_character" | "place_actor" | "direct_action" | "set_expression" | "play_scene";
  arguments: Record<string, unknown>;
};

const baseUrl = "http://127.0.0.1:4175";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error(`Agent bridge returned ${response.status}.`);
  return response.json() as Promise<T>;
}

export const publishScene = (scene: unknown) => request<{ ok: true }>("/scene", { method: "POST", body: JSON.stringify(scene) });
export const getBridgeCommands = (after: number, signal?: AbortSignal) => request<{ commands: AgentBridgeCommand[] }>(`/commands?after=${after}&wait=25000`, { signal });
export const completeBridgeCommand = (id: number, result: unknown) => request<{ ok: true }>(`/results/${id}`, { method: "POST", body: JSON.stringify(result) });
