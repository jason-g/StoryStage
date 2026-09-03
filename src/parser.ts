import {
  STAGE_ACTIONS,
  STAGE_PROP_IDS,
  STAGE_ZONES,
  type BeatInput,
  type StageAction,
  type StageZone,
  type SceneSnapshot,
} from "./playback";

export type DirectionActor = {
  id: string;
  name: string;
  preset?: string;
  aliases?: string[];
};

export type DirectionProp = {
  id: string;
  aliases?: string[];
  zone?: StageZone;
};

export type DirectionParseOptions = {
  actors?: DirectionActor[];
  props?: DirectionProp[];
  defaultActorId?: string;
};

export type DirectionParseSeverity = "info" | "warning" | "error";

export type DirectionParseWarning = {
  code: string;
  severity: DirectionParseSeverity;
  message: string;
  clauseIndex?: number;
  clause?: string;
  suggestion?: string;
};

export type ParsedDirectionBeat = BeatInput & {
  clauseIndex: number;
  clause: string;
  actorLabel: string;
  inferredActor: boolean;
  inferredAction: boolean;
  confidence: number;
};

export type DirectionParseResult = {
  status: "empty" | "ok" | "partial";
  input: string;
  normalizedInput: string;
  clauses: string[];
  beats: ParsedDirectionBeat[];
  warnings: DirectionParseWarning[];
};

type ActorMatch = {
  actorId: string;
  actorLabel: string;
  index: number;
  aliasLength: number;
};

type ObjectMatch = {
  id: string;
  kind: "actor" | "prop" | "zone";
  zone?: StageZone;
  index: number;
  aliasLength: number;
};

const DEFAULT_ACTOR_ALIASES: Record<string, string[]> = {
  fenn: ["detective fenn", "fenn", "fox detective", "the fox", "fox"],
  nix: ["nix", "the robot", "robot", "bot"],
  arthur: ["sir arthur", "arthur", "sir aurthor", "aurthor", "the knight", "knight", "brave knight", "brave night", "sir aria", "aria"],
  ember: ["ember", "the dragon", "dragon"],
};

const DEFAULT_PROP_ALIASES: Record<string, string[]> = {
  lamp: ["lamp", "the lamp"],
  crate: ["crate", "the crate"],
  clue: ["clue", "the clue"],
  castle: ["castle", "the castle", "keep"],
  horse: ["horse", "the horse", "steed"],
  sword: ["sword", "the sword", "blade"],
  bow: ["bow", "the bow"],
  arrow: ["arrow", "an arrow", "the arrow"],
};

const ZONE_ALIASES: Array<{ zone: StageZone; aliases: string[] }> = [
  { zone: "offstage_left", aliases: ["offstage left", "off left", "stage left off", "left wing"] },
  { zone: "left", aliases: ["left", "stage left", "left side"] },
  { zone: "center", aliases: ["center", "centre", "middle", "midstage"] },
  { zone: "right", aliases: ["right", "stage right", "right side"] },
  { zone: "offstage_right", aliases: ["offstage right", "off right", "stage right off", "right wing"] },
  { zone: "lamp", aliases: ["lamp", "by the lamp", "at the lamp", "to the lamp", "from the lamp"] },
  { zone: "crate", aliases: ["crate", "by the crate", "at the crate", "to the crate", "behind the crate"] },
  { zone: "castle", aliases: ["castle", "at the castle", "to the castle", "keep"] },
  { zone: "hillside", aliases: ["hillside", "hill", "the hill"] },
  { zone: "horse", aliases: ["horse", "at the horse", "to the horse", "steed"] },
  { zone: "dragon_roost", aliases: ["dragon roost", "roost", "dragon hill"] },
  { zone: "top_right", aliases: ["top right", "upper right", "sky right"] },
  { zone: "ground_right", aliases: ["ground right", "right ground", "ground"] },
];

