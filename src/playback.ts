export const STAGE_ACTIONS = [
  "enter",
  "walk",
  "move",
  "run",
  "point",
  "talk",
  "laugh",
  "gasp",
  "hide",
  "exit",
  "ride",
  "jump",
  "hold",
  "grab",
  "drop",
  "shoot",
  "fly",
  "fall",
  "attack",
  "explode",
  "die",
  "crash",
  "gallop",
  "arrow_shot",
  "sword_clash",
  "yell",
  "murmur",
  "cheer",
] as const;

export const SOUND_ACTIONS = ["crash", "gallop", "arrow_shot", "sword_clash", "yell", "murmur", "cheer"] as const;

export type StageAction = (typeof STAGE_ACTIONS)[number];
export type StageSound = (typeof SOUND_ACTIONS)[number];

export const STAGE_ZONES = [
  "offstage_left",
  "left",
  "center",
  "right",
  "offstage_right",
  "lamp",
  "crate",
  "castle",
  "hillside",
  "horse",
  "dragon_roost",
  "top_right",
  "ground_right",
] as const;

export type StageZone = (typeof STAGE_ZONES)[number];

export const STAGE_EXPRESSIONS = [
  "neutral",
  "happy",
  "surprised",
  "suspicious",
  "amused",
  "worried",
] as const;

export type StageExpression = (typeof STAGE_EXPRESSIONS)[number];

export const STAGE_PRESETS = ["fox_detective", "robot", "knight", "dragon"] as const;

export type StagePreset = (typeof STAGE_PRESETS)[number];

export const STAGE_PROP_IDS = ["lamp", "crate", "clue", "castle", "horse", "sword", "bow", "arrow"] as const;

export type StagePropId = (typeof STAGE_PROP_IDS)[number];

export type StageActor = {
  id: string;
  preset: StagePreset | string;
  name: string;
  palette?: string;
  zone: StageZone;
  expression: StageExpression;
  visible: boolean;
};

export type StageProp = {
  id: StagePropId | string;
  zone: StageZone;
  visible?: boolean;
  heldBy?: string;
  kind?: "scenery" | "entity" | "object";
};

export type StageBeat = {
  id: string;
  actorId: string;
  action: StageAction;
  targetId?: string;
  zone?: StageZone;
  dialogue?: string;
  soundEffect?: StageSound;
  status: "queued" | "playing" | "complete" | "failed";
};

export type SceneState = {
  sceneId: "neon_alley" | "hillside_quest" | string;
  actors: StageActor[];
  props: StageProp[];
  queue: StageBeat[];
  isPlaying: boolean;
};

export type SceneSnapshot = Pick<SceneState, "sceneId" | "actors" | "props" | "queue" | "isPlaying">;

export type PlaybackIssueSeverity = "info" | "warning" | "error";

export type PlaybackIssue = {
  code: string;
  severity: PlaybackIssueSeverity;
  message: string;
  beatId?: string;
  actorId?: string;
  suggestion?: string;
};

export type PlaybackEffect =
  | {
      kind: "move";
      from: StageZone;
      to: StageZone;
      reason: string;
    }
  | {
      kind: "visibility";
      visible: boolean;
      reason: string;
    }
  | {
      kind: "expression";
      from: StageExpression;
      to: StageExpression;
      reason: string;
    }
  | {
      kind: "dialogue";
      text: string;
    }
  | {
      kind: "marker";
      label: string;
    };

export type BeatTiming = {
  delayMs: number;
  durationMs: number;
  startAtMs: number;
  endAtMs: number;
};

export type BeatPlaybackPlan = {
  beatId: string;
  actorId: string;
  actorName?: string;
  action: StageAction;
  timing: BeatTiming;
  issues: PlaybackIssue[];
  playable: boolean;
  outcome: string;
  effects: PlaybackEffect[];
  nextActorState: StageActor | null;
  nextPropsState: StageProp[] | null;
};

