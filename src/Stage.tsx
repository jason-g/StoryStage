import type { CSSProperties } from "react";
import type { SceneState, StageActor, StageProp } from "./playback";
import knightArt from "./assets/sir-aurthor.webp";
import dragonArt from "./assets/ember-puppet.webp";
import castleArt from "./assets/hillside-castle.webp";
import horseArt from "./assets/bramble.webp";
import swordArt from "./assets/puppet-sword.webp";
import bowArt from "./assets/puppet-bow.webp";
import arrowArt from "./assets/puppet-arrow.webp";
import "./stage.css";
import "./hillside.css";
import "./quest-assets.css";
import "./horse.css";
import "./battle.css";
import "./carried-motion.css";
import "./object-layer.css";

type Props = { scene: SceneState; activeBeat?: SceneState["queue"][number] | null };
const positions: Record<string, CSSProperties> = {
  offstage_left: { left: "-8%" }, left: { left: "14%" }, lamp: { left: "28%" }, center: { left: "51%" }, crate: { left: "76%" }, right: { left: "89%" }, offstage_right: { left: "108%" }, castle: { left: "16%" }, hillside: { left: "47%" }, horse: { left: "34%" }, dragon_roost: { left: "78%" }, top_right: { left: "86%", bottom: "62%" }, ground_right: { left: "84%", bottom: "17%" },
};

function Actor({ actor, active, action }: { actor: StageActor; active: boolean; action?: string }) {
  const robot = actor.preset === "robot";
  const knight = actor.preset === "knight";
  const dragon = actor.preset === "dragon";
  const face = actor.expression === "surprised" ? "◉  ◉" : actor.expression === "happy" || actor.expression === "amused" ? "⌣  ⌣" : actor.expression === "worried" ? "⌢  ⌢" : "•  •";
  return <div className={`actor ${robot ? "robot" : knight ? "knight" : dragon ? "dragon" : "fox"} ${active ? "active" : ""} ${action ? `action-${action}` : ""}`} aria-label={`${actor.name}, ${actor.expression}`}>
    {dragon ? <img className="actor-art dragon-art" src={dragonArt} alt="" /> : knight ? <img className="actor-art knight-art" src={knightArt} alt="" /> : robot ? <><div className="antenna">●</div><div className="head">{face}</div><div className="body">◇</div><div className="feet">⌄  ⌄</div></> : <><div className="ears">▲ ▲</div><div className="head">{face}<b>⌄</b></div><div className="body">✦</div><div className="feet">⌄  ⌄</div></>}
  </div>;
}

function MovableProp({ prop }: { prop: StageProp }) {
  const visual = prop.id === "horse" ? <img src={horseArt} alt="Bramble, a saddled chestnut horse" /> : prop.id === "sword" ? <img src={swordArt} alt="A carved sword" /> : prop.id === "bow" ? <img src={bowArt} alt="A carved bow" /> : prop.id === "arrow" ? <img src={arrowArt} alt="A carved arrow" /> : prop.id;
  return <div className={`movable-prop movable-${prop.id}`} style={positions[prop.zone] ?? positions.hillside} aria-label={`${prop.id} object at ${prop.zone.replace("_", " ")}`}>{visual}</div>;
}

function CarriedProp({ id }: { id: string }) {
  const visual = id === "sword" ? <img src={swordArt} alt="" /> : id === "bow" ? <img src={bowArt} alt="" /> : id === "arrow" ? <img src={arrowArt} alt="" /> : id;
  return <span className={`carried-${id}`}>{visual}</span>;
}

export default function Stage({ scene, activeBeat }: Props) {
  const hillside = scene.sceneId === "hillside_quest";
  const movableProps = scene.props.filter((prop) => (prop.kind === "object" || prop.kind === "entity") && !prop.heldBy && !(activeBeat?.action === "hold" && activeBeat.targetId === prop.id));
  const heldBy = (actorId: string) => scene.props.filter((prop) => prop.heldBy === actorId).map((prop) => prop.id);
  const displayHeldBy = (actorId: string) => {
    const carried = heldBy(actorId);
    if (activeBeat?.actorId === actorId && activeBeat.action === "hold" && activeBeat.targetId && scene.props.some((prop) => prop.id === activeBeat.targetId)) return [...new Set([...carried, activeBeat.targetId])];
    return carried;
  };
  return <section className="stage-shell" aria-label={hillside ? "StoryStage hillside quest theater" : "StoryStage neon alley theater"}>
    <header className="marquee"><strong>STORYSTAGE</strong><span>live co-direction theater</span><i /></header>
    <div className={`stage ${hillside ? "hillside-stage" : ""}`} aria-live="polite">
      {hillside ? <><div className="hill-back" /><div className="hill-front" /><img className="castle-art" src={castleArt} alt="A stone castle on the hillside" />{movableProps.map((prop) => <MovableProp key={prop.id} prop={prop} />)}<div className="floor" /></> : <><div className="rain" /><div className="moon" /><div className="city left-city" /><div className="city right-city" /><div className="neon">NIGHT<br /><em>OWL</em></div><div className="lamp"><b /><i /></div><div className="clue">✦</div><div className="crate">CLUE</div><div className="floor" /></>}
      {scene.actors.filter((actor) => actor.visible).map((actor) => { const carried = displayHeldBy(actor.id); const moving = actor.id === activeBeat?.actorId && ["enter", "walk", "run", "ride", "fly", "fall"].includes(activeBeat.action); const picking = actor.id === activeBeat?.actorId && activeBeat.action === "hold"; const dropping = actor.id === activeBeat?.actorId && activeBeat.action === "drop"; return <div className="actor-slot" key={actor.id} style={positions[actor.zone] ?? positions.center}>{carried.includes("horse") && <img className="mounted-horse" src={horseArt} alt="" />}<Actor actor={actor} active={actor.id === activeBeat?.actorId} action={actor.id === activeBeat?.actorId ? activeBeat.action : undefined} />{carried.filter((id) => id !== "horse").length > 0 && <div className={`carried-items ${moving ? "moving" : ""} ${picking ? "picking" : ""} ${dropping ? "dropping" : ""}`}>{carried.filter((id) => id !== "horse").map((id) => <CarriedProp id={id} key={id} />)}</div>}{activeBeat?.actorId === actor.id && <div className="bubble">{activeBeat.dialogue || activeBeat.action.toUpperCase()}</div>}</div>; })}
      {activeBeat && ["shoot", "attack", "fall"].includes(activeBeat.action) && <div className={`battle-effect effect-${activeBeat.action}`} aria-hidden="true">{activeBeat.action === "shoot" ? "➤" : activeBeat.action === "attack" ? "✦" : "✹"}</div>}
      {activeBeat && <div className="caption"><b>{scene.actors.find((a) => a.id === activeBeat.actorId)?.name}</b> · {activeBeat.action}</div>}
    </div>
    <footer className="stage-footer">{hillside ? <><span>♜ castle · scenery</span><span>♞ horse · entity</span><span>† sword · bow · arrow · objects</span><span>16 action vocabulary</span></> : <><span>● lamp</span><span>● crate</span><span>✦ clue</span><span>16 action vocabulary</span></>}</footer>
  </section>;
}