const ACTION_RULES: Array<{ action: StageAction; patterns: RegExp[] }> = [
  { action: "enter", patterns: [/\benter(?:s|ed|ing)?\b/, /\bcome(?:s| in| into)?\b/, /\barriv(?:e|es|ed|ing)\b/, /\bstep(?:s|ped|ping)?\s+on\b/] },
  { action: "walk", patterns: [/\bwalk(?:s|ed|ing)?\b/, /\bmove(?:s|d|ing)?\b/, /\bgo(?:es|ing)?\b/] },
  { action: "run", patterns: [/\brun(?:s|ning|ned)?\b/, /\bsprint(?:s|ed|ing)?\b/] },
  { action: "point", patterns: [/\bpoint(?:s|ed|ing)?\b/, /\bgesture(?:s|d|ing)?\s+at\b/] },
  { action: "talk", patterns: [/\bsay(?:s|ing|id)?\b/, /\btalk(?:s|ed|ing)?\b/, /\bspeak(?:s|ing|ed)?\b/, /\bwhisper(?:s|ed|ing)?\b/, /\banswer(?:s|ed|ing)?\b/] },
  { action: "laugh", patterns: [/\blaugh(?:s|ed|ing)?\b/, /\bchuckle(?:s|d|ing)?\b/] },
  { action: "gasp", patterns: [/\bgasp(?:s|ed|ing)?\b/, /\bpant(?:s|ed|ing)?\b/] },
  { action: "hide", patterns: [/\bhide(?:s|d|ing)?\b/, /\bsneak(?:s|ed|ing)?\b/, /\bcrouch(?:es|ed|ing)?\b/] },
  { action: "exit", patterns: [/\bexit(?:s|ed|ing)?\b/, /\bleav(?:e|es|ing|t)?\b/, /\bdepart(?:s|ed|ing)?\b/] },
  { action: "ride", patterns: [/\bride(?:s|r|ing)?\b/, /\bmount(?:s|ed|ing)?\b/] },
  { action: "hold", patterns: [/\bhold(?:s|ing)?\b/, /\bheld\b/, /\bgrip(?:s|ped|ping)?\b/, /\bpick(?:s|ed|ing)?\s+up\b/, /\bcarry(?:ing)?\b/, /\bcarries\b/, /\bcarried\b/, /\bgrab(?:s|bed|bing)?\b/, /\btake(?:s|n)?\b/, /\btook\b/] },
  { action: "drop", patterns: [/\bdrop(?:s|ped|ping)?\b/, /\bdiscard(?:s|ed|ing)?\b/] },
  { action: "shoot", patterns: [/\bshoot(?:s|ing)?\b/, /\bfire(?:s|d|ing)?\b/] },
  { action: "fly", patterns: [/\bfly(?:s|ing)?\b/, /\bsoar(?:s|ed|ing)?\b/] },
  { action: "fall", patterns: [/\bfall(?:s|ing|en)?\b/, /\bcrash(?:es|ed|ing)?\b/] },
  { action: "attack", patterns: [/\battack(?:s|ed|ing)?\b/, /\bstrike(?:s|struck|ing)?\b/, /\bslash(?:es|ed|ing)?\b/] },
];

const QUOTE_PATTERN = /["“”']([^"“”']+)["“”']/;
const PREPOSITION_PATTERN = /\b(?:from|to|toward|towards|at|behind|inside|into|onto|on|near|by)\b(?:\s+the)?\s+([a-z][a-z\s_-]*)/g;

function normalizeText(input: string): string {
  return input
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function splitClauses(input: string): string[] {
  const normalized = normalizeText(input).toLowerCase();
  if (!normalized) {
    return [];
  }

  const protectedQuotes: string[] = [];
  const quoted = normalized
    .replace(/"([^"]+)"/g, (_match, quote: string) => {
      protectedQuotes.push(quote);
      return `__QUOTE_${protectedQuotes.length - 1}__`;
    })
    .replace(/'([^']+)'/g, (_match, quote: string) => {
      protectedQuotes.push(quote);
      return `__QUOTE_${protectedQuotes.length - 1}__`;
    });

  const primaryClauses = quoted
    .split(/(?:,|;|\bthen\b|\band then\b|\n+)/g)
    .map((part) => part.trim())
    .filter(Boolean);

  const clauses: string[] = [];
  for (const primary of primaryClauses) {
    const andParts = splitOnActionAnds(primary);
    for (const part of andParts) {
      const restored = part.replace(/__QUOTE_(\d+)__/g, (_match, index: string) => `"${protectedQuotes[Number(index)] ?? ""}"`);
      const cleaned = restored.replace(/\s+/g, " ").trim();
      if (cleaned) {
        clauses.push(cleaned);
      }
    }
  }

  return clauses;
}

function splitOnActionAnds(segment: string): string[] {
  if (!/\band\b/i.test(segment)) {
    return [segment];
  }

  const chunks = segment.split(/\band\b/i).map((part) => part.trim()).filter(Boolean);
  if (chunks.length <= 1) {
    return [segment];
  }

  const result: string[] = [chunks[0]];
  let currentClause = chunks[0];

  for (let i = 1; i < chunks.length; i += 1) {
    const right = chunks[i];
    const leftHasAction = findAction(currentClause) !== null;
    const rightLooksLikeAction = findAction(right) !== null || startsLikeDirection(right);

    if (leftHasAction && rightLooksLikeAction) {
      result.push(right);
      currentClause = right;
    } else {
      result[result.length - 1] = `${result[result.length - 1]} and ${right}`;
      currentClause = `${currentClause} and ${right}`;
    }
  }

  return result;
}

