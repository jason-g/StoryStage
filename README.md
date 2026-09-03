# StoryStage

**A shared animated stage for people and browser agents.**

StoryStage is a 2D interactive storytelling app where a user types or speaks stage directions and watches characters act them out. In a WebMCP-capable browser, the user’s agent can co-direct the exact same scene with structured tools.

## Mission

Make storytelling feel like directing a tiny live theater. A person should be able to imagine a moment, say what happens, watch it take shape, and collaborate with an AI agent without surrendering the visual world or their creative control.

## Product thesis

StoryStage is **not** a general-purpose animated movie generator.

It is an **agent-native stage where a person and their browser agent co-direct a live scene**. The user sees the characters, scenery, and action at all times; the agent uses clearly defined stage-direction tools to contribute inside that shared setting.

## Supported stage directions

The initial version intentionally supports a small animation vocabulary:

`enter` · `walk` · `run` · `point` · `talk` · `laugh` · `gasp` · `hide` · `exit`

StoryStage maps typed or spoken language to those actions. This allows natural, playful direction while keeping animation reliable enough for a live, repeatable experience.

Example: “Fenn enters from the left, walks to the lamp, points at the clue, and gasps.”

## Human–agent collaboration

The user creates a cast, selects scenery, places actors, and directs a scene. Their browser agent can co-direct it through WebMCP tools:

- `create_character`
- `create_scene`
- `place_actor`
- `direct_action`
- `set_expression`
- `play_scene`
- `get_scene_state`

These tools update the same client-side scene graph as the human interface. Agent actions are immediately visible and the user can redirect the scene at any time.

## Why WebMCP

WebMCP lets StoryStage publish its client-side creative capabilities as structured, discoverable tools for an in-browser agent. That gives the agent direct, dependable access to the stage without forcing it to guess at interface elements or imitate clicks.

The result is a shared creative workflow: the agent helps direct, while the browser remains the common visual workspace for person and agent.

## Initial scope

The hackathon MVP focuses on a finished, demoable theater experience:

- A polished 2D stage with a small set of character presets, scenery, and props.
- Lightweight character customization: names, palettes, and expressions.
- Typed direction and browser speech-to-text where supported.
- A visible action queue, character animation, dialogue bubbles, and simple stage effects.
- Working WebMCP tools that control the real scene.

## Long-term goals

The long-term goal is broader: an agent-native storytelling studio where people create characters and scenery from descriptions, animate richer performances, and build living story worlds together.

These capabilities are goals, **not the initial target**, because they cannot be delivered reliably within the hackathon time constraints:

- AI-generated character art, scenery, props, and style packs.
- Advanced rigging, lip sync, voice acting, music, cameras, and cinematic transitions.
- Open-ended animation beyond the intentionally constrained action vocabulary.
- Persistent casts and worlds, branching stories, and reusable storyboards.
- Multi-user sessions in which several people and agents co-direct together.
- Agent planning that proposes sequences of story beats for creator approval.

The MVP creates the foundation for that future: a shared scene graph, visual stage, and transparent WebMCP tool layer. It proves the key experience first—people and agents visibly creating a story side by side.

## Development

### Requirements

- Node.js 20.19+ (or Node 22+)
- A modern browser. Voice input and WebMCP are optional progressive enhancements.

### Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Build a production bundle with `npm run build`, then test it locally with `npm run preview`.

### Architecture

StoryStage keeps the entire scene in one client-side state model. The React controls, natural-language parser, playback engine, and WebMCP handlers all issue the same validated scene commands. No API key, backend, account, or database is required for the MVP.

The app also works in browsers without the experimental WebMCP API: the status badge changes to **Human direction mode**, while every human-facing stage control remains available.

### Deploy

The app is a static Vite site. Connect this repository to Vercel, Netlify, or Cloudflare Pages and use:

- Build command: `npm run build`
- Output directory: `dist`
- Node version: 20.19+ or 22+

After deploying, add the public URL to [SUBMISSION_PROPOSAL.md](SUBMISSION_PROPOSAL.md) before submitting.

## Testing WebMCP

Test the deployed app in ChatGPT’s in-app browser, or use a compatible Chrome build with WebMCP testing enabled. Verify that an agent can discover each registered tool and that every tool visibly updates the stage. If the experimental browser API changes, the isolated `src/webmcp.ts` adapter is the only integration point that should need updating.

## License

Add an OSI-approved license before publishing the repository.
