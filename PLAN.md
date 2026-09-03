# StoryStage implementation plan

## 1. Project charter

Build **StoryStage**, a browser-based 2D storytelling stage where a person and a browser agent co-direct a live scene.

### Product thesis

StoryStage is **not** a general-purpose animated movie generator. It is an **agent-native stage where a person and their browser agent co-direct a live scene**.

The human creates a cast and setting, then types or speaks stage directions. The browser agent can use WebMCP tools to perform the same actions against the same visible scene state.

### Challenge MVP outcome

Deliver a deployed web app with:

- A polished 2D theater canvas.
- Two or more character presets, one polished demo scene, props, and expressions.
- Typed direction and optional browser speech-to-text.
- A constrained action vocabulary: `enter`, `walk`, `run`, `point`, `talk`, `laugh`, `gasp`, `hide`, `exit`.
- A visible action queue and animated playback.
- Working WebMCP tools that let a browser agent inspect and direct the stage.
- A public source repository, open-source license, README, deployed URL, and short narrated demo.

### Explicit non-goals for the MVP

- General-purpose video or movie generation.
- Arbitrary generated art, voice acting, lip sync, or cinematic camera work.
- Unbounded animation instructions.
- Multiplayer and persistent story worlds.
- Authentication, payments, or a backend unless strictly needed for deployment.

## 2. Suggested stack

Choose the fastest familiar path. Recommended default:

- **Vite + React + TypeScript** for a small, deployable frontend.
- **HTML/CSS/SVG** for 2D scenery, characters, expressions, props, and transitions.
- **Zustand** or React reducer/context for the scene graph state.
- **Web Speech API** for optional speech recognition, with typed input as the required fallback.
- **WebMCP** through `document.modelContext.registerTool` in a browser-only integration module.
- **Vercel, Netlify, or Cloudflare Pages** for immediate static deployment.

Do not add an OpenAI API dependency for the MVP. The browser agent demonstrates the agent interaction through WebMCP. Local text direction can be translated with a constrained parser and action chips; this is more reliable than adding model/API/key management under deadline.

## 3. Product flow

### Create mode

1. User chooses a backdrop: `neon_alley` is the polished default.
2. User adds Detective Fenn (fox) and Nix (robot) from character presets.
3. User chooses names, palette variants, and an expression.
4. User places characters in stage zones and adds props such as `lamp`, `crate`, and `clue`.

### Story mode

1. User types a direction or uses the microphone.
2. The app parses supported clauses into valid action beats.
3. The parsed beats appear in a reviewable queue.
4. User chooses **Play scene**.
5. The stage runs the beats sequentially with visible motion, expression, speech bubble, or effect.

### Agent co-direct mode

1. The user opens the deployed app in ChatGPT’s in-app browser.
2. The agent discovers StoryStage’s WebMCP tools.
3. The user asks the agent to stage a specific beat.
4. The agent calls `get_scene_state`, then structured mutation tools.
5. The page visibly updates and returns the resulting state to the agent.
6. The human can change, clear, or play the action queue at any time.

## 4. Scene model

Use one client-side source of truth. Both UI controls and WebMCP handlers must call the same command functions.

```ts
type Action =
  | "enter" | "walk" | "run" | "point" | "talk"
  | "laugh" | "gasp" | "hide" | "exit";

type Zone = "offstage_left" | "left" | "center" | "right" | "offstage_right" | "lamp" | "crate";
type Expression = "neutral" | "happy" | "surprised" | "suspicious" | "amused" | "worried";

type Actor = {
  id: string;
  preset: "fox_detective" | "robot";
  name: string;
  palette: string;
  zone: Zone;
  expression: Expression;
  visible: boolean;
};

type Beat = {
  id: string;
  actorId: string;
  action: Action;
  targetId?: string;
  zone?: Zone;
  dialogue?: string;
  status: "queued" | "playing" | "complete" | "failed";
};

type SceneState = {
  sceneId: "neon_alley";
  actors: Actor[];
  props: Array<{ id: "lamp" | "crate" | "clue"; zone: Zone }>;
  queue: Beat[];
  isPlaying: boolean;
};
```