function startsLikeDirection(segment: string): boolean {
  return /^(from|to|toward|towards|at|behind|inside|into|onto|on|near|by)\b/.test(segment.trim());
}

function findAction(clause: string): StageAction | null {
  for (const rule of ACTION_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(clause))) {
      return rule.action;
    }
  }
  return null;
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, "").trim();
}

function buildAliasList(entity: DirectionActor | DirectionProp, fallbackAliases: string[]): string[] {
  const aliases = new Set<string>();
  for (const alias of fallbackAliases) {
    aliases.add(alias.toLowerCase());
  }

  aliases.add(entity.id.toLowerCase());
  if ("name" in entity) {
    aliases.add(entity.name.toLowerCase());
  }

  if (entity.aliases) {
    for (const alias of entity.aliases) {
      aliases.add(alias.toLowerCase());
    }
  }

  return Array.from(aliases)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

function buildActorAliases(options: DirectionParseOptions): Array<{ actorId: string; actorLabel: string; aliases: string[] }> {
  const actors = options.actors ?? [];
  const seen = new Map<string, { actorId: string; actorLabel: string; aliases: string[] }>();

  for (const actor of actors) {
    const defaults = DEFAULT_ACTOR_ALIASES[actor.id.toLowerCase()] ?? [];
    seen.set(actor.id, {
      actorId: actor.id,
      actorLabel: actor.name,
      aliases: buildAliasList(actor, defaults),
    });
  }

  if (actors.length === 0 && !seen.has("fenn")) {
    seen.set("fenn", {
      actorId: "fenn",
      actorLabel: "Fenn",
      aliases: DEFAULT_ACTOR_ALIASES.fenn,
    });
  }

  if (actors.length === 0 && !seen.has("nix")) {
    seen.set("nix", {
      actorId: "nix",
      actorLabel: "Nix",
      aliases: DEFAULT_ACTOR_ALIASES.nix,
    });
  }

  return Array.from(seen.values());
}

function buildPropAliases(options: DirectionParseOptions): Array<{ propId: string; aliases: string[]; zone?: StageZone }> {
  const props = options.props ?? [];
  const seen = new Map<string, { propId: string; aliases: string[]; zone?: StageZone }>();

  for (const prop of props) {
    const defaults = DEFAULT_PROP_ALIASES[prop.id.toLowerCase()] ?? [];
    seen.set(prop.id, {
      propId: prop.id,
      aliases: buildAliasList(prop, defaults),
      zone: prop.zone,
    });
  }

  for (const propId of STAGE_PROP_IDS) {
    if (!seen.has(propId)) {
      seen.set(propId, {
        propId,
        aliases: DEFAULT_PROP_ALIASES[propId],
      });
    }
  }

  return Array.from(seen.values());
}

function resolveActor(clause: string, options: DirectionParseOptions): ActorMatch[] {
  const actorAliases = buildActorAliases(options);
  const matches: ActorMatch[] = [];

  for (const actor of actorAliases) {
    for (const alias of actor.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(clause)) !== null) {
        matches.push({
          actorId: actor.actorId,
          actorLabel: actor.actorLabel,
          index: match.index,
          aliasLength: alias.length,
        });
      }
    }
  }

  return matches.sort((a, b) => a.index - b.index || b.aliasLength - a.aliasLength);
}

function resolveObjectMentions(clause: string, options: DirectionParseOptions): ObjectMatch[] {
  const matches: ObjectMatch[] = [];

  for (const zone of STAGE_ZONES) {
    const aliases = ZONE_ALIASES.find((entry) => entry.zone === zone)?.aliases ?? [zone];
    for (const alias of aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(clause)) !== null) {
        matches.push({
          id: zone,
          kind: "zone",
          zone,
          index: match.index,
          aliasLength: alias.length,
        });
      }
    }
  }

  const propAliases = buildPropAliases(options);
  for (const prop of propAliases) {
    for (const alias of prop.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(clause)) !== null) {
        matches.push({
          id: prop.propId,
          kind: "prop",
          zone: prop.zone,
          index: match.index,
          aliasLength: alias.length,
        });
      }
    }
  }

  const actorAliases = buildActorAliases(options);
  for (const actor of actorAliases) {
    for (const alias of actor.aliases) {
      const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "gi");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(clause)) !== null) {
        matches.push({
          id: actor.actorId,
          kind: "actor",
          index: match.index,
          aliasLength: alias.length,
        });
      }
    }
  }

  return matches.sort((a, b) => a.index - b.index || b.aliasLength - a.aliasLength);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractDialogue(clause: string): string | undefined {
  const quoted = clause.match(QUOTE_PATTERN);
  if (quoted?.[1]) {
    return stripQuotes(quoted[1]);
  }

  const sayMatch = clause.match(/\b(?:say|says|said|saying|whisper|whispers|whispered|speak|speaks|spoke|talk|talks|talked|tell|tells|told)\b(?:\s+(?:that|to))?\s*(.+)$/i);
  if (!sayMatch?.[1]) {
    return undefined;
  }

  return stripQuotes(sayMatch[1]);
}

