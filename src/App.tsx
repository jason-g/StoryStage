import { useEffect, useRef, useState } from "react";
import Stage from "./Stage";
import { parseDirectionForScene } from "./parser";
import { buildPlaybackPlan, STAGE_ACTIONS, STAGE_EXPRESSIONS, STAGE_ZONES, type SceneState } from "./playback";
import { clearQueue, createCharacter, createHillsideQuestScene, createScene, getSceneSummary, placeActor, queueAction, setExpression, updateBeatStatus, type SceneCommand } from "./scene";
import { registerStoryStageTools } from "./webmcp";
import { completeBridgeCommand, getBridgeCommands, publishScene, type AgentBridgeCommand } from "./agentBridge";
import "./ui.css";
import "./scene-ui.css";
import "./voice.css";
import "./replay.css";

type Activity = { id: number; text: string; source: "You" | "Agent" | "Stage" };
type SpeechAlternative = { transcript: string; confidence?: number };
type SpeechResult = ArrayLike<SpeechAlternative> & { isFinal: boolean };
type SpeechSession = { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives?: number; phrases?: unknown[]; start(): void; stop(): void; onresult: (event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void; onend: () => void; onerror: () => void };
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

export default function App() {
  const [scene, setScene] = useState<SceneState>(createHillsideQuestScene);
  const [prompt, setPrompt] = useState(questSuggestionSteps[0][0]);
  const [notice, setNotice] = useState("The hillside quest is ready. Direct the next beat.");
  const [activity, setActivity] = useState<Activity[]>([{ id: 0, source: "Stage", text: "Sir Arthur waits at the castle with sword and bow while Ember circles at the top right." }]);
  const [activeBeat, setActiveBeat] = useState<SceneState["queue"][number] | null>(null);
  const [agentReady, setAgentReady] = useState(false);
  const [agentControl, setAgentControl] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<"off" | "connecting" | "ready" | "unavailable">("off");
  const [listening, setListening] = useState(false);
  const [liveStory, setLiveStory] = useState(true);
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

    let rebuilt: SceneState = {
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
  }, [agentControl]);

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
    recognition.maxAlternatives = 5;
    const Phrase = (window as unknown as { SpeechRecognitionPhrase?: new (phrase: string, boost: number) => unknown }).SpeechRecognitionPhrase;
    if (Phrase && "phrases" in recognition) {
      recognition.phrases = [
        ...stateRef.current.actors.flatMap((actor) => [actor.name, actor.id]),
        ...stateRef.current.props.map((prop) => prop.id),
        ...STAGE_ACTIONS,
      ].map((phrase) => new Phrase(phrase, 7));
    }
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
    recognition.onerror = () => { recognitionRef.current = null; setListening(false); setNotice("Voice input was unavailable. Try typing your direction."); };
    setListening(true);
    recognition.start();
  };

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">A SHARED ANIMATED STAGE</p><h1>Direct a tiny live theater.</h1></div><div className={`agent-badge ${agentReady || bridgeStatus === "ready" ? "ready" : ""}`}><span />{bridgeStatus === "ready" ? "Chat agent connected" : agentReady ? "Browser agent-ready" : "Human direction mode"}</div></header>
    <p className="intro">Type a stage direction, then watch Fenn and Nix bring it to life. In a WebMCP browser, your agent can co-direct the same scene.</p>
    <div className="workspace"><Stage scene={scene} activeBeat={activeBeat} />
      <aside className="control-panel"><section><div className="section-title"><span>01</span><h2>Cast & scene</h2></div><label className="scene-picker">Choose a scene<select value={scene.sceneId} onChange={(event) => selectScene(event.target.value)}><option value="neon_alley">Neon alley mystery</option><option value="hillside_quest">Hillside knight quest</option></select></label><div className="cast-list">{scene.actors.map((actor) => <div className="cast-card" key={actor.id}><div className={`avatar ${actor.preset === "robot" ? "avatar-robot" : actor.preset === "knight" ? "avatar-knight" : actor.preset === "dragon" ? "avatar-dragon" : "avatar-fox"}`}>{actor.preset === "robot" ? "◈" : actor.preset === "knight" ? "♜" : actor.preset === "dragon" ? "♛" : "▲"}</div><div><b>{actor.name}</b><small>{actor.visible ? actor.zone.replace("_", " ") : "offstage"}</small></div><select aria-label={`${actor.name} expression`} value={actor.expression} onChange={(event) => commit(setExpression(stateRef.current, { actorId: actor.id, expression: event.target.value }))}>{STAGE_EXPRESSIONS.map((expression) => <option key={expression}>{expression}</option>)}</select></div>)}</div><div className="placement-row">{scene.actors.map((actor) => <label key={actor.id}>{actor.name.split(" ").at(-1)}<select value={actor.zone} onChange={(event) => commit(placeActor(stateRef.current, { actorId: actor.id, zone: event.target.value }))}>{STAGE_ZONES.map((zone) => <option key={zone}>{zone}</option>)}</select></label>)}</div><button className="text-button" onClick={() => reset()}>↻ Reset this scene</button></section>
      <section><div className="section-title"><span>02</span><h2>Action queue <em>{scene.queue.filter((beat) => beat.status === "queued").length}</em></h2></div><div className="queue">{scene.queue.length ? scene.queue.map((beat, index) => <div className={`queue-item ${beat.status}`} key={beat.id}><span>{String(index + 1).padStart(2, "0")}</span><b>{scene.actors.find((actor) => actor.id === beat.actorId)?.name ?? beat.actorId}</b><i>→</i><strong>{beat.action}{beat.targetId ? ` · ${beat.targetId}` : beat.zone ? ` · ${beat.zone}` : ""}</strong><button className="replay-beat" disabled={scene.isPlaying} onClick={() => void replayFrom(index)} aria-label={`Replay from beat ${index + 1}: ${beat.action}`} title="Replay from here">↻</button></div>) : <p className="empty">Your directions will appear here for review.</p>}</div><div className="queue-actions"><button className="secondary" disabled={!scene.queue.length || scene.isPlaying} onClick={() => { rememberReplayOrigin(stateRef.current); commit(clearQueue(stateRef.current)); }}>Clear</button><button className="primary" disabled={!scene.queue.length || scene.isPlaying} onClick={() => void play()}>{scene.isPlaying ? "Playing…" : "▶ Play scene"}</button></div></section></aside>
    </div>
