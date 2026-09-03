import type { SceneState, StageActor } from "./playback";
import "./stage.css";

type Props = { scene: SceneState; activeBeat?: SceneState["queue"][number] | null };
const positions: Record<string, React.CSSProperties> = {
  offstage_left: { left: "-8%" }, left: { left: "14%" }, lamp: { left: "28%" }, center: { left: "51%" }, crate: { left: "76%" }, right: { left: "89%" }, offstage_right: { left: "108%" },
};

function Actor({ actor, active }: { actor: StageActor; active: boolean }) {
  const robot = actor.preset === "robot";
  const face = actor.expression === "surprised" ? "◉  ◉" : actor.expression === "happy" || actor.expression === "amused" ? "⌣  ⌣" : actor.expression === "worried" ? "⌢  ⌢" : "•  •";
  return <div className={`actor ${robot ? "robot" : "fox"} ${active ? "active" : ""}`} aria-label={`${actor.name}, ${actor.expression}`}>
    {robot ? <><div className="antenna">●</div><div className="head">{face}</div><div className="body">◇</div></> : <><div className="ears">▲ ▲</div><div className="head">{face}<b>⌄</b></div><div className="body">✦</div></>}
    <div className="feet">⌄  ⌄</div>
  </div>;
}

export default function Stage({ scene, activeBeat }: Props) {
  return <section className="stage-shell" aria-label="StoryStage neon alley theater">
    <header className="marquee"><strong>STORYSTAGE</strong><span>live co-direction theater</span><i /></header>
    <div className="stage" aria-live="polite">
      <div className="rain" /><div className="moon" /><div className="city left-city" /><div className="city right-city" />
      <div className="neon">NIGHT<br /><em>OWL</em></div>
      <div className="lamp"><b /><i /></div><div className="clue">✦</div><div className="crate">CLUE</div><div className="floor" />
      {scene.actors.filter((actor) => actor.visible).map((actor) => <div className="actor-slot" key={actor.id} style={positions[actor.zone] ?? positions.center}><Actor actor={actor} active={actor.id === activeBeat?.actorId} />{activeBeat?.actorId === actor.id && <div className="bubble">{activeBeat.dialogue || activeBeat.action.toUpperCase()}</div>}</div>)}
      {activeBeat && <div className="caption"><b>{scene.actors.find((a) => a.id === activeBeat.actorId)?.name}</b> · {activeBeat.action}</div>}
    </div>
    <footer className="stage-footer"><span>● lamp</span><span>● crate</span><span>✦ clue</span><span>9 action vocabulary</span></footer>
  </section>;
}