function extractAction(clause: string): StageAction | null {
  return findAction(clause);
}

function extractTarget(clause: string, action: StageAction | null, options: DirectionParseOptions): { targetId?: string; zone?: StageZone } {
  const matches = resolveObjectMentions(clause, options);
  const objectCandidates = matches.filter((match) => match.kind === "prop" || match.kind === "actor" || match.kind === "zone");
  const targetWords = [...clause.matchAll(PREPOSITION_PATTERN)].map((match) => ({
    phrase: match[1].trim().toLowerCase(),
    index: match.index ?? 0,
  }));

  const findBest = (predicate: (item: ObjectMatch) => boolean): ObjectMatch | undefined => {
    const exact = objectCandidates.find(predicate);
    if (exact) {
      return exact;
    }

    const fromPreposition = targetWords
      .map((entry) => objectCandidates.find((candidate) => candidate.id === entry.phrase || candidate.id.startsWith(entry.phrase)))
      .find(Boolean);

    return fromPreposition;
  };

  if (action === "point" || action === "talk" || action === "hold" || action === "drop" || action === "shoot" || action === "attack") {
    if (action === "shoot" || action === "attack") {
      const actorTarget = objectCandidates.find((item) => item.kind === "actor" && item.index > 0);
      if (actorTarget) return { targetId: actorTarget.id };
    }
    if (action === "hold" || action === "drop") {
      const propTarget = findBest((item) => item.kind === "prop");
      return propTarget ? { targetId: propTarget.id } : {};
    }
    const target = findBest((item) => item.kind === "prop" || item.kind === "actor");
    return target ? { targetId: target.id } : {};
  }

  if (action === "enter" || action === "walk" || action === "run" || action === "hide" || action === "exit" || action === "ride" || action === "fly" || action === "fall") {
    const directionalDestination = clause.match(/\b(?:to|toward|towards)\s+(?:the\s+)?(top right|ground right|dragon roost|offstage left|offstage right|castle|hillside|horse|left|center|right)\b/i)?.[1].toLowerCase();
    if (directionalDestination) {
      const resolvedZone = ZONE_ALIASES.find((entry) => entry.aliases.includes(directionalDestination))?.zone;
      if (resolvedZone) return { zone: resolvedZone };
    }
    const target = findBest((item) => item.kind === "zone" || item.kind === "prop");
    if (!target) {
      return {};
    }

    if (target.kind === "zone") {
      return { zone: target.zone ?? (target.id as StageZone) };
    }

    return {
      targetId: target.id,
      zone: target.zone ?? (STAGE_ZONES.includes(target.id as StageZone) ? (target.id as StageZone) : undefined),
    };
  }

  return {};
}

function buildWarning(code: string, severity: DirectionParseSeverity, message: string, clauseIndex?: number, clause?: string, suggestion?: string): DirectionParseWarning {
  return {
    code,
    severity,
    message,
    clauseIndex,
    clause,
    suggestion,
  };
}