<section className="director"><div className="section-title"><span>03</span><h2>Direct the scene</h2></div><div className="examples">{currentExamples.map((example) => <button key={example} onClick={() => setPrompt(example)}>{example}</button>)}</div><div className="prompt-row"><textarea aria-label="Stage direction" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={scene.sceneId === "hillside_quest" ? "Sir Arthur rides to the castle, holds the sword, then shoots at Ember." : "Nix enters from the right, walks to the crate, gasps, and hides."} /><button className={`mic ${listening ? "listening" : ""}`} onClick={listen} aria-label={listening ? "Stop listening" : "Speak a stage direction"}>{listening ? "■" : "◉"}</button><button className="primary direct-button" onClick={addParsedDirections}>Add to queue <span>→</span></button></div><label className="live-story"><input type="checkbox" checked={liveStory} onChange={(event) => { liveStoryRef.current = event.target.checked; setLiveStory(event.target.checked); }} /> Live story mode <small>Completed spoken sentences are visualized automatically.</small></label><p className="notice" role="status">{notice}</p></section>
    <section className="agent-control"><div className="section-title"><span>04</span><h2>Agent Control</h2><em className={`bridge-status ${bridgeStatus}`}>{bridgeStatus === "ready" ? "Connected" : bridgeStatus === "connecting" ? "Connecting…" : bridgeStatus === "unavailable" ? "Bridge unavailable" : "Off"}</em></div><p>Allow a local Codex chat to inspect, queue, and play this visible scene through MCP.</p><label className="agent-toggle"><input type="checkbox" checked={agentControl} onChange={(event) => { setAgentControl(event.target.checked); setBridgeStatus(event.target.checked ? "connecting" : "off"); }} /> Enable local Agent Control</label>{agentControl && <small>Configure Codex to start the bridge, then ask it to call <code>get_scene_state</code>. This page applies every action and shows it in the activity log.</small>}<code className="bridge-command">Codex STDIO: node server/agent-bridge.mjs</code></section>
    <section className="activity"><div className="section-title"><span>LIVE</span><h2>Stage activity</h2></div>{activity.map((item) => <p key={item.id}><b className={item.source.toLowerCase()}>{item.source}</b>{item.text}</p>)}</section>
    <footer className="app-footer">Supported directions: {STAGE_ACTIONS.join(" · ")}</footer>
  </main>;
}