export type PlaybackPlan = {
  beats: BeatPlaybackPlan[];
  issues: PlaybackIssue[];
  totalDurationMs: number;
  playableBeats: number;
  blockedBeats: number;
};

export type PlaybackOptions = {
  beatGapMs?: number;
  actionDurations?: Partial<Record<StageAction, number>>;
};

export type BeatInput = Pick<StageBeat, "id" | "actorId" | "action" | "targetId" | "zone" | "dialogue" | "soundEffect">;

export type ValidationResult = {
  valid: boolean;
  issues: PlaybackIssue[];
  normalizedBeat: BeatInput;
};

const DEFAULT_BEAT_GAP_MS = 180;

const DEFAULT_ACTION_DURATIONS: Record<StageAction, number> = {
  enter: 1150,
  walk: 1100,
  move: 1100,
  run: 850,
  point: 500,
  talk: 1350,
  laugh: 950,
  gasp: 700,
  hide: 900,
  exit: 1050,
  ride: 1250,
  jump: 800,
  hold: 550,
  grab: 650,
  drop: 600,
  shoot: 900,
  fly: 1200,
  fall: 1000,
  attack: 850,
  explode: 1100,
  die: 1200,
  crash: 900,
  gallop: 1800,
  arrow_shot: 900,
  sword_clash: 1300,
  yell: 1200,
  murmur: 1800,
  cheer: 1800,
};

const SIDE_BY_ZONE: Partial<Record<StageZone, "left" | "right">> = {
  offstage_left: "left",
  left: "left",
  offstage_right: "right",
  right: "right",
};

function cloneActor(actor: StageActor): StageActor {
  return { ...actor };
}

function findActor(scene: SceneSnapshot, actorId: string): StageActor | null {
  return scene.actors.find((actor) => actor.id === actorId) ?? null;
}

function findProp(scene: SceneSnapshot, targetId: string): StageProp | null {
  return scene.props.find((prop) => prop.id === targetId) ?? null;
}

function resolveDuration(action: StageAction, options?: PlaybackOptions): number {
  const overrides = options?.actionDurations ?? {};
  return overrides[action] ?? DEFAULT_ACTION_DURATIONS[action];
}

function resolveDefaultTargetZone(actor: StageActor, beat: BeatInput): StageZone {
  if (beat.zone) {
    return beat.zone;
  }

  if (beat.targetId === "lamp" || beat.targetId === "crate" || beat.targetId === "horse" || beat.targetId === "castle") {
    return beat.targetId;
  }

  if (beat.action === "exit") {
    const side = SIDE_BY_ZONE[actor.zone] ?? "right";
    return side === "left" ? "offstage_left" : "offstage_right";
  }

  if (beat.action === "enter") {
    const side = SIDE_BY_ZONE[actor.zone] ?? "left";
    return side === "right" ? "right" : "left";
  }

  return actor.zone;
}

function formatTargetLabel(scene: SceneSnapshot, targetId?: string): string {
  if (!targetId) {
    return "";
  }

  const prop = findProp(scene, targetId);
  if (prop) {
    return prop.id;
  }

  const actor = findActor(scene, targetId);
  if (actor) {
    return actor.name;
  }

  return targetId;
}

function humanizeZone(zone?: StageZone): string {
  if (!zone) {
    return "";
  }

  return zone.replace(/_/g, " ");
}

