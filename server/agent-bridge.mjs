#!/usr/bin/env node
import http from "node:http";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const PORT = Number(process.env.STORYSTAGE_BRIDGE_PORT ?? 4175);
const LOOPBACK_HOST = "127.0.0.1";
const configuredOrigins = process.env.STORYSTAGE_ALLOWED_ORIGINS;
if (!configuredOrigins) throw new Error("Set STORYSTAGE_ALLOWED_ORIGINS in .env or the bridge process environment.");
const allowedOrigins = new Set(configuredOrigins.split(",").map((origin) => new URL(origin.trim()).origin));
const actionProperties = { actorId: { type: "string" }, action: { type: "string" }, soundEffect: { type: "string", enum: ["crash", "gallop", "arrow_shot", "sword_clash", "yell", "murmur", "cheer"] }, targetId: { type: "string" }, zone: { type: "string" }, dialogue: { type: "string", maxLength: 140 } };
const tools = [
  { name: "get_scene_state", description: "Read the live StoryStage scene, actors, props, and queued beats.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "begin_reasoning", description: "Show that the agent is planning new stage actions. Call this before plan_actions with a short goal, not private chain-of-thought.", inputSchema: { type: "object", properties: { goal: { type: "string", minLength: 1, maxLength: 160 } }, required: ["goal"], additionalProperties: false } },
  { name: "plan_actions", description: "Submit a concise planning summary and generated actions. The complete plan is validated before it is added to the queue.", inputSchema: { type: "object", properties: { summary: { type: "string", minLength: 1, maxLength: 240 }, actions: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", properties: actionProperties, required: ["actorId", "action"], additionalProperties: false } } }, required: ["summary", "actions"], additionalProperties: false } },
  { name: "create_scene", description: "Start the neon alley mystery or hillside knight quest.", inputSchema: { type: "object", properties: { sceneId: { type: "string", enum: ["neon_alley", "hillside_quest"] } }, required: ["sceneId"], additionalProperties: false } },
  { name: "create_character", description: "Add a supported character to the current StoryStage scene.", inputSchema: { type: "object", properties: { preset: { type: "string", enum: ["fox_detective", "robot", "knight", "dragon"] }, name: { type: "string", minLength: 1, maxLength: 32 }, palette: { type: "string" } }, required: ["preset", "name"], additionalProperties: false } },
  { name: "place_actor", description: "Place an actor in a named stage zone.", inputSchema: { type: "object", properties: { actorId: { type: "string" }, zone: { type: "string" } }, required: ["actorId", "zone"], additionalProperties: false } },
  { name: "direct_action", description: "Queue one atomic StoryStage action. Optionally attach soundEffect so it plays when the action begins. Call get_scene_state first. Use hold with an object targetId for hold, carry, pick up, take, or grab; it attaches the object to the actor until drop.", inputSchema: { type: "object", properties: actionProperties, required: ["actorId", "action"], additionalProperties: false } },
  { name: "set_expression", description: "Set an actor's supported expression.", inputSchema: { type: "object", properties: { actorId: { type: "string" }, expression: { type: "string" } }, required: ["actorId", "expression"], additionalProperties: false } },
  { name: "play_scene", description: "Play queued StoryStage beats in sequence.", inputSchema: { type: "object", properties: { beatIds: { type: "array", items: { type: "string" } } }, additionalProperties: false } },
];

let scene = null;
let commandId = 0;
const commands = [];
const pending = new Map();
const commandWaiters = new Set();

const json = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};

const readJson = async (request) => {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large.");
  }
  return body ? JSON.parse(body) : {};
};

const withCors = (request, response) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.has(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
};

const commandsAfter = (after) => commands.filter((command) => command.sequence > after);

const waitForCommands = (after, waitMs, response) => {
  const waiter = { after, response, timer: undefined };
  const finish = () => {
    if (!commandWaiters.delete(waiter) || response.writableEnded) return;
    clearTimeout(waiter.timer);
    json(response, 200, { commands: commandsAfter(after) });
  };
  waiter.timer = setTimeout(finish, waitMs);
  response.once("close", () => {
    if (commandWaiters.delete(waiter)) clearTimeout(waiter.timer);
  });
  commandWaiters.add(waiter);
};

const notifyCommandWaiters = () => {
  for (const waiter of [...commandWaiters]) {
    const available = commandsAfter(waiter.after);
    if (!available.length) continue;
    commandWaiters.delete(waiter);
    clearTimeout(waiter.timer);
    if (!waiter.response.writableEnded) json(waiter.response, 200, { commands: available });
  }
};

const server = http.createServer(async (request, response) => {
  withCors(request, response);
  if (request.method === "OPTIONS") return response.writeHead(204).end();
  const url = new URL(request.url ?? "/", `http://${LOOPBACK_HOST}:${PORT}`);
  try {
    if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { ok: true, connected: scene !== null });
    if (request.method === "GET" && url.pathname === "/commands") {
      const after = Number(url.searchParams.get("after") ?? 0);
      const available = commandsAfter(after);
      const waitMs = Math.min(Math.max(Number(url.searchParams.get("wait") ?? 0), 0), 30_000);
      if (available.length || waitMs === 0) return json(response, 200, { commands: available });
      waitForCommands(after, waitMs, response);
      return;
    }
    if (request.method === "POST" && url.pathname === "/scene") {
      scene = await readJson(request);
      return json(response, 200, { ok: true });
    }
    const resultMatch = url.pathname.match(/^\/results\/(\d+)$/);
    if (request.method === "POST" && resultMatch) {
      const id = Number(resultMatch[1]);
      const result = await readJson(request);
      const waiter = pending.get(id);
      if (waiter) {
        pending.delete(id);
        waiter.resolve(result);
      }
      return json(response, 200, { ok: true });
    }
    return json(response, 404, { ok: false, error: "Unknown StoryStage bridge endpoint." });
  } catch (error) {
    return json(response, 400, { ok: false, error: error instanceof Error ? error.message : "Invalid bridge request." });
  }
});

server.listen(PORT, LOOPBACK_HOST, () => console.error(`StoryStage agent bridge listening on http://${LOOPBACK_HOST}:${PORT}`));

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const toolResult = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }], isError: value?.ok === false });
const callBrowser = (name, args) => new Promise((resolve) => {
  const id = ++commandId;
  const timeout = setTimeout(() => {
    pending.delete(id);
    resolve({ ok: false, error: "StoryStage is not in Agent Control mode. Open the page and enable the mode first." });
  }, 60_000);
  pending.set(id, { resolve: (result) => { clearTimeout(timeout); resolve(result); } });
  commands.push({ id, sequence: id, name, arguments: args && typeof args === "object" ? args : {} });
  if (commands.length > 200) commands.splice(0, commands.length - 200);
  notifyCommandWaiters();
});

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let request;
    try { request = JSON.parse(line); } catch { continue; }
    if (!Object.prototype.hasOwnProperty.call(request, "id")) continue;
    if (request.method === "initialize") {
      send({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: request.params?.protocolVersion ?? "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "storystage-local", version: "1.0.0" }, instructions: "This controls a visible local StoryStage. Read get_scene_state before acting. Before generating a sequence, call begin_reasoning with a short goal, then call plan_actions with a concise summary and the generated actions. Use direct_action for one action and play_scene when ready. Do not provide private chain-of-thought. The user can see every action and may redirect the scene." } });
      continue;
    }
    if (request.method === "tools/list") {
      send({ jsonrpc: "2.0", id: request.id, result: { tools } });
      continue;
    }
    if (request.method === "tools/call") {
      const name = request.params?.name;
      if (name === "get_scene_state") {
        send({ jsonrpc: "2.0", id: request.id, result: toolResult(scene ? { ok: true, scene } : { ok: false, error: "No StoryStage browser is connected. Enable Agent Control mode in the page." }) });
        continue;
      }
      if (!tools.some((tool) => tool.name === name)) {
        send({ jsonrpc: "2.0", id: request.id, result: toolResult({ ok: false, error: `Unknown StoryStage tool: ${String(name)}` }) });
        continue;
      }
      const result = await callBrowser(name, request.params?.arguments);
      send({ jsonrpc: "2.0", id: request.id, result: toolResult(result) });
      continue;
    }
    send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Method not found: ${String(request.method)}` } });
  }
});
