/**
 * A deliberately tiny adapter around the experimental browser WebMCP surface.
 * The rest of the app never reads document.modelContext directly, which keeps
 * normal browsers fully functional and makes this module easy to update if the
 * browser contract changes.
 */
export type StoryStageToolApi = {
  getSceneState: () => unknown;
  createCharacter: (input: Record<string, unknown>) => unknown;
  createScene: (input: Record<string, unknown>) => unknown;
  placeActor: (input: Record<string, unknown>) => unknown;
  directAction: (input: Record<string, unknown>) => unknown;
  setExpression: (input: Record<string, unknown>) => unknown;
  playScene: (input: Record<string, unknown>) => unknown;
};

type BrowserTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

type ModelContext = { registerTool: (tool: BrowserTool) => void };

declare global {
  interface Document { modelContext?: ModelContext }
  interface Navigator { modelContext?: ModelContext }
}

const zoneSchema = { type: "string", enum: ["offstage_left", "left", "center", "right", "offstage_right", "lamp", "crate", "castle", "hillside", "horse", "dragon_roost", "top_right", "ground_right"] };
const actionSchema = { type: "string", enum: ["enter", "walk", "run", "point", "talk", "laugh", "gasp", "hide", "exit", "ride", "hold", "drop", "shoot", "fly", "fall", "attack"] };
const expressionSchema = { type: "string", enum: ["neutral", "happy", "surprised", "suspicious", "amused", "worried"] };
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

const wrap = (operation: (input: Record<string, unknown>) => unknown) => async (input: Record<string, unknown>) => {
  try {
    return await operation(input);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The stage direction could not be completed." };
  }
};

/** Registers once per page load and returns whether a compatible browser was found. */
export function registerStoryStageTools(api: StoryStageToolApi): boolean {
  // Browser experiments have exposed this surface on document and navigator.
  // Supporting both preserves the documented project contract while allowing
  // compatible builds with the newer placement to work without an app fork.
  const context = document.modelContext ?? navigator.modelContext;
  if (typeof context?.registerTool !== "function") return false;

  const tools: BrowserTool[] = [
    { name: "get_scene_state", description: "Inspect the current StoryStage scene, actors, props, and queued directions.", inputSchema: object({}), annotations: { readOnlyHint: true }, execute: wrap(() => api.getSceneState()) },
    { name: "create_character", description: "Add a supported character preset to the shared stage.", inputSchema: object({ preset: { type: "string", enum: ["fox_detective", "robot", "knight", "dragon"] }, name: { type: "string", minLength: 1, maxLength: 32 }, palette: { type: "string", enum: ["amber", "teal", "violet", "coral", "silver", "crimson"] } }, ["preset", "name"]), execute: wrap(api.createCharacter) },
    { name: "create_scene", description: "Reset StoryStage to the neon alley mystery or hillside knight quest.", inputSchema: object({ sceneId: { type: "string", enum: ["neon_alley", "hillside_quest"] } }, ["sceneId"]), execute: wrap(api.createScene) },
    { name: "place_actor", description: "Place an existing actor in a named StoryStage zone.", inputSchema: object({ actorId: { type: "string" }, zone: zoneSchema }, ["actorId", "zone"]), execute: wrap(api.placeActor) },
    { name: "direct_action", description: "Queue one atomic, supported stage action. Inspect the scene first; do not send multi-step directions.", inputSchema: object({ actorId: { type: "string" }, action: actionSchema, zone: zoneSchema, targetId: { type: "string", enum: ["lamp", "crate", "clue", "fenn", "nix", "castle", "horse", "sword", "bow", "arrow", "arthur", "ember"] }, dialogue: { type: "string", maxLength: 140 } }, ["actorId", "action"]), execute: wrap(api.directAction) },
    { name: "set_expression", description: "Set a visible expression for an actor.", inputSchema: object({ actorId: { type: "string" }, expression: expressionSchema }, ["actorId", "expression"]), execute: wrap(api.setExpression) },
    { name: "play_scene", description: "Play queued StoryStage directions in sequence.", inputSchema: object({ beatIds: { type: "array", items: { type: "string" } } }), execute: wrap(api.playScene) },
  ];

  tools.forEach((tool) => context.registerTool(tool));
  return true;
}