function buildBeatOutcome(beat: BeatInput, actor: StageActor, before: StageActor, after: StageActor, scene: SceneSnapshot): { outcome: string; effects: PlaybackEffect[] } {
  const effects: PlaybackEffect[] = [];

  if (before.zone !== after.zone) {
    effects.push({
      kind: "move",
      from: before.zone,
      to: after.zone,
      reason: `${before.name} changed stage position`,
    });
  }

  if (before.visible !== after.visible) {
    effects.push({
      kind: "visibility",
      visible: after.visible,
      reason: after.visible ? `${after.name} is now onstage` : `${after.name} is now hidden`,
    });
  }

  if (before.expression !== after.expression) {
    effects.push({
      kind: "expression",
      from: before.expression,
      to: after.expression,
      reason: `${after.name} changed expression`,
    });
  }

  if (beat.dialogue) {
    effects.push({
      kind: "dialogue",
      text: beat.dialogue,
    });
  }

  const targetLabel = formatTargetLabel(scene, beat.targetId);
  const locationLabel = targetLabel || humanizeZone(beat.zone);

  switch (beat.action) {
    case "enter":
      return {
        outcome: locationLabel
          ? `${after.name} enters from ${locationLabel}`
          : `${after.name} enters`,
        effects,
      };
    case "walk":
      return {
        outcome: locationLabel ? `${after.name} walks to ${locationLabel}` : `${after.name} walks`,
        effects,
      };
    case "move":
      return { outcome: locationLabel ? `${after.name} moves to ${locationLabel}` : `${after.name} moves`, effects };
    case "run":
      return {
        outcome: locationLabel ? `${after.name} runs to ${locationLabel}` : `${after.name} runs`,
        effects,
      };
    case "point":
      return {
        outcome: targetLabel ? `${after.name} points at ${targetLabel}` : `${after.name} points`,
        effects,
      };
    case "talk":
      return {
        outcome: beat.dialogue ? `${after.name} says "${beat.dialogue}"` : `${after.name} talks`,
        effects,
      };
    case "laugh":
      return {
        outcome: `${after.name} laughs`,
        effects,
      };
    case "gasp":
      return {
        outcome: `${after.name} gasps`,
        effects,
      };
    case "hide":
      return {
        outcome: locationLabel ? `${after.name} hides behind ${locationLabel}` : `${after.name} hides`,
        effects,
      };
    case "exit":
      return {
        outcome: locationLabel ? `${after.name} exits toward ${locationLabel}` : `${after.name} exits`,
        effects,
      };
    case "ride":
      return { outcome: locationLabel ? `${after.name} rides toward ${locationLabel}` : `${after.name} rides`, effects };
    case "jump":
      return { outcome: `${after.name} jumps`, effects };
    case "hold":
      return { outcome: targetLabel ? `${after.name} holds the ${targetLabel}` : `${after.name} holds an item`, effects };
    case "grab":
      return { outcome: targetLabel ? `${after.name} grabs the ${targetLabel}` : `${after.name} grabs an item`, effects };
    case "drop":
      return { outcome: targetLabel ? `${after.name} drops the ${targetLabel}` : `${after.name} drops an item`, effects };
    case "shoot":
      return { outcome: targetLabel ? `${after.name} shoots at ${targetLabel}` : `${after.name} shoots an arrow`, effects };
    case "fly":
      return { outcome: locationLabel ? `${after.name} flies in toward ${locationLabel}` : `${after.name} flies`, effects };
    case "fall":
      return { outcome: locationLabel ? `${after.name} falls to ${locationLabel}` : `${after.name} falls`, effects };
    case "attack":
      return { outcome: targetLabel ? `${after.name} attacks ${targetLabel}` : `${after.name} attacks`, effects };
    case "explode":
      return { outcome: `${after.name} explodes`, effects };
    case "die":
      return { outcome: `${after.name} dies`, effects };
    case "crash":
    case "gallop":
    case "arrow_shot":
    case "sword_clash":
    case "yell":
    case "murmur":
    case "cheer":
      return { outcome: `Sound effect: ${beat.action.replace("_", " ")}`, effects };
    default:
      return {
        outcome: `${after.name} performs ${beat.action}`,
        effects,
      };
  }
}