export function parseDirection(input: string, options: DirectionParseOptions = {}): DirectionParseResult {
  const normalizedInput = normalizeText(input);
  const clauses = splitClauses(normalizedInput);
  const beats: ParsedDirectionBeat[] = [];
  const warnings: DirectionParseWarning[] = [];
  let currentActorId = options.defaultActorId;
  let currentActorLabel = options.defaultActorId ?? "";

  if (!normalizedInput) {
    return {
      status: "empty",
      input,
      normalizedInput,
      clauses: [],
      beats: [],
      warnings: [],
    };
  }

  clauses.forEach((clause, clauseIndex) => {
    const action = extractAction(clause);
    const dialogue = extractDialogue(clause);
    const actorMatches = resolveActor(clause, options);
    const actorMatch = actorMatches[0];
    const inferredActor = !actorMatch;

    if (actorMatch) {
      currentActorId = actorMatch.actorId;
      currentActorLabel = actorMatch.actorLabel;

      const uniqueActors = Array.from(new Set(actorMatches.map((match) => match.actorId)));
      if (uniqueActors.length > 1) {
        warnings.push(
          buildWarning(
            "multiple-actors",
            "warning",
            `Clause "${clause}" mentions more than one actor. Using ${actorMatch.actorLabel}.`,
            clauseIndex,
            clause,
            "Split the line into separate clauses if each actor should receive a separate beat.",
          ),
        );
      }
    }

    if (!action && !dialogue) {
      warnings.push(
        buildWarning(
          "unrecognized-clause",
          "warning",
          `Could not find a supported action in clause "${clause}".`,
          clauseIndex,
          clause,
          "Use one of enter, walk, run, point, talk, laugh, gasp, hide, exit, ride, hold, drop, shoot, fly, fall, or attack.",
        ),
      );
      return;
    }

    if (!currentActorId) {
      warnings.push(
        buildWarning(
          "missing-actor",
          "error",
          `Could not identify which character should perform "${clause}".`,
          clauseIndex,
          clause,
          "Mention Fenn or Nix, or pass a defaultActorId.",
        ),
      );
      return;
    }

    const target = extractTarget(clause, action, options);
    const beatAction = action ?? (dialogue ? "talk" : null);

    if (!beatAction) {
      warnings.push(
        buildWarning(
          "missing-action",
          "error",
          `Could not map clause "${clause}" to a supported action.`,
          clauseIndex,
          clause,
          "Try saying the action explicitly, like walks, points, gasps, or says.",
        ),
      );
      return;
    }

    const beat: ParsedDirectionBeat = {
      id: `beat-${clauseIndex + 1}`,
      actorId: currentActorId,
      actorLabel: currentActorLabel || currentActorId,
      action: beatAction,
      clauseIndex,
      clause,
      inferredActor,
      inferredAction: !action,
      confidence: inferredActor ? 0.72 : 0.92,
      ...target,
    };

    if (beat.action === "talk" && !beat.dialogue && dialogue) {
      beat.dialogue = dialogue;
    } else if (beat.action === "talk" && !beat.dialogue && /["']/.test(clause)) {
      beat.dialogue = dialogue;
    }

    if (beat.action === "walk" || beat.action === "run" || beat.action === "enter" || beat.action === "hide" || beat.action === "exit" || beat.action === "ride" || beat.action === "fly" || beat.action === "fall") {
      if (!beat.zone && !beat.targetId) {
        warnings.push(
          buildWarning(
            "missing-location",
            "warning",
            `Clause "${clause}" has a movement action but no clear destination.`,
            clauseIndex,
            clause,
            "Add a zone or prop name like left, right, lamp, or crate.",
          ),
        );
      }
    }

    if (beat.action === "point" && !beat.targetId) {
      warnings.push(
        buildWarning(
          "missing-point-target",
          "warning",
          `Clause "${clause}" points, but no clear target was found.`,
          clauseIndex,
          clause,
          "Add a prop or character after at, toward, or to.",
        ),
      );
    }

    if (beat.action === "hold" || beat.action === "drop") {
      const propTargets = Array.from(new Set(
        resolveObjectMentions(clause, options)
          .filter((match) => match.kind === "prop")
          .map((match) => match.id),
      ));
      if (propTargets.length > 1) {
        propTargets.forEach((targetId, targetIndex) => {
          beats.push({ ...beat, id: `beat-${clauseIndex + 1}-${targetIndex + 1}`, targetId });
        });
        return;
      }
    }

    beats.push(beat);
  });

  const status: DirectionParseResult["status"] =
    beats.length === 0 ? "empty" : warnings.some((warning) => warning.severity === "error") ? "partial" : warnings.length > 0 ? "partial" : "ok";

  return {
    status,
    input,
    normalizedInput,
    clauses,
    beats,
    warnings,
  };
}

export function parseDirectionForScene(input: string, scene: SceneSnapshot, options: Omit<DirectionParseOptions, "actors" | "props"> = {}): DirectionParseResult {
  return parseDirection(input, {
    ...options,
    actors: scene.actors.map((actor) => ({
      id: actor.id,
      name: actor.name,
      preset: actor.preset,
    })),
    props: scene.props.map((prop) => ({
      id: prop.id,
      zone: prop.zone,
    })),
  });
}

export function getSupportedActions(): readonly StageAction[] {
  return STAGE_ACTIONS;
}