## 5. Command layer

Keep all mutations in a framework-agnostic command module. The UI and tools must never maintain separate behavior.

- `createCharacter(input)`
- `createScene(input)`
- `placeActor(input)`
- `queueAction(input)`
- `setExpression(input)`
- `playQueue()`
- `clearQueue()`
- `getSceneSummary()`

`getSceneSummary()` should return compact, agent-friendly state, for example:

```json
{
  "scene": "neon_alley",
  "actors": [
    { "id": "fenn", "name": "Detective Fenn", "zone": "center", "expression": "suspicious" },
    { "id": "nix", "name": "Nix", "zone": "crate", "expression": "worried" }
  ],
  "props": ["lamp", "crate", "clue"],
  "queue": [{ "id": "beat-3", "actor": "nix", "action": "hide", "status": "queued" }]
}
```

## 6. WebMCP tool contracts

Register tools only after checking browser support:

```ts
if (typeof document.modelContext?.registerTool === "function") {
  // register StoryStage tools here
}
```

Use clear descriptions, narrow JSON schemas, `additionalProperties: false`, explicit action/zone enums, and informative results.

### Read tool

`get_scene_state`

- No input.
- Mark with `annotations: { readOnlyHint: true }`.
- Return the compact scene summary.

### Mutation tools

`create_character`

- Input: `preset`, `name`, optional `palette`.
- Return: created actor and updated scene summary.

`create_scene`

- Input: `sceneId` enum, initially only `neon_alley`.
- Return: initialized scene summary.

`place_actor`

- Input: `actorId`, `zone` enum.
- Return: updated actor and summary.

`direct_action`

- Input: `actorId`, `action` enum, optional `zone`, `targetId`, `dialogue`.
- Validate that the actor exists and that the target/zone is valid for the action.
- Queue one atomic beat; do not accept a freeform multi-step prompt.
- Return: queued beat and summary.

`set_expression`

- Input: `actorId`, `expression` enum.
- Return: updated actor and summary.

`play_scene`

- Input: optional `beatIds`; default to the full queue.
- Return: completed beat IDs and final summary.

### Tool design rules

- Never accept raw coordinates; use named stage zones.
- Never accept arbitrary animation commands; use the fixed action enum.
- Return current state after every mutation.
- Show all agent-triggered changes visibly in the UI.
- Validate every input even though it originates from an agent.
- Fail with a useful message, e.g. `Actor nix is already offstage; enter before directing walk.`

## 7. Natural-language direction parser

This is a convenience feature, not the core demonstration. Keep it constrained.

### First implementation

- Provide clickable example prompts and action chips.
- Split typed text on commas, `then`, and `and`.
- Match known character names, action verbs, props, and zone words.
- Convert each matched clause into one `Beat`.
- Render unrecognized text as a clear inline warning and offer valid action chips.

Example mapping:

| Language | Structured beat |
|---|---|
| “Fenn enters from the left” | `fenn`, `enter`, `left` |
| “Nix runs to the crate” | `nix`, `run`, `crate` |
| “Fenn points at the clue” | `fenn`, `point`, target `clue` |
| “Nix gasps” | `nix`, `gasp` |
| “Fenn says ‘I found it!’” | `fenn`, `talk`, dialogue |

### Voice input

- Use browser `SpeechRecognition` only when available.
- Show a microphone button and transcript preview.
- Send the transcript through the exact same parser as typed input.
- Do not block the app if recognition is unsupported or permission is denied.

## 8. UI and visual requirements

### Layout

- Main: large stage canvas with background, props, actors, and animation overlays.
- Left/bottom: cast and scene controls.
- Right/bottom: typed direction field, microphone, action queue, and Play/Clear controls.
- Persistent small status label: `Agent-ready` when WebMCP registration succeeds, otherwise `Human direction mode`.

### Visual priorities

- Make every state change unmistakable: motion path, expression shift, bubble, glow, or sound-effect label.
- Prefer a coherent art direction over many assets. A rainy neon alley with two memorable characters is sufficient.
- Make agent actions distinguishable in the activity log: `Agent queued: Nix → hide behind crate`.
- Preserve accessibility: keyboard controls, real buttons/labels, clear focus states, no color-only status.

