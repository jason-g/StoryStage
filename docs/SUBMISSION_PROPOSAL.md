# StoryStage — An Agent-Native Stage for Shared Direction

## Project summary

StoryStage is an interactive storytelling app where a person and their browser agent co-direct a live animated scene. Users build a small cast and setting, then type or speak stage directions. Characters visibly carry out those directions through a compact, predictable animation vocabulary.

StoryStage is not a general-purpose animated movie generator. It is a shared theatrical stage: the person sees and controls the world, while a WebMCP-enabled agent reliably operates the same scene through explicit creative tools.

**Live app:** _Add before submission_

**Public code repository:** _Add before submission_

**Public demo video:** _Add before submission_

## The experience

1. The user creates a small cast and chooses a backdrop.
2. They type or say: “Fenn enters from the left, walks to the lamp, gasps, and points at the clue.”
3. StoryStage maps that direction to supported stage actions and animates the result on the shared canvas.
4. The user asks their browser agent to continue or revise the scene.
5. The agent invokes structured WebMCP tools, and each action visibly happens on the stage.
6. The user remains in control: they can inspect the scene, redirect the action, and co-author the next beat.

## Why WebMCP

The value is not merely that AI can generate a story. A browser agent can work *inside* a visual creative app, beside the user, with direct access to the app’s actual scene controls.

StoryStage exposes its client-side stage logic as WebMCP tools. The agent does not infer buttons or simulate clicks. It calls reliable, schema-backed actions that update the same scene graph the user is watching.

| Tool | What it does |
|---|---|
| `create_character` | Adds an actor from a supported character preset. |
| `create_scene` | Sets the backdrop and starts a new stage. |
| `place_actor` | Moves an actor to a named stage position. |
| `direct_action` | Queues a supported stage action for an actor. |
| `set_expression` | Sets a visible expression such as happy, surprised, or suspicious. |
| `play_scene` | Plays queued actions as a coherent scene beat. |
| `get_scene_state` | Returns cast, positions, props, and queued actions. |

This makes human–agent collaboration visible and dependable. The agent contributes creatively without taking the user out of the experience or acting through brittle browser automation.

## Deliberately constrained action system

StoryStage uses a small animation vocabulary:

`enter` · `walk` · `run` · `point` · `talk` · `laugh` · `gasp` · `hide` · `exit`

Natural-language directions are mapped to these actions, character targets, and simple stage locations. For example:

> “The robot sneaks in, sees Fenn, gasps, then hides behind the crate.”

becomes: robot `enter` from right; robot `walk` to center; robot `gasp`; robot `hide` behind crate.

The constraint is intentional. It makes animation understandable, repeatable, and enjoyable in a live demo while leaving room for narrative improvisation.

## Challenge MVP

The first version prioritizes a coherent, polished demo over broad generation features:

- A 2D stage with expressive character presets, backdrops, and props.
- Simple character customization: name, palette, and expression.
- Typed direction, plus browser speech-to-text when available.
- The nine-action vocabulary, with smooth transitions and dialogue bubbles.
- WebMCP tools that control the real stage state.
- A ready-to-play demo story: a fox detective and nervous robot investigate a clue in a rainy neon alley.

## Implementation approach

The frontend owns one scene graph containing actors, props, backdrop, locations, expressions, and an action queue. Human controls and WebMCP handlers call the same state-update functions, keeping visual state, human direction, and agent actions aligned.

Each tool uses a narrow description and structured input schema. `direct_action`, for example, accepts only a known actor, supported action, and allowed position or target. This avoids ambiguous agent behavior and keeps the demo reliable.

## Demo narrative

The user creates Detective Fenn and a robot in a rainy neon alley. They direct Fenn to spot and point at a glowing clue. Then they ask the browser agent to bring the robot in from the right, make it gasp, hide it behind a crate, and let Fenn laugh. The agent invokes WebMCP tools and the audience sees it co-direct the scene. The user revises the next beat, demonstrating collaboration rather than automation.

## Long-term vision

StoryStage ultimately aims to become a richer storytelling studio with generated art, advanced motion, voice performance, persistent worlds, and multi-person collaboration. Those are explicitly not the initial target: they would compromise the reliability and completeness of the challenge build.

The MVP proves the essential idea first: a person and an agent create an animated story together on a shared, controllable web stage.
