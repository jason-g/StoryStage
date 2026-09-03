import {
  STAGE_ACTIONS,
  STAGE_EXPRESSIONS,
  STAGE_PRESETS,
  STAGE_ZONES,
  buildPlaybackPlan,
  type BeatInput,
  type SceneState,
  type StageAction,
  type StageActor,
  type StageExpression,
  type StagePreset,
  type StageZone,
} from "./playback";

export type SceneCommand<T = unknown> =
  | { ok: true; state: SceneState; result: T; message?: string }
  | { ok: false; state: SceneState; error: string };

export const createInitialScene = (): SceneState => ({
  sceneId: "neon_alley",
  actors: [
    { id: "fenn", preset: "fox_detective", name: "Detective Fenn", palette: "amber", zone: "lamp", expression: "suspicious", visible: true },
    { id: "nix", preset: "robot", name: "Nix", palette: "teal", zone: "offstage_right", expression: "worried", visible: false },
  ],
  props: [
    { id: "lamp", zone: "lamp", visible: true, kind: "scenery" },
    { id: "crate", zone: "crate", visible: true, kind: "scenery" },
    { id: "clue", zone: "center", visible: true, kind: "object" },
  ],
  queue: [],
  isPlaying: false,
});

export const createHillsideQuestScene = (): SceneState => ({
  sceneId: "hillside_quest",
  actors: [
    { id: "aurthor", preset: "knight", name: "Sir Aurthor", palette: "silver", zone: "horse", expression: "suspicious", visible: true },
    { id: "ember", preset: "dragon", name: "Ember", palette: "crimson", zone: "dragon_roost", expression: "amused", visible: true },
  ],
  props: [
    { id: "castle", zone: "castle", visible: true, kind: "scenery" },
    { id: "horse", zone: "horse", visible: true, kind: "entity" },
    { id: "sword", zone: "hillside", visible: true, kind: "object" },
    { id: "bow", zone: "hillside", visible: true, kind: "object" },
    { id: "arrow", zone: "hillside", visible: true, kind: "object" },
  ],
  queue: [],
  isPlaying: false,
});

const clone = (state: SceneState): SceneState => ({ ...state, actors: state.actors.map((actor) => ({ ...actor })), props: state.props.map((prop) => ({ ...prop })), queue: state.queue.map((beat) => ({ ...beat })) });
const failed = (state: SceneState, error: string): SceneCommand<never> => ({ ok: false, state, error });
const slug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "actor";
const validZone = (value: unknown): value is StageZone => typeof value === "string" && (STAGE_ZONES as readonly string[]).includes(value);
const validAction = (value: unknown): value is StageAction => typeof value === "string" && (STAGE_ACTIONS as readonly string[]).includes(value);
const validExpression = (value: unknown): value is StageExpression => typeof value === "string" && (STAGE_EXPRESSIONS as readonly string[]).includes(value);

export function getSceneSummary(state: SceneState) {
  return {
    scene: state.sceneId,
    actors: state.actors.map(({ id, preset, name, palette, zone, expression, visible }) => ({ id, preset, name, palette, zone, expression, visible })),
    props: state.props.map(({ id, zone, visible, heldBy, kind }) => ({ id, zone, visible: visible !== false, heldBy, kind })),
    queue: state.queue.map(({ id, actorId, action, targetId, zone, dialogue, status }) => ({ id, actor: actorId, action, targetId, zone, dialogue, status })),
    isPlaying: state.isPlaying,
  };
}

export function createScene(_state: SceneState, input: { sceneId?: unknown } = {}): SceneCommand<ReturnType<typeof getSceneSummary>> {
  if (input.sceneId !== undefined && input.sceneId !== "neon_alley" && input.sceneId !== "hillside_quest") return failed(_state, "Choose neon_alley or hillside_quest.");
  const state = input.sceneId === "hillside_quest" ? createHillsideQuestScene() : createInitialScene();
  return { ok: true, state, result: getSceneSummary(state), message: state.sceneId === "hillside_quest" ? "The hillside quest is ready." : "The neon alley is ready." };
}