export function validateBeat(beat: BeatInput, scene: SceneSnapshot): ValidationResult {
  const issues: PlaybackIssue[] = [];
  const actor = findActor(scene, beat.actorId);

  if (!actor) {
    issues.push({
      code: "unknown-actor",
      severity: "error",
      message: `Actor ${beat.actorId} was not found in the scene.`,
      beatId: beat.id,
      actorId: beat.actorId,
    });
    return {
      valid: false,
      issues,
      normalizedBeat: beat,
    };
  }

  if (beat.targetId) {
    const targetActor = findActor(scene, beat.targetId);
    const targetProp = findProp(scene, beat.targetId);

    if (!targetActor && !targetProp && beat.targetId !== beat.zone) {
      issues.push({
        code: "unknown-target",
        severity: "warning",
        message: `Target ${beat.targetId} does not match a known actor or prop.`,
        beatId: beat.id,
        actorId: beat.actorId,
      });
    }

    if (beat.action === "point" && !targetActor && !targetProp) {
      issues.push({
        code: "missing-point-target",
        severity: "error",
        message: "Point actions need a valid target to point at.",
        beatId: beat.id,
        actorId: beat.actorId,
        suggestion: "Set targetId to a prop like clue or to another actor.",
      });
    }
  }

  const needsPosition = beat.action === "walk" || beat.action === "move" || beat.action === "run" || beat.action === "enter" || beat.action === "hide" || beat.action === "exit" || beat.action === "ride" || beat.action === "fly" || beat.action === "fall";
  const resolvedZone = resolveDefaultTargetZone(actor, beat);

  if (needsPosition && !resolvedZone) {
    issues.push({
      code: "missing-zone",
      severity: "error",
      message: `${beat.action} needs a stage zone or target to resolve a location.`,
      beatId: beat.id,
      actorId: beat.actorId,
      suggestion: "Provide zone or targetId.",
    });
  }

  if (!actor.visible && beat.action !== "enter") {
    issues.push({
      code: "actor-offstage",
      severity: "error",
      message: `${actor.name} is offstage and should enter before ${beat.action}.`,
      beatId: beat.id,
      actorId: beat.actorId,
      suggestion: "Queue an enter action first.",
    });
  }

  if (actor.visible && beat.action === "enter") {
    issues.push({
      code: "already-visible",
      severity: "warning",
      message: `${actor.name} is already onstage.`,
      beatId: beat.id,
      actorId: beat.actorId,
    });
  }

  if (beat.action === "hide" && !beat.targetId && !beat.zone) {
    issues.push({
      code: "hide-without-anchor",
      severity: "warning",
      message: "Hide works best when it has a prop or zone to hide behind.",
      beatId: beat.id,
      actorId: beat.actorId,
      suggestion: "Use targetId crate or zone crate for a visible hiding beat.",
    });
  }

  if ((beat.action === "hold" || beat.action === "grab" || beat.action === "drop" || beat.action === "shoot") && !beat.targetId) {
    issues.push({ code: "missing-item-target", severity: "error", message: `${beat.action} needs a target, such as sword, bow, or arrow.`, beatId: beat.id, actorId: beat.actorId });
  }

  if ((beat.action === "hold" || beat.action === "grab") && beat.targetId) {
    const heldProp = findProp(scene, beat.targetId);
    if (!heldProp || heldProp.kind === "scenery") {
      issues.push({ code: "invalid-held-target", severity: "error", message: `${actor.name} can hold or carry a movable object, not ${formatTargetLabel(scene, beat.targetId)}.`, beatId: beat.id, actorId: beat.actorId });
    } else if (heldProp.heldBy && heldProp.heldBy !== actor.id) {
      issues.push({ code: "object-already-held", severity: "error", message: `${heldProp.id} is already held by another actor.`, beatId: beat.id, actorId: beat.actorId });
    }
  }

  if (beat.action === "attack" && !beat.targetId) {
    issues.push({ code: "missing-attack-target", severity: "error", message: "Attack needs a target actor, such as ember.", beatId: beat.id, actorId: beat.actorId });
  }

  return {
    valid: !issues.some((issue) => issue.severity === "error"),
    issues,
    normalizedBeat: {
      ...beat,
      zone: resolvedZone,
    },
  };
}

