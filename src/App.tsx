import { useEffect, useRef, useState } from "react";
import Stage from "./Stage";
import { parseDirectionForScene } from "./parser";
import { buildPlaybackPlan, STAGE_ACTIONS, STAGE_EXPRESSIONS, STAGE_ZONES, type SceneState } from "./playback";
import { clearQueue, createCharacter, createInitialScene, createScene, getSceneSummary, placeActor, queueAction, setExpression, updateBeatStatus, type SceneCommand } from "./scene";
import { registerStoryStageTools } from "./webmcp";
import "./ui.css";

type Activity = { id: number; text: string; source: "You" | "Agent" | "Stage" };
const examples = ["Nix enters from the right, walks to the crate, gasps, and hides.", "Fenn points at the clue and says ‘I found it!’", "Fenn laughs, then Nix exits right."];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  const [scene, setScene] = useState<SceneState>(createInitialScene);
  const [prompt, setPrompt] = useState(examples[0]);
  const [notice, setNotice] = useState("The neon alley is ready. Direct the next beat.");
  const [activity, setActivity] = useState<Activity[]>([{ id: 0, source: "Stage", text: "Demo scene initialized: Fenn is watching the clue." }]);
  const [activeBeat, setActiveBeat] = useState<SceneState["queue"][number] | null>(null);
  const [agentReady, setAgentReady] = useState(false);
  const [listening, setListening] = useState(false);
  const stateRef = useRef(scene);
  const toolRegistered = useRef(false);

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
  const reset = (source: Activity["source"] = "You") => commit(createScene(stateRef.current, { sceneId: "neon_alley" }), source);

  const play = async (input: Record<string, unknown> = {}, source: Activity["source"] = "You") => {
    const ids = Array.isArray(input.beatIds) ? new Set(input.beatIds.filter((id): id is string => typeof id === "string")) : null;
    const beats = ids ? stateRef.current.queue.filter((beat) => ids.has(beat.id)) : stateRef.current.queue;
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

  const addParsedDirections = () => {
    const parsed = parseDirectionForScene(prompt, stateRef.current);
    let next = stateRef.current;
    let added = 0;
    for (const beat of parsed.beats) {
      const result = queueAction(next, beat);
      if (result.ok) { next = result.state; added += 1; }
    }
    if (added) { stateRef.current = next; setScene(next); const text = `Added ${added} ${added === 1 ? "beat" : "beats"} from your direction.`; setNotice(text); setActivity((items) => ([{ id: Date.now(), source: "You", text } as Activity, ...items].slice(0, 7))); }
    else setNotice(parsed.warnings[0]?.message ?? "Try one of the example directions.");
    if (parsed.warnings.length) setNotice(`${added ? `Added ${added} beat${added === 1 ? "" : "s"}. ` : ""}${parsed.warnings[0].message}`);
  };

  const listen = () => {
    const Recognition = (window as unknown as { SpeechRecognition?: new () => { lang: string; start(): void; stop(): void; onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void } }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => { lang: string; start(): void; stop(): void; onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void } }).webkitSpeechRecognition;
    if (!Recognition) { setNotice("Voice direction is not available in this browser. Typed direction still works."); return; }
    const recognition = new Recognition(); recognition.lang = "en-US"; recognition.onresult = (event) => setPrompt(event.results[0][0].transcript); recognition.onend = () => setListening(false); recognition.onerror = () => { setListening(false); setNotice("Voice input was unavailable. Try typing your direction."); }; setListening(true); recognition.start();
  };

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">A SHARED ANIMATED STAGE</p><h1>Direct a tiny live theater.</h1></div><div className={`agent-badge ${agentReady ? "ready" : ""}`}><span />{agentReady ? "Agent-ready" : "Human direction mode"}</div></header>
    <p className="intro">Type a stage direction, then watch Fenn and Nix bring it to life. In a WebMCP browser, your agent can co-direct the same scene.</p>
    <div className="workspace"><Stage scene={scene} activeBeat={activeBeat} />
      <aside className="control-panel"><section><div className="section-title"><span>01</span><h2>Cast & scene</h2></div><div className="cast-list">{scene.actors.map((actor) => <div className="cast-card" key={actor.id}><div className={`avatar ${actor.preset === "robot" ? "avatar-robot" : "avatar-fox"}`}>{actor.preset === "robot" ? "◈" : "▲"}</div><div><b>{actor.name}</b><small>{actor.visible ? actor.zone.replace("_", " ") : "offstage"}</small></div><select aria-label={`${actor.name} expression`} value={actor.expression} onChange={(event) => commit(setExpression(stateRef.current, { actorId: actor.id, expression: event.target.value }))}>{STAGE_EXPRESSIONS.map((expression) => <option key={expression}>{expression}</option>)}</select></div>)}</div><div className="placement-row">{scene.actors.map((actor) => <label key={actor.id}>{actor.name.split(" ").at(-1)}<select value={actor.zone} onChange={(event) => commit(placeActor(stateRef.current, { actorId: actor.id, zone: event.target.value }))}>{STAGE_ZONES.map((zone) => <option key={zone}>{zone}</option>)}</select></label>)}</div><button className="text-button" onClick={() => reset()}>↻ Reset demo scene</button></section>
      <section><div className="section-title"><span>02</span><h2>Action queue <em>{scene.queue.filter((beat) => beat.status === "queued").length}</em></h2></div><div className="queue">{scene.queue.length ? scene.queue.map((beat, index) => <div className={`queue-item ${beat.status}`} key={beat.id}><span>{String(index + 1).padStart(2, "0")}</span><b>{scene.actors.find((actor) => actor.id === beat.actorId)?.name ?? beat.actorId}</b><i>→</i><strong>{beat.action}{beat.targetId ? ` · ${beat.targetId}` : beat.zone ? ` · ${beat.zone}` : ""}</strong></div>) : <p className="empty">Your directions will appear here for review.</p>}</div><div className="queue-actions"><button className="secondary" disabled={!scene.queue.length || scene.isPlaying} onClick={() => commit(clearQueue(stateRef.current))}>Clear</button><button className="primary" disabled={!scene.queue.length || scene.isPlaying} onClick={() => void play()}>{scene.isPlaying ? "Playing…" : "▶ Play scene"}</button></div></section></aside>
    </div>
    <section className="director"><div className="section-title"><span>03</span><h2>Direct the scene</h2></div><div className="examples">{examples.map((example) => <button key={example} onClick={() => setPrompt(example)}>{example}</button>)}</div><div className="prompt-row"><textarea aria-label="Stage direction" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Nix enters from the right, walks to the crate, gasps, and hides." /><button className={`mic ${listening ? "listening" : ""}`} onClick={listen} aria-label="Speak a stage direction">{listening ? "●" : "◉"}</button><button className="primary direct-button" onClick={addParsedDirections}>Add to queue <span>→</span></button></div><p className="notice" role="status">{notice}</p></section>
    <section className="activity"><div className="section-title"><span>LIVE</span><h2>Stage activity</h2></div>{activity.map((item) => <p key={item.id}><b className={item.source.toLowerCase()}>{item.source}</b>{item.text}</p>)}</section>
    <footer className="app-footer">Supported directions: {STAGE_ACTIONS.join(" · ")}</footer>
  </main>;
}
