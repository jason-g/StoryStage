import { useEffect, useRef, useState } from "react";
import Stage from "./Stage";
import { parseDirectionForScene } from "./parser";
import { buildPlaybackPlan, SOUND_ACTIONS, STAGE_ACTIONS, STAGE_EXPRESSIONS, STAGE_ZONES, type SceneState, type StageAction } from "./playback";
import { isSoundAction, playQueuedSound } from "./sound";
import { clearQueue, createCharacter, createHillsideQuestScene, createScene, getSceneSummary, placeActor, queueAction, setExpression, updateBeatStatus, type SceneCommand } from "./scene";
import { registerStoryStageTools } from "./webmcp";
import { completeBridgeCommand, getBridgeCommands, publishScene, type AgentBridgeCommand } from "./agentBridge";
import "./ui.css";
import "./scene-ui.css";
import "./voice.css";
import "./replay.css";
import "./tutorial.css";
import "./sound.css";

type Activity = { id: number; text: string; source: "You" | "Agent" | "Stage" };
type AgentReasoning = { status: "idle" | "thinking" | "queued" | "error"; text: string; actionCount: number };
type SpeechAlternative = { transcript: string; confidence?: number };
type SpeechResult = ArrayLike<SpeechAlternative> & { isFinal: boolean };
type SpeechRecognitionError = { error?: string; message?: string };
type SpeechSession = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: (event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void; onend: () => void; onerror: (event: SpeechRecognitionError) => void };
type SpeechFactory = new () => SpeechSession;
const examples = ["Nix enters from the right, walks to the crate, gasps, and hides.", "Fenn points at the clue and says ‘I found it!’", "Fenn laughs, then Nix exits right."];
const questSuggestionSteps = [
  [
    "Sir Arthur sees the dragon and gasps.",
    "After a few seconds, Sir Arthur shoots an arrow at the dragon.",
    "It misses, so Sir Arthur fires another arrow at the dragon.",
  ],
  [
    "This time the arrow hits the dragon, and Ember gasps.",
    "The dragon falls from the sky to the ground.",
    "The knight rides the horse to the ground right, beside the dragon.",
  ],
  [
    "The knight attacks the dragon.",
    "The dragon dies.",
    "The knight jumps, runs back to the castle, and points at the dragon.",
  ],
];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MOVEMENT_PLAYBACK_RATE = 0.25;
const movementActions = new Set(["enter", "walk", "move", "run", "hide", "exit", "ride", "fly", "fall"]);
const SAVED_QUEUE_KEY = "storystage.savedQueue.v1";
const TUTORIAL_SEEN_KEY = "storystage.tutorialSeen.v1";
const tutorialSteps = [
  { title: "Set the cast and scene", body: "The highlighted Scene controls choose the stage, expressions, and starting positions. Reset restores the opening arrangement whenever you want a fresh take." },
  { title: "Arrange the action queue", body: "The highlighted queue is your scene timeline. Use ↑ and ↓ to reorder beats, ↻ to replay from one beat onward, Save and Load to keep a version, and Play scene when the order feels right." },
  { title: "Add a stage direction", body: "Use one of the three suggestions, type into the highlighted direction box, or select the microphone and speak naturally. Add to queue turns the direction into playable beats." },
  { title: "Connect an agent harness", body: "If the header says Browser agent-ready, the in-browser agent is already connected and no toggle is needed. To control this page from an external Codex, OpenCode, or Pi harness, configure the local stdio bridge below, turn on Connect external harness, and keep this page open.", code: 'node C:/path/to/vistell/server/agent-bridge.mjs' },
];
const tutorialTargets = [
  ".control-panel section:first-child",
  ".control-panel section:nth-child(2)",
  ".director",
  ".agent-control",
];
const soundLabels: Record<(typeof SOUND_ACTIONS)[number], string> = { crash: "💥 Crash", gallop: "🐎 Horse riding", arrow_shot: "➤ Arrow shot", sword_clash: "⚔ Sword fight", yell: "📣 Yelling", murmur: "🗣 Talking", cheer: "👏 Cheering" };