export function simulateBeat(scene: SceneSnapshot, beat: BeatInput): {
  nextScene: SceneSnapshot;
  validation: ValidationResult;
  timing: BeatTiming;
  plan: BeatPlaybackPlan;
} {
  const validation = validateBeat(beat, scene);
  const actor = findActor(scene, beat.actorId);
  const timing = {
    delayMs: 0,
    durationMs: resolveDuration(beat.action),
    startAtMs: 0,
    endAtMs: resolveDuration(beat.action),
  };

  if (!actor) {
    const blockedPlan: BeatPlaybackPlan = {
      beatId: beat.id,
      actorId: beat.actorId,
      action: beat.action,
      timing,
      issues: validation.issues,
      playable: false,
      outcome: `Blocked: actor ${beat.actorId} is missing.`,
      effects: [],
      nextActorState: null,
      nextPropsState: null,
    };

    return {
      nextScene: scene,
      validation,
      timing,
      plan: blockedPlan,
    };
  }

  const before = cloneActor(actor);
  const after = cloneActor(actor);
  const normalizedBeat = validation.normalizedBeat;

  switch (normalizedBeat.action) {
    case "enter":
      after.visible = true;
      after.zone = normalizedBeat.zone ?? resolveDefaultTargetZone(actor, normalizedBeat);
      break;
    case "walk":
    case "move":
    case "run":
      after.visible = true;
      after.zone = normalizedBeat.zone ?? actor.zone;
      break;
    case "point":
      after.visible = true;
      after.expression = actor.expression === "neutral" ? "suspicious" : actor.expression;
      break;
    case "talk":
      after.visible = true;
      break;
    case "laugh":
      after.visible = true;
      after.expression = "amused";
      break;
    case "gasp":
      after.visible = true;
      after.expression = "surprised";
      break;
    case "hide":
      after.visible = false;
      after.zone = normalizedBeat.zone ?? actor.zone;
      after.expression = "worried";
      break;
    case "exit":
      after.visible = false;
      after.zone = normalizedBeat.zone ?? resolveDefaultTargetZone(actor, normalizedBeat);
      break;
    case "ride":
      after.visible = true;
      after.zone = normalizedBeat.zone ?? actor.zone;
      after.expression = "happy";
      break;
    case "jump":
      after.visible = true;
      after.expression = "happy";
      break;
    case "hold":
    case "grab":
      after.visible = true;
      after.expression = "suspicious";
      break;
    case "drop":
      after.visible = true;
      break;
    case "shoot":
      after.visible = true;
      after.expression = "suspicious";
      break;
    case "fly":
      after.visible = true;
      after.zone = normalizedBeat.zone ?? actor.zone;
      after.expression = "amused";
      break;
    case "fall":
      after.visible = true;
      after.zone = normalizedBeat.zone ?? actor.zone;
      after.expression = "worried";
      break;
    case "attack":
      after.visible = true;
      after.expression = "suspicious";
      break;
    case "explode":
      after.visible = false;
      after.expression = "worried";
      break;
    case "die":
      after.visible = false;
      after.expression = "worried";
      break;
    default:
      break;
  }

  let nextProps = scene.props.map((prop) => ({ ...prop }));
  if (["enter", "walk", "move", "run", "hide", "exit", "ride", "fly", "fall"].includes(normalizedBeat.action)) {
    nextProps = nextProps.map((prop) => prop.heldBy === actor.id ? { ...prop, zone: after.zone } : prop);
  }
  if ((normalizedBeat.action === "hold" || normalizedBeat.action === "grab") && normalizedBeat.targetId) {
    nextProps = nextProps.map((prop) => prop.id === normalizedBeat.targetId ? { ...prop, heldBy: actor.id, zone: after.zone } : prop);
  }
  if (normalizedBeat.action === "drop" && normalizedBeat.targetId) {
    nextProps = nextProps.map((prop) => prop.id === normalizedBeat.targetId && prop.heldBy === actor.id ? { ...prop, heldBy: undefined, zone: after.zone } : prop);
  }
  if (normalizedBeat.action === "ride") {
    nextProps = nextProps.map((prop) => prop.id === "horse" ? { ...prop, heldBy: actor.id, zone: after.zone } : prop);
  }
  if (normalizedBeat.action === "shoot") {
    const target = findActor(scene, normalizedBeat.targetId ?? "");
    nextProps = nextProps.map((prop) => prop.id === "arrow" ? { ...prop, heldBy: undefined, zone: target?.zone ?? after.zone } : prop);
  }

  const updatedScene: SceneSnapshot = {
    ...scene,
    actors: scene.actors.map((candidate) => (candidate.id === actor.id ? after : candidate)),
    props: nextProps,
  };

  const { outcome, effects } = buildBeatOutcome(normalizedBeat, actor, before, after, scene);

  const plan: BeatPlaybackPlan = {
    beatId: beat.id,
    actorId: beat.actorId,
    actorName: actor.name,
    action: beat.action,
    timing,
    issues: validation.issues,
    playable: validation.valid,
    outcome,
    effects,
    nextActorState: after,
    nextPropsState: nextProps,
  };

  return {
    nextScene: updatedScene,
    validation,
    timing,
    plan,
  };
}