## 9. Build order

### Phase 1 — Scaffold and deploy early

- Initialize the TypeScript frontend.
- Add one route and static deployment config.
- Deploy a hello-stage page immediately.
- Add MIT license, README, and `.gitignore`.

**Done when:** a public URL loads a stage shell on desktop and mobile browser.

### Phase 2 — Scene engine

- Implement types, initial `neon_alley` state, reducer/store, and command module.
- Implement actor placement and queue display.
- Add reset scene behavior.

**Done when:** UI controls produce correct, inspectable scene summaries and queued beats.

### Phase 3 — Animation and art

- Build backdrop, lamp, crate, clue, Fenn, and Nix using CSS/SVG.
- Implement each of the nine actions with short deterministic transitions.
- Add expression variations and dialogue bubbles.

**Done when:** the demo scene looks alive and every action can play twice without broken state.

### Phase 4 — Human direction

- Add typed prompt parser, example prompts, validation feedback, and queue review.
- Add optional Web Speech API support.

**Done when:** the canonical demo prompt creates a valid action queue without manual correction.

### Phase 5 — WebMCP

- Add WebMCP support detection and tool-registration module.
- Register the read tool first, then each mutation tool.
- Ensure UI and tool calls share command functions.
- Add activity log and returned compact summaries.

**Done when:** a compatible browser agent can inspect state, stage a beat, and visibly play it.

### Phase 6 — Test, polish, submit

- Test all tools with valid and invalid inputs.
- Test with a browser agent in ChatGPT’s in-app browser.
- Record the demo after the live URL is stable.
- Complete the Devpost description, repository, license, and video link.

## 10. Acceptance tests

### Human flow

1. Reset the stage.
2. Add Fenn and Nix.
3. Place Fenn at `lamp` and Nix `offstage_right`.
4. Type: “Nix enters from the right, walks to the crate, gasps, and hides.”
5. Confirm four valid beats appear in order.
6. Play the queue and confirm Nix reaches the crate and ends hidden.

### Agent flow

1. Open the deployed site in ChatGPT’s in-app browser.
2. Ask the agent: “Inspect the scene, then make Fenn point at the clue and laugh.”
3. Confirm the agent uses `get_scene_state` before directing actions.
4. Confirm it uses `direct_action` twice.
5. Confirm the activity log and visual stage update.
6. Confirm the tool result describes the final state accurately.

### Failure cases

- Invalid actor ID returns an error and changes nothing.
- Unsupported action returns an error and changes nothing.
- `walk` for an offstage actor returns a useful instruction to enter first.
- Speech recognition unavailable leaves typed direction fully functional.
- No WebMCP support leaves all normal UI controls functional.

## 11. Demo video outline (under 3 minutes)

1. **0:00–0:15 — Hook:** “StoryStage lets you co-direct a live animated story with your browser agent.” Show the finished rainy alley stage.
2. **0:15–0:45 — Human direction:** type or speak a short direction; show Fenn acting it out.
3. **0:45–1:45 — WebMCP:** ask the browser agent to inspect and direct the robot. Keep the stage visible while tools execute.
4. **1:45–2:20 — Collaboration:** change the next beat after the agent’s action; show the shared queue.
5. **2:20–2:50 — Explain:** show the fixed action vocabulary and explain that WebMCP tools act on the same scene graph as the human UI.
6. **2:50–3:00 — Close:** “A person and an agent, visibly co-directing the same stage.”

## 12. Submission checklist

- [ ] Public deployed URL works without special setup.
- [ ] WebMCP support and tool discovery tested in ChatGPT’s in-app browser.
- [ ] Public repository contains all source, assets, setup instructions, and an open-source license.
- [ ] README explains mission, WebMCP use, local setup, and long-term goals.
- [ ] Devpost description explains the user/agent workflow, why WebMCP matters, and what was implemented.
- [ ] Public video is under three minutes, has audio, and shows a working live demo.
- [ ] Submission links are checked in a private/incognito browser session.