export function createCharacter(state: SceneState, input: { preset?: unknown; name?: unknown; palette?: unknown } = {}): SceneCommand<StageActor> {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 32) return failed(state, "Character name must be between 1 and 32 characters.");
  if (typeof input.preset !== "string" || !(STAGE_PRESETS as readonly string[]).includes(input.preset)) return failed(state, `Preset must be one of: ${STAGE_PRESETS.join(", ")}.`);
  const baseId = slug(input.name);
  let id = baseId;
  let suffix = 2;
  while (state.actors.some((actor) => actor.id === id)) id = `${baseId}-${suffix++}`;
  const actor: StageActor = { id, preset: input.preset as StagePreset, name: input.name.trim(), palette: typeof input.palette === "string" ? input.palette : "violet", zone: "offstage_left", expression: "neutral", visible: false };
  const next = clone(state);
  next.actors.push(actor);
  return { ok: true, state: next, result: actor, message: `${actor.name} was added offstage left.` };
}

export function placeActor(state: SceneState, input: { actorId?: unknown; zone?: unknown } = {}): SceneCommand<StageActor> {
  if (typeof input.actorId !== "string") return failed(state, "An actorId is required.");
  if (!validZone(input.zone)) return failed(state, "Choose a valid named stage zone.");
  const actorIndex = state.actors.findIndex((actor) => actor.id === input.actorId);
  if (actorIndex < 0) return failed(state, `Actor ${input.actorId} was not found.`);
  const next = clone(state);
  const actor = next.actors[actorIndex];
  actor.zone = input.zone;
  actor.visible = !input.zone.startsWith("offstage_");
  return { ok: true, state: next, result: actor, message: `${actor.name} is now at ${input.zone.replace("_", " ")}.` };
}

export function setExpression(state: SceneState, input: { actorId?: unknown; expression?: unknown } = {}): SceneCommand<StageActor> {
  if (typeof input.actorId !== "string") return failed(state, "An actorId is required.");
  if (!validExpression(input.expression)) return failed(state, "Choose a supported expression.");
  const actorIndex = state.actors.findIndex((actor) => actor.id === input.actorId);
  if (actorIndex < 0) return failed(state, `Actor ${input.actorId} was not found.`);
  const next = clone(state);
  next.actors[actorIndex].expression = input.expression;
  return { ok: true, state: next, result: next.actors[actorIndex], message: `${next.actors[actorIndex].name} now looks ${input.expression}.` };
}

export function queueAction(state: SceneState, input: Partial<BeatInput> = {}): SceneCommand<SceneState["queue"][number]> {
  if (typeof input.actorId !== "string" || !validAction(input.action)) return failed(state, "A valid actorId and supported action are required.");
  const actor = state.actors.find((candidate) => candidate.id === input.actorId);
  if (!actor) return failed(state, `Actor ${input.actorId} was not found.`);
  if (input.zone !== undefined && !validZone(input.zone)) return failed(state, "Choose a valid named stage zone.");
  if (input.targetId !== undefined && !state.props.some((prop) => prop.id === input.targetId) && !state.actors.some((candidate) => candidate.id === input.targetId)) return failed(state, `Target ${input.targetId} was not found.`);
  const beat = { id: `beat-${Date.now()}-${state.queue.length + 1}`, actorId: input.actorId, action: input.action, ...(input.zone ? { zone: input.zone } : {}), ...(input.targetId ? { targetId: input.targetId } : {}), ...(typeof input.dialogue === "string" ? { dialogue: input.dialogue.slice(0, 140) } : {}), status: "queued" as const };
  const plan = buildPlaybackPlan({ ...state, queue: [] }, [...state.queue, beat]);
  const latest = plan.beats.at(-1);
  if (!latest?.playable) return failed(state, latest?.issues.find((issue) => issue.severity === "error")?.message ?? "That action cannot be queued in the current scene.");
  const next = clone(state);
  next.queue.push(beat);
  return { ok: true, state: next, result: beat, message: `Queued: ${actor.name} → ${beat.action}.` };
}

export function clearQueue(state: SceneState): SceneCommand<null> {
  const next = clone(state);
  next.queue = [];
  next.isPlaying = false;
  return { ok: true, state: next, result: null, message: "The action queue was cleared." };
}

export function updateBeatStatus(state: SceneState, beatId: string, status: SceneState["queue"][number]["status"], actorAfter?: StageActor | null): SceneState {
  const next = clone(state);
  next.queue = next.queue.map((beat) => beat.id === beatId ? { ...beat, status } : beat);
  if (actorAfter) next.actors = next.actors.map((actor) => actor.id === actorAfter.id ? { ...actorAfter } : actor);
  return next;
}