export function buildPlaybackPlan(scene: SceneSnapshot, queue: BeatInput[], options?: PlaybackOptions): PlaybackPlan {
  const beatGapMs = options?.beatGapMs ?? DEFAULT_BEAT_GAP_MS;
  const beats: BeatPlaybackPlan[] = [];
  const issues: PlaybackIssue[] = [];
  let runningScene: SceneSnapshot = scene;
  let currentStartMs = 0;
  let playableBeats = 0;
  let blockedBeats = 0;

  for (const beat of queue) {
    const simulation = simulateBeat(runningScene, beat);
    const durationMs = resolveDuration(beat.action, options);
    const timing: BeatTiming = {
      delayMs: currentStartMs,
      durationMs,
      startAtMs: currentStartMs,
      endAtMs: currentStartMs + durationMs,
    };

    const plan: BeatPlaybackPlan = {
      ...simulation.plan,
      timing,
    };

    beats.push(plan);
    issues.push(...plan.issues);

    if (plan.playable) {
      playableBeats += 1;
      runningScene = simulation.nextScene;
    } else {
      blockedBeats += 1;
    }

    currentStartMs += durationMs + beatGapMs;
  }

  return {
    beats,
    issues,
    totalDurationMs: beats.length === 0 ? 0 : beats[beats.length - 1].timing.endAtMs,
    playableBeats,
    blockedBeats,
  };
}

export function summarizeScene(scene: SceneSnapshot): string {
  const actors = scene.actors
    .map((actor) => `${actor.name}:${actor.zone}${actor.visible ? "" : " (hidden)"}`)
    .join(", ");
  const queue = scene.queue
    .map((beat) => `${beat.actorId}:${beat.action}${beat.status !== "queued" ? ` (${beat.status})` : ""}`)
    .join(", ");

  return [
    `scene=${scene.sceneId}`,
    `actors=[${actors}]`,
    `queue=[${queue}]`,
    `playing=${scene.isPlaying ? "yes" : "no"}`,
  ].join(" ");
}

export function getBeatDuration(action: StageAction, options?: PlaybackOptions): number {
  return resolveDuration(action, options);
}

export function getTargetLabel(scene: SceneSnapshot, targetId?: string): string {
  return formatTargetLabel(scene, targetId);
}
