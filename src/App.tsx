import { useEffect, useRef, useState } from "react";
import Stage from "./Stage";
import { parseDirectionForScene } from "./parser";
import { buildPlaybackPlan, STAGE_ACTIONS, STAGE_EXPRESSIONS, STAGE_ZONES, type SceneState } from "./playback";
import { clearQueue, createCharacter, createInitialScene, createScene, getSceneSummary, placeActor, queueAction, setExpression, updateBeatStatus, type SceneCommand } from "./scene";
import { registerStoryStageTools } from "./webmcp";
import "./ui.css";
import "./scene-ui.css";
import "./voice.css";

type Activity = { id: number; text: string; source: "You" | "Agent" | "Stage" };
type SpeechResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type SpeechSession = { lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void; onresult: (event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void; onend: () => void; onerror: () => void };
type SpeechFactory = new () => SpeechSession;
const examples = ["Nix enters from the right, walks to the crate, gasps, and hides.", "Fenn points at the clue and says ‘I found it!’", "Fenn laughs, then Nix exits right."];
const questExamples = ["Sir Aria rides the horse from the castle towards the right, while Ember flies in from the top right.", "The brave knight shoots at Ember with an arrow; Ember falls to the ground.", "Out of arrows, the knight drops the bow, moves right, and attacks Ember."];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  const [scene, setScene] = useState<SceneState>(createInitialScene);
  const [prompt, setPrompt] = useState(examples[0]);
  const [notice, setNotice] = useState("The neon alley is ready. Direct the next beat.");
  const [activity, setActivity] = useState<Activity[]>([{ id: 0, source: "Stage", text: "Demo scene initialized: Fenn is watching the clue." }]);
  const [activeBeat, setActiveBeat] = useState<SceneState["queue"][number] | null>(null);
  const [agentReady, setAgentReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [liveStory, setLiveStory] = useState(true);
  const stateRef = useRef(scene);
  const toolRegistered = useRef(false);
  const recognitionRef = useRef<SpeechSession | null>(null);
  const liveStoryRef = useRef(true);

  const commit = <T,>(command: SceneCommand<T>, source: Activity["source"] = "You") => {
    if (!command.ok) { setNotice(command.error); return { ok: false, error: command.error, summary: getSceneSummary(stateRef.current) }; }
    stateRef.current = command.state;
    setScene(command.state);
    const text = command.message ?? "Stage updated.";
    setNotice(text);
    setActivity((items) => [{ id: Date.now(), source, text }, ...items].slice(0, 7));
    return { ok: true, result: command.result, summary: getSceneSummary(command.state) };
  };

  const direct = (input: Record<string, unknown>, source: Activity["source"] = "You") => commit(queueAction(stateRef.current, input), source);
  const reset = (source: Activity["source"] = "You") => commit(createScene(stateRef.current, { sceneId: stateRef.current.sceneId }), source);
  const selectScene = (sceneId: string) => commit(createScene(stateRef.current, { sceneId }));
  const currentExamples = scene.sceneId === "hillside_quest" ? questExamples : examples;

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
      const begin = updateBeatStatus(stateRef.current, planBeat.beatId, "playing");
      stateRef.current = begin; setScene(begin); setActiveBeat({ ...liveBeat, status: "playing" });
      await wait(Math.min(planBeat.timing.durationMs, 1150));
      const complete = updateBeatStatus(stateRef.current, planBeat.beatId, "complete", planBeat.nextActorState);
      stateRef.current = complete; setScene(complete);
    }
    const complete = { ...stateRef.current, isPlaying: false };
    stateRef.current = complete; setScene(complete); setActiveBeat(null);
    const text = "Scene played. Your turn to co-direct the next beat.";
    setNotice(text); setActivity((items) => [{ id: Date.now(), source, text }, ...items].slice(0, 7));
    if (liveStoryRef.current && complete.queue.some((beat) => beat.status === "queued")) window.setTimeout(() => void play({}, "You"), 100);
    return { ok: true, completedBeatIds: plan.beats.map((beat) => beat.beatId), summary: getSceneSummary(complete) };
  };

  useEffect(() => {
    if (toolRegistered.current) return;
    toolRegistered.current = true;
    setAgentReady(registerStoryStageTools({
      getSceneState: () => getSceneSummary(stateRef.current),
      createCharacter: (input) => commit(createCharacter(stateRef.current, input), "Agent"),
      createScene: (input) => commit(createScene(stateRef.current, input), "Agent"),
      placeActor: (input) => commit(placeActor(stateRef.current, input), "Agent"),
      directAction: (input) => direct(input, "Agent"),
      setExpression: (input) => commit(setExpression(stateRef.current, input), "Agent"),
      playScene: (input) => play(input, "Agent"),
    }));
    // Tool registration must occur exactly once; handlers read the latest scene via stateRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addDirection = (direction: string, source: Activity["source"] = "You") => {
    const parsed = parseDirectionForScene(direction, stateRef.current);
    let next = stateRef.current;
    let added = 0;
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
        const text = result[0]?.transcript ?? "";
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
    <header className="topbar"><div><p className="eyebrow">A SHARED ANIMATED STAGE</p><h1>Direct a tiny live theater.</h1></div><div className={`agent-badge ${agentReady ? "ready" : ""}`}><span />{agentReady ? "Agent-ready" : "Human direction mode"}</div></header>
    <p className="intro">Type a stage direction, then watch Fenn and Nix bring it to life. In a WebMCP browser, your agent can co-direct the same scene.</p>
    <div className="workspace"><Stage scene={scene} activeBeat={activeBeat} />
      <aside className="control-panel"><section><div className="section-title"><span>01</span><h2>Cast & scene</h2></div><label className="scene-picker">Choose a scene<select value={scene.sceneId} onChange={(event) => selectScene(event.target.value)}><option value="neon_alley">Neon alley mystery</option><option value="hillside_quest">Hillside knight quest</option></select></label><div className="cast-list">{scene.actors.map((actor) => <div className="cast-card" key={actor.id}><div className={`avatar ${actor.preset === "robot" ? "avatar-robot" : actor.preset === "knight" ? "avatar-knight" : actor.preset === "dragon" ? "avatar-dragon" : "avatar-fox"}`}>{actor.preset === "robot" ? "◈" : actor.preset === "knight" ? "♜" : actor.preset === "dragon" ? "♛" : "▲"}</div><div><b>{actor.name}</b><small>{actor.visible ? actor.zone.replace("_", " ") : "offstage"}</small></div><select aria-label={`${actor.name} expression`} value={actor.expression} onChange={(event) => commit(setExpression(stateRef.current, { actorId: actor.id, expression: event.target.value }))}>{STAGE_EXPRESSIONS.map((expression) => <option key={expression}>{expression}</option>)}</select></div>)}</div><div className="placement-row">{scene.actors.map((actor) => <label key={actor.id}>{actor.name.split(" ").at(-1)}<select value={actor.zone} onChange={(event) => commit(placeActor(stateRef.current, { actorId: actor.id, zone: event.target.value }))}>{STAGE_ZONES.map((zone) => <option key={zone}>{zone}</option>)}</select></label>)}</div><button className="text-button" onClick={() => reset()}>↻ Reset this scene</button></section>
      <section><div className="section-title"><span>02</span><h2>Action queue <em>{scene.queue.filter((beat) => beat.status === "queued").length}</em></h2></div><div className="queue">{scene.queue.length ? scene.queue.map((beat, index) => <div className={`queue-item ${beat.status}`} key={beat.id}><span>{String(index + 1).padStart(2, "0")}</span><b>{scene.actors.find((actor) => actor.id === beat.actorId)?.name ?? beat.actorId}</b><i>→</i><strong>{beat.action}{beat.targetId ? ` · ${beat.targetId}` : beat.zone ? ` · ${beat.zone}` : ""}</strong></div>) : <p className="empty">Your directions will appear here for review.</p>}</div><div className="queue-actions"><button className="secondary" disabled={!scene.queue.length || scene.isPlaying} onClick={() => commit(clearQueue(stateRef.current))}>Clear</button><button className="primary" disabled={!scene.queue.length || scene.isPlaying} onClick={() => void play()}>{scene.isPlaying ? "Playing…" : "▶ Play scene"}</button></div></section></aside>
    </div>
<section className="director"><div className="section-title"><span>03</span><h2>Direct the scene</h2></div><div className="examples">{currentExamples.map((example) => <button key={example} onClick={() => setPrompt(example)}>{example}</button>)}</div><div className="prompt-row"><textarea aria-label="Stage direction" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={scene.sceneId === "hillside_quest" ? "Sir Aria rides to the castle, holds the sword, then shoots at Ember." : "Nix enters from the right, walks to the crate, gasps, and hides."} /><button className={`mic ${listening ? "listening" : ""}`} onClick={listen} aria-label={listening ? "Stop listening" : "Speak a stage direction"}>{listening ? "■" : "◉"}</button><button className="primary direct-button" onClick={addParsedDirections}>Add to queue <span>→</span></button></div><label className="live-story"><input type="checkbox" checked={liveStory} onChange={(event) => { liveStoryRef.current = event.target.checked; setLiveStory(event.target.checked); }} /> Live story mode <small>Completed spoken sentences are visualized automatically.</small></label><p className="notice" role="status">{notice}</p></section>
    <section className="activity"><div className="section-title"><span>LIVE</span><h2>Stage activity</h2></div>{activity.map((item) => <p key={item.id}><b className={item.source.toLowerCase()}>{item.source}</b>{item.text}</p>)}</section>
    <footer className="app-footer">Supported directions: {STAGE_ACTIONS.join(" · ")}</footer>
  </main>;
}