export default function App() {
  const [scene, setScene] = useState<SceneState>(createHillsideQuestScene);
  const [prompt, setPrompt] = useState(questSuggestionSteps[0][0]);
  const [notice, setNotice] = useState("The hillside quest is ready. Direct the next beat.");
  const [activity, setActivity] = useState<Activity[]>([{ id: 0, source: "Stage", text: "Sir Arthur waits at the castle with sword and bow while Ember circles at the top right." }]);
  const [activeBeat, setActiveBeat] = useState<SceneState["queue"][number] | null>(null);
  const [agentReady, setAgentReady] = useState(false);
  const [agentControl, setAgentControl] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<"off" | "connecting" | "ready" | "unavailable">("off");
  const [agentReasoning, setAgentReasoning] = useState<AgentReasoning>({ status: "idle", text: "Waiting for an agent to inspect the scene.", actionCount: 0 });
  const [bridgeRetry, setBridgeRetry] = useState(0);
  const [listening, setListening] = useState(false);
  const [liveStory, setLiveStory] = useState(true);
  const [tutorialStep, setTutorialStep] = useState<number | null>(() => {
    try { return localStorage.getItem(TUTORIAL_SEEN_KEY) ? null : 0; } catch { return 0; }
  });
  const stateRef = useRef(scene);
  const toolRegistered = useRef(false);
  const recognitionRef = useRef<SpeechSession | null>(null);
  const liveStoryRef = useRef(true);
  const replayOriginRef = useRef<SceneState>({ ...scene, actors: scene.actors.map((actor) => ({ ...actor })), props: scene.props.map((prop) => ({ ...prop })), queue: [], isPlaying: false });

  const rememberReplayOrigin = (state: SceneState) => {
    replayOriginRef.current = {
      ...state,
      actors: state.actors.map((actor) => ({ ...actor })),
      props: state.props.map((prop) => ({ ...prop })),
      queue: [],
      isPlaying: false,
    };
  };

  const commit = <T,>(command: SceneCommand<T>, source: Activity["source"] = "You") => {
    if (!command.ok) { setNotice(command.error); return { ok: false, error: command.error, summary: getSceneSummary(stateRef.current) }; }
    stateRef.current = command.state;
    setScene(command.state);
    const text = command.message ?? "Stage updated.";
    setNotice(text);
    setActivity((items) => [{ id: Date.now(), source, text }, ...items].slice(0, 7));
    return { ok: true, result: command.result, summary: getSceneSummary(command.state) };
  };

  const direct = (input: Record<string, unknown>, source: Activity["source"] = "You") => {
    if (stateRef.current.queue.length === 0) rememberReplayOrigin(stateRef.current);
    return commit(queueAction(stateRef.current, input), source);
  };
  const beginAgentReasoning = (input: Record<string, unknown>) => {
    const goal = typeof input.goal === "string" ? input.goal.trim().slice(0, 160) : "";
    if (!goal) return { ok: false, error: "A short planning goal is required.", summary: getSceneSummary(stateRef.current) };
    setAgentReasoning({ status: "thinking", text: goal, actionCount: 0 });
    return { ok: true, result: { status: "thinking", goal }, summary: getSceneSummary(stateRef.current) };
  };
  const queueAgentPlan = (input: Record<string, unknown>) => {
    const summary = typeof input.summary === "string" ? input.summary.trim().slice(0, 240) : "";
    const actions = Array.isArray(input.actions) ? input.actions.slice(0, 12) : [];
    if (!summary || !actions.length) {
      const error = "A planning summary and at least one action are required.";
      setAgentReasoning({ status: "error", text: error, actionCount: 0 });
      return { ok: false, error, summary: getSceneSummary(stateRef.current) };
    }
    let next = stateRef.current;
    for (const action of actions) {
      if (!action || typeof action !== "object" || Array.isArray(action)) {
        const error = "Every planned action must be an object.";
        setAgentReasoning({ status: "error", text: error, actionCount: 0 });
        return { ok: false, error, summary: getSceneSummary(stateRef.current) };
      }
      const queued = queueAction(next, action as Record<string, unknown>);
      if (!queued.ok) {
        setAgentReasoning({ status: "error", text: queued.error, actionCount: 0 });
        return { ok: false, error: queued.error, summary: getSceneSummary(stateRef.current) };
      }
      next = queued.state;
    }
    if (stateRef.current.queue.length === 0) rememberReplayOrigin(stateRef.current);
    stateRef.current = next;
    setScene(next);
    const text = `Agent generated ${actions.length} new action${actions.length === 1 ? "" : "s"}.`;
    setNotice(text);
    setActivity((items) => [{ id: Date.now(), source: "Agent" as const, text }, ...items].slice(0, 7));
    setAgentReasoning({ status: "queued", text: summary, actionCount: actions.length });
    return { ok: true, result: { added: actions.length }, summary: getSceneSummary(next) };
  };
  const addSound = (action: StageAction) => {
    if (!isSoundAction(action)) return;
    const actorId = stateRef.current.actors.find((actor) => actor.visible)?.id ?? stateRef.current.actors[0]?.id;
    if (!actorId) { setNotice("Add a character before adding a sound effect."); return; }
    direct({ actorId, action });
  };
  const reset = (source: Activity["source"] = "You") => {
    const command = createScene(stateRef.current, { sceneId: stateRef.current.sceneId });
    if (command.ok) rememberReplayOrigin(command.state);
    return commit(command, source);
  };
  const selectScene = (sceneId: string) => {
    const command = createScene(stateRef.current, { sceneId });
    if (command.ok) rememberReplayOrigin(command.state);
    return commit(command);
  };
  const questSuggestionStep = Math.min(Math.floor(scene.queue.length / 3), questSuggestionSteps.length - 1);
  const currentExamples = scene.sceneId === "hillside_quest" ? questSuggestionSteps[questSuggestionStep] : examples;

  const reorderQueue = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (scene.isPlaying || target < 0 || target >= stateRef.current.queue.length) return;
    const queue = stateRef.current.queue.map((beat) => ({ ...beat, status: "queued" as const }));
    [queue[index], queue[target]] = [queue[target], queue[index]];
    const next = { ...stateRef.current, queue };
    stateRef.current = next;
    setScene(next);
    setNotice(`Moved beat ${index + 1} ${offset < 0 ? "up" : "down"}.`);
  };

  const attachSound = (index: number, soundEffect: string) => {
    if (scene.isPlaying || !stateRef.current.queue[index]) return;
    const queue = stateRef.current.queue.map((beat, beatIndex) => beatIndex === index
      ? { ...beat, soundEffect: soundEffect ? soundEffect as (typeof SOUND_ACTIONS)[number] : undefined }
      : { ...beat });
    const next = { ...stateRef.current, queue };
    stateRef.current = next;
    setScene(next);
    setNotice(soundEffect ? `Attached ${soundEffect.replace("_", " ")} to beat ${index + 1}.` : `Removed the sound from beat ${index + 1}.`);
  };

  const saveQueue = () => {
    if (!stateRef.current.queue.length) { setNotice("Add at least one action before saving."); return; }
    try {
      const beats = stateRef.current.queue.map(({ actorId, action, targetId, zone, dialogue, soundEffect }) => ({ actorId, action, targetId, zone, dialogue, soundEffect }));
      localStorage.setItem(SAVED_QUEUE_KEY, JSON.stringify({ sceneId: stateRef.current.sceneId, beats }));
      setNotice(`Saved ${beats.length} action${beats.length === 1 ? "" : "s"} in this browser.`);
    } catch { setNotice("This browser could not save the queue."); }
  };

  const loadQueue = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_QUEUE_KEY) ?? "null") as { sceneId?: string; beats?: Array<Record<string, unknown>> } | null;
      if (!saved?.beats?.length || (saved.sceneId !== "neon_alley" && saved.sceneId !== "hillside_quest")) { setNotice("No saved action queue was found in this browser."); return; }
      const fresh = createScene(stateRef.current, { sceneId: saved.sceneId });
      if (!fresh.ok) { setNotice(fresh.error); return; }
      let next = fresh.state;
      for (const beat of saved.beats) {
        const queued = queueAction(next, beat);
        if (!queued.ok) { setNotice(`The saved queue could not be loaded: ${queued.error}`); return; }
        next = queued.state;
      }
      rememberReplayOrigin(fresh.state);
      stateRef.current = next;
      setScene(next);
      setNotice(`Loaded ${next.queue.length} saved action${next.queue.length === 1 ? "" : "s"}.`);
    } catch { setNotice("The saved queue is damaged or unavailable."); }
  };

  const closeTutorial = () => {
    try { localStorage.setItem(TUTORIAL_SEEN_KEY, "done"); } catch { /* Tutorial still closes when storage is unavailable. */ }
    setTutorialStep(null);
  };

  useEffect(() => {
    if (tutorialStep === null) return;
    const timer = window.setTimeout(() => {
      document.querySelector(tutorialTargets[tutorialStep])?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [tutorialStep]);

  const play = async (input: Record<string, unknown> = {}, source: Activity["source"] = "You") => {
    const ids = Array.isArray(input.beatIds) ? new Set(input.beatIds.filter((id): id is string => typeof id === "string")) : null;
    if (stateRef.current.isPlaying) return { ok: false, error: "The stage is already playing.", summary: getSceneSummary(stateRef.current) };
    const beats = (ids ? stateRef.current.queue.filter((beat) => ids.has(beat.id)) : stateRef.current.queue.filter((beat) => beat.status === "queued"));
    if (!beats.length) return { ok: false, error: "Queue at least one action before playing.", summary: getSceneSummary(stateRef.current) };
    const plan = buildPlaybackPlan({ ...stateRef.current, queue: [] }, beats);
    const blocked = plan.beats.find((beat) => !beat.playable);
    if (blocked) return { ok: false, error: blocked.issues.find((issue) => issue.severity === "error")?.message ?? "A queued action is not playable.", summary: getSceneSummary(stateRef.current) };
    const playing = { ...stateRef.current, isPlaying: true };
    stateRef.current = playing; setScene(playing); setNotice("Curtain up — playing the action queue.");
    for (const planBeat of plan.beats) {
      const liveBeat = stateRef.current.queue.find((beat) => beat.id === planBeat.beatId);
      if (!liveBeat) continue;
      const movement = movementActions.has(planBeat.action);
      const begin = updateBeatStatus(
        stateRef.current,
        planBeat.beatId,
        "playing",
        movement ? planBeat.nextActorState : null,
        movement ? planBeat.nextPropsState : null,
      );
      stateRef.current = begin; setScene(begin); setActiveBeat({ ...liveBeat, status: "playing" });
      playQueuedSound(planBeat.action);
      if (liveBeat.soundEffect && liveBeat.soundEffect !== planBeat.action) playQueuedSound(liveBeat.soundEffect);
      await wait(movement ? planBeat.timing.durationMs / MOVEMENT_PLAYBACK_RATE : Math.min(planBeat.timing.durationMs, 1150));
      const complete = updateBeatStatus(
        stateRef.current,
        planBeat.beatId,
        "complete",
        movement ? null : planBeat.nextActorState,
        movement ? null : planBeat.nextPropsState,
      );
      stateRef.current = complete; setScene(complete);
    }
    const complete = { ...stateRef.current, isPlaying: false };
    stateRef.current = complete; setScene(complete); setActiveBeat(null);
    const text = "Scene played. Your turn to co-direct the next beat.";
    setNotice(text); setActivity((items) => [{ id: Date.now(), source, text }, ...items].slice(0, 7));
    if (liveStoryRef.current && complete.queue.some((beat) => beat.status === "queued")) window.setTimeout(() => void play({}, "You"), 100);
    return { ok: true, completedBeatIds: plan.beats.map((beat) => beat.beatId), summary: getSceneSummary(complete) };
  };

  const replayFrom = async (startIndex: number) => {
    const queue = stateRef.current.queue.map((beat, index) => ({ ...beat, status: index < startIndex ? "complete" as const : "queued" as const }));
    if (!queue[startIndex] || stateRef.current.isPlaying) return;

    const rebuilt: SceneState = {
      ...replayOriginRef.current,
      actors: replayOriginRef.current.actors.map((actor) => ({ ...actor })),
      props: replayOriginRef.current.props.map((prop) => ({ ...prop })),
      queue,
      isPlaying: false,
    };
    const preRoll = buildPlaybackPlan({ ...rebuilt, queue: [] }, queue.slice(0, startIndex));
    const blocked = preRoll.beats.find((beat) => !beat.playable);
    if (blocked) {
      setNotice(blocked.issues.find((issue) => issue.severity === "error")?.message ?? "That replay point could not be prepared.");
      return;
    }
    for (const beat of preRoll.beats) {
      if (beat.nextActorState) rebuilt.actors = rebuilt.actors.map((actor) => actor.id === beat.nextActorState?.id ? { ...beat.nextActorState } : actor);
      if (beat.nextPropsState) rebuilt.props = beat.nextPropsState.map((prop) => ({ ...prop }));
    }
    stateRef.current = rebuilt;
    setScene(rebuilt);
    setNotice(`Replaying from beat ${startIndex + 1}.`);
    await play({ beatIds: queue.slice(startIndex).map((beat) => beat.id) });
  };

  useEffect(() => {
    if (toolRegistered.current) return;
    toolRegistered.current = true;
    setAgentReady(registerStoryStageTools({
      getSceneState: () => getSceneSummary(stateRef.current),
      beginReasoning: beginAgentReasoning,
      planActions: queueAgentPlan,
      createCharacter: (input) => commit(createCharacter(stateRef.current, input), "Agent"),
      createScene: (input) => {
        const command = createScene(stateRef.current, input);
        if (command.ok) rememberReplayOrigin(command.state);
        return commit(command, "Agent");
      },
      placeActor: (input) => commit(placeActor(stateRef.current, input), "Agent"),
      directAction: (input) => direct(input, "Agent"),
      setExpression: (input) => commit(setExpression(stateRef.current, input), "Agent"),
      playScene: (input) => play(input, "Agent"),
    }));
    // Tool registration must occur exactly once; handlers read the latest scene via stateRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!agentControl) return;
    let active = true;
    let cursor = 0;
    const controller = new AbortController();
    let lastPublishedScene = "";
    const publishIfChanged = async () => {
      const summary = getSceneSummary(stateRef.current);
      const serialized = JSON.stringify(summary);
      if (serialized === lastPublishedScene) return;
      await publishScene(summary);
      lastPublishedScene = serialized;
    };
    const executeCommand = async (command: AgentBridgeCommand) => {
      switch (command.name) {
        case "begin_reasoning": return beginAgentReasoning(command.arguments);
        case "plan_actions": return queueAgentPlan(command.arguments);
        case "create_scene": {
          const sceneCommand = createScene(stateRef.current, command.arguments);
          if (sceneCommand.ok) rememberReplayOrigin(sceneCommand.state);
          return commit(sceneCommand, "Agent");
        }
        case "create_character": return commit(createCharacter(stateRef.current, command.arguments), "Agent");
        case "place_actor": return commit(placeActor(stateRef.current, command.arguments), "Agent");
        case "direct_action": return direct(command.arguments, "Agent");
        case "set_expression": return commit(setExpression(stateRef.current, command.arguments), "Agent");
        case "play_scene": return play(command.arguments, "Agent");
      }
    };
    const sync = async () => {
      while (active) {
        try {
          await publishIfChanged();
          const { commands } = await getBridgeCommands(cursor, controller.signal);
          if (!active) return;
          setBridgeStatus("ready");
          // Older bridge processes return immediately instead of holding the request.
          // Back off so a hot-reloaded client can never spin while Codex restarts the bridge.
          if (!commands.length) await wait(500);
          for (const command of commands) {
            const result = await executeCommand(command);
            await completeBridgeCommand(command.id, result);
            cursor = command.sequence;
            await publishIfChanged();
          }
        } catch (error) {
          if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
          setBridgeStatus("unavailable");
          await wait(1500);
        }
      }
    };
    void sync();
    return () => { active = false; controller.abort(); };
  // The bridge's handlers intentionally read the mutable live SceneState, avoiding a reconnect after every animation frame.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentControl, bridgeRetry]);

  const addDirection = (direction: string, source: Activity["source"] = "You") => {
    const parsed = parseDirectionForScene(direction, stateRef.current);
    let next = stateRef.current;
    let added = 0;
    if (stateRef.current.queue.length === 0 && parsed.beats.length > 0) rememberReplayOrigin(stateRef.current);
    for (const beat of parsed.beats) {
      const result = queueAction(next, beat);
      if (result.ok) { next = result.state; added += 1; }
    }
    if (added) { stateRef.current = next; setScene(next); const text = `Added ${added} ${added === 1 ? "beat" : "beats"} from your direction.`; setNotice(text); setActivity((items) => ([{ id: Date.now(), source, text }, ...items].slice(0, 7))); }
    else setNotice(parsed.warnings[0]?.message ?? "Try one of the example directions.");
    if (parsed.warnings.length) setNotice(`${added ? `Added ${added} beat${added === 1 ? "" : "s"}. ` : ""}${parsed.warnings[0].message}`);
    return added;
  };

  const addParsedDirections = () => addDirection(prompt);

  const bestSpeechAlternative = (result: SpeechResult) => {
    const vocabulary = [
      ...stateRef.current.actors.flatMap((actor) => [actor.id, actor.name]),
      ...stateRef.current.props.map((prop) => prop.id),
      ...STAGE_ACTIONS,
    ].map((term) => term.toLowerCase());
    return Array.from(result).reduce<{ transcript: string; score: number }>((best, candidate) => {
      const transcript = candidate.transcript.trim();
      const parsed = parseDirectionForScene(transcript, stateRef.current);
      const lower = transcript.toLowerCase();
      const exactSceneTerms = vocabulary.filter((term) => lower.includes(term)).length;
      const errors = parsed.warnings.filter((warning) => warning.severity === "error").length;
      const score = parsed.beats.length * 12 + exactSceneTerms * 3 - errors * 8 + (candidate.confidence ?? 0);
      return score > best.score ? { transcript, score } : best;
    }, { transcript: result[0]?.transcript?.trim() ?? "", score: Number.NEGATIVE_INFINITY }).transcript;
  };

  const listen = () => {
    if (listening) { recognitionRef.current?.stop(); return; }
    const Recognition = (window as unknown as { SpeechRecognition?: SpeechFactory; webkitSpeechRecognition?: SpeechFactory }).SpeechRecognition ?? (window as unknown as { SpeechRecognition?: SpeechFactory; webkitSpeechRecognition?: SpeechFactory }).webkitSpeechRecognition;
    if (!Recognition) { setNotice("Voice direction is not available in this browser. Typed direction still works."); return; }
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let spoken = "";
      let completed = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = bestSpeechAlternative(result);
        spoken += text;
        if (result.isFinal) completed += text;
      }
      if (spoken) setPrompt(spoken.trim());
      if (completed.trim() && liveStory) {
        const added = addDirection(completed.trim(), "You");
        if (added && !stateRef.current.isPlaying) window.setTimeout(() => void play(), 120);
      }
    };
    recognition.onend = () => { recognitionRef.current = null; setListening(false); };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setListening(false);
      const reason = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone access was blocked. Allow microphone access in the browser, then try again."
        : event.error === "audio-capture"
          ? "No working microphone was found. Check your input device, then try again."
          : event.error === "network"
            ? "The browser speech service could not be reached. Check the connection and try again."
            : `Voice input stopped${event.error ? ` (${event.error})` : ""}. Try again.`;
      setNotice(reason);
    };
    setListening(true);
    recognition.start();
  };

  return <main className={`app-shell ${tutorialStep === null ? "" : `tutorial-active tutorial-step-${tutorialStep}`}`}>
    <header className="topbar"><div><p className="eyebrow">A SHARED ANIMATED STAGE</p><h1>Direct a tiny live theater.</h1></div><div className="topbar-actions"><button className="tutorial-launch" onClick={() => setTutorialStep(0)}>How to use</button><div className={`agent-badge ${agentReady || bridgeStatus === "ready" ? "ready" : ""}`}><span />{bridgeStatus === "ready" ? "Chat agent connected" : agentReady ? "Browser agent-ready" : "Human direction mode"}</div></div></header>
    <p className="intro">Type a stage direction, then watch Fenn and Nix bring it to life. In a WebMCP browser, your agent can co-direct the same scene.</p>
    <div className="workspace"><Stage scene={scene} activeBeat={activeBeat} />
      <aside className="control-panel"><section><div className="section-title"><span>01</span><h2>Cast & scene</h2></div><label className="scene-picker">Choose a scene<select value={scene.sceneId} onChange={(event) => selectScene(event.target.value)}><option value="neon_alley">Neon alley mystery</option><option value="hillside_quest">Hillside knight quest</option></select></label><div className="cast-list">{scene.actors.map((actor) => <div className="cast-card" key={actor.id}><div className={`avatar ${actor.preset === "robot" ? "avatar-robot" : actor.preset === "knight" ? "avatar-knight" : actor.preset === "dragon" ? "avatar-dragon" : "avatar-fox"}`}>{actor.preset === "robot" ? "◈" : actor.preset === "knight" ? "♜" : actor.preset === "dragon" ? "♛" : "▲"}</div><div><b>{actor.name}</b><small>{actor.visible ? actor.zone.replace("_", " ") : "offstage"}</small></div><select aria-label={`${actor.name} expression`} value={actor.expression} onChange={(event) => commit(setExpression(stateRef.current, { actorId: actor.id, expression: event.target.value }))}>{STAGE_EXPRESSIONS.map((expression) => <option key={expression}>{expression}</option>)}</select></div>)}</div><div className="placement-row">{scene.actors.map((actor) => <label key={actor.id}>{actor.name.split(" ").at(-1)}<select value={actor.zone} onChange={(event) => commit(placeActor(stateRef.current, { actorId: actor.id, zone: event.target.value }))}>{STAGE_ZONES.map((zone) => <option key={zone}>{zone}</option>)}</select></label>)}</div><button className="text-button" onClick={() => reset()}>↻ Reset this scene</button></section>
      <section><div className="section-title"><span>02</span><h2>Action queue <em>{scene.queue.filter((beat) => beat.status === "queued").length}</em></h2></div><div className="queue">{scene.queue.length ? scene.queue.map((beat, index) => <div className={`queue-item ${beat.status}`} key={beat.id}><span>{String(index + 1).padStart(2, "0")}</span><b>{scene.actors.find((actor) => actor.id === beat.actorId)?.name ?? beat.actorId}</b><i>→</i><strong>{beat.action}{beat.targetId ? ` · ${beat.targetId}` : beat.zone ? ` · ${beat.zone}` : ""}<label className="beat-sound">Sound<select aria-label={`Sound for beat ${index + 1}`} disabled={scene.isPlaying} value={beat.soundEffect ?? ""} onChange={(event) => attachSound(index, event.target.value)}><option value="">None</option>{SOUND_ACTIONS.map((sound) => <option key={sound} value={sound}>{soundLabels[sound].replace(/^\S+\s/, "")}</option>)}</select></label></strong><div className="queue-tools"><span className="queue-reorder"><button disabled={scene.isPlaying || index === 0} onClick={() => reorderQueue(index, -1)} aria-label={`Move beat ${index + 1} up`}>↑</button><button disabled={scene.isPlaying || index === scene.queue.length - 1} onClick={() => reorderQueue(index, 1)} aria-label={`Move beat ${index + 1} down`}>↓</button></span><button className="replay-beat" disabled={scene.isPlaying} onClick={() => void replayFrom(index)} aria-label={`Replay from beat ${index + 1}: ${beat.action}`} title="Replay from here">↻</button></div></div>) : <p className="empty">Your directions will appear here for review.</p>}</div><div className="queue-storage"><button className="secondary" disabled={!scene.queue.length || scene.isPlaying} onClick={saveQueue}>Save</button><button className="secondary" disabled={scene.isPlaying} onClick={loadQueue}>Load</button></div><div className="queue-actions"><button className="secondary" disabled={!scene.queue.length || scene.isPlaying} onClick={() => { rememberReplayOrigin(stateRef.current); commit(clearQueue(stateRef.current)); }}>Clear</button><button className="primary" disabled={!scene.queue.length || scene.isPlaying} onClick={() => void play()}>{scene.isPlaying ? "Playing…" : "▶ Play scene"}</button></div></section></aside>
    </div>
    <section className="sound-palette" aria-labelledby="sound-effects-title"><header><b id="sound-effects-title">Sound effects</b><small>Add sounds directly to the action queue</small></header><div className="sound-buttons">{SOUND_ACTIONS.map((action) => <button key={action} disabled={scene.isPlaying} onClick={() => addSound(action)}>{soundLabels[action]}</button>)}</div></section>
<section className="director"><div className="section-title"><span>03</span><h2>Direct the scene</h2></div><div className="examples">{currentExamples.map((example) => <button key={example} onClick={() => setPrompt(example)}>{example}</button>)}</div><div className="prompt-row"><textarea aria-label="Stage direction" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={scene.sceneId === "hillside_quest" ? "Sir Arthur rides to the castle, holds the sword, then shoots at Ember." : "Nix enters from the right, walks to the crate, gasps, and hides."} /><button className={`mic ${listening ? "listening" : ""}`} onClick={listen} aria-label={listening ? "Stop listening" : "Speak a stage direction"}>{listening ? "■" : "◉"}</button><button className="primary direct-button" onClick={addParsedDirections}>Add to queue <span>→</span></button></div><label className="live-story"><input type="checkbox" checked={liveStory} onChange={(event) => { liveStoryRef.current = event.target.checked; setLiveStory(event.target.checked); }} /> Live story mode <small>Completed spoken sentences are visualized automatically.</small></label><p className="notice" role="status">{notice}</p></section>
    <section className="agent-control">
      <div className="section-title"><span>04</span><h2>Agent Control</h2><em className={`bridge-status ${bridgeStatus === "off" && agentReady ? "ready" : bridgeStatus}`}>{bridgeStatus === "ready" ? "External harness connected" : bridgeStatus === "connecting" ? "Connecting…" : bridgeStatus === "unavailable" ? "Local bridge not running" : agentReady ? "Browser agent-ready" : "External harness off"}</em></div>
      <p>{agentReady ? "This browser already exposes the scene to its built-in agent through WebMCP. The local bridge is optional." : "Connect an external Codex, OpenCode, or Pi harness so it can inspect, queue, and play this visible scene."}</p>
      <div className={`agent-reasoning ${agentReasoning.status}`} role="status" aria-live="polite">
        <span className="reasoning-loop" aria-hidden="true">↻</span>
        <div><b>Agent reasoning</b><small>{agentReasoning.text}</small></div>
        {agentReasoning.status === "queued" && <em>{agentReasoning.actionCount} queued</em>}
      </div>
      <label className="agent-toggle"><input type="checkbox" checked={agentControl} onChange={(event) => { setAgentControl(event.target.checked); setBridgeStatus(event.target.checked ? "connecting" : "off"); }} /> Connect external harness</label>
      {agentControl && bridgeStatus === "unavailable" && <div className="bridge-help"><small>Start the configured stdio MCP bridge in your agent harness, then retry. {agentReady && "The browser’s built-in agent remains available."}</small><button className="secondary" onClick={() => { setBridgeStatus("connecting"); setBridgeRetry((retry) => retry + 1); }}>Retry connection</button></div>}
      {agentControl && bridgeStatus !== "unavailable" && <small>Configure your harness to start the bridge, then ask it to call <code>get_scene_state</code>. This page applies every action and shows it in the activity log.</small>}
      <code className="bridge-command">STDIO command: node C:/path/to/vistell/server/agent-bridge.mjs</code>
    </section>
    <section className="activity"><div className="section-title"><span>LIVE</span><h2>Stage activity</h2></div>{activity.map((item) => <p key={item.id}><b className={item.source.toLowerCase()}>{item.source}</b>{item.text}</p>)}</section>
    <footer className="app-footer">Supported directions: {STAGE_ACTIONS.join(" · ")}</footer>
    {tutorialStep !== null && <div className="tutorial-backdrop" role="presentation"><section className="tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="tutorial-title"><button className="tutorial-close" onClick={closeTutorial} aria-label="Close tutorial">×</button><p className="tutorial-count">Step {tutorialStep + 1} of {tutorialSteps.length}</p><h2 id="tutorial-title">{tutorialSteps[tutorialStep].title}</h2><p>{tutorialSteps[tutorialStep].body}</p>{tutorialSteps[tutorialStep].code && <><code>{tutorialSteps[tutorialStep].code}</code><small>Codex: add it as a local MCP server. OpenCode: place it in your MCP configuration. Pi: register it through your MCP extension or configuration. All three use the same stdio command.</small></>}<div className="tutorial-progress" aria-hidden="true">{tutorialSteps.map((_, index) => <i className={index === tutorialStep ? "active" : ""} key={index} />)}</div><div className="tutorial-actions"><button className="secondary" disabled={tutorialStep === 0} onClick={() => setTutorialStep((step) => step === null ? 0 : Math.max(0, step - 1))}>Back</button>{tutorialStep < tutorialSteps.length - 1 ? <button className="primary" onClick={() => setTutorialStep((step) => step === null ? 0 : step + 1)}>Next</button> : <button className="primary" onClick={closeTutorial}>Start directing</button>}</div></section></div>}
  </main>;
}
