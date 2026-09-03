import type { CSSProperties } from "react";
import type { SceneState, StageActor } from "./playback";
import "./stage.css";
import "./hillside.css";

type Props = { scene: SceneState; activeBeat?: SceneState["queue"][number] | null };
const positions: Record<string, CSSProperties> = {
  offstage_left: { left: "-8%" }, left: { left: "14%" }, lamp: { left: "28%" }, center: { left: "51%" }, crate: { left: "76%" }, right: { left: "89%" }, offstage_right: { left: "108%" }, castle: { left: "16%" }, hillside: { left: "47%" }, horse: { left: "34%" }, dragon_roost: { left: "78%" },
};

function Actor({ actor, active }: { actor: StageActor; active: boolean }) {
  const robot = actor.preset === "robot";
  const knight = actor.preset === "knight";
  const dragon = actor.preset === "dragon";
  const face = actor.expression === "surprised" ? "◉  ◉" : actor.expression === "happy" || actor.expression === "amused" ? "⌣  ⌣" : actor.expression === "worried" ? "⌢  ⌢" : "•  •";
  return <div className={`actor ${robot ? "robot" : knight ? "knight" : dragon ? "dragon" : "fox"} ${active ? "active" : ""}`} aria-label={`${actor.name}, ${actor.expression}`}>
    {dragon ? <><div className="wings">◢ ◣</div><div className="head">{face}</div><div className="body">✦</div></> : knight ? <><div className="helmet">♜</div><div className="head">{face}</div><div className="body">✚</div></> : robot ? <><div className="antenna">●</div><div className="head">{face}</div><div className="body">◇</div></> : <><div className="ears">▲ ▲</div><div className="head">{face}<b>⌄</b></div><div className="body">✦</div></>}
    <div className="feet">⌄  ⌄</div>
  </div>;
}

export default function Stage({ scene, activeBeat }: Props) {
  const hillside = scene.sceneId === "hillside_quest";
  return <section className="stage-shell" aria-label={hillside ? "StoryStage hillside quest theater" : "StoryStage neon alley theater"}>
    <header className="marquee"><strong>STORYSTAGE</strong><span>live co-direction theater</span><i /></header>
    <div className={`stage ${hillside ? "hillside-stage" : ""}`} aria-live="polite">
      {hillside ? <><div className="hill-back" /><div className="hill-front" /><div className="castle">♜<i>♜</i><b>♜</b></div><div className="horse">♞</div><div className="sword">†</div><div className="bow">⌒<i>➤</i></div><div className="floor" /></> : <><div className="rain" /><div className="moon" /><div className="city left-city" /><div className="city right-city" /><div className="neon">NIGHT<br /><em>OWL</em></div><div className="lamp"><b /><i /></div><div className="clue">✦</div><div className="crate">CLUE</div><div className="floor" /></>}
      {scene.actors.filter((actor) => actor.visible).map((actor) => <div className="actor-slot" key={actor.id} style={positions[actor.zone] ?? positions.center}><Actor actor={actor} active={actor.id === activeBeat?.actorId} />{activeBeat?.actorId === actor.id && <div className="bubble">{activeBeat.dialogue || activeBeat.action.toUpperCase()}</div>}</div>)}
      {activeBeat && <div className="caption"><b>{scene.actors.find((a) => a.id === activeBeat.actorId)?.name}</b> · {activeBeat.action}</div>}
    </div>
    <footer className="stage-footer">{hillside ? <><span>♜ castle</span><span>♞ horse</span><span>† sword · bow · arrow</span><span>13 action vocabulary</span></> : <><span>● lamp</span><span>● crate</span><span>✦ clue</span><span>13 action vocabulary</span></>}</footer>
  </section>;
}
