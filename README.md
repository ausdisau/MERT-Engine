# MERT Engine

Cross-platform disability-inclusive medical simulation runtime for web, iOS and Android, with a Babylon.js/WebXR persistent open world.

## Architecture status

### Steps 1-6 — Simulation kernel
- Typed physiology, AAC, authority, access, systems, uncertainty and evidence state.
- Central `SimulationKernel` with audit history and simulation-clock control.
- React/React Native is view-controller only; it does not own clinical/world truth.
- Declarative scenario rules: trigger -> conditions -> delay -> effects -> transition.
- VNN dynamics modules return proposals with confidence, rationale and provenance before commit.

### Steps 7-20 — Persistent disability world
- Persistent people, places, infrastructure, relationships and schedules.
- Affordance-based autonomy and environmental attribution of access barriers.
- Social agents with bounded knowledge and direct-first communication safeguards.
- Semantic interaction parity across WebXR controller, gaze, touch, keyboard and switch-style input.
- Counterfactual timeline and world -> clinical bridge.

### Steps 21-24 — Accessible routes, objects and continuity
- Accessibility-weighted route planning across paths, ramps, crossings, lifts and transport.
- Stateful doors, lift motion, AAC charging and explicit transport boarding.
- Proximity + relationship social encounters where support is requested rather than assumed.
- World -> ambulance -> ED -> ICU -> MERT -> discharge -> community continuity.

### Steps 25-28 — Procedural city runtime
- Deterministic procedural city with residential, community, health, education, employment and transport districts.
- Generated triangulated navmesh geometry with A* pathfinding and person-specific access constraints.
- Persistent homes with power/charging state plus an accessible city transport service with explicit capacity allocation and boarding.
- Autonomous emergency-service dispatch linked only to an active evidence-gated ambulance continuity stage.
- Babylon/WebXR rendering for city buildings, roads, navmesh overlay, accessible transport and emergency vehicles.

## Core invariants

```text
communication failure != incapacity
disability != acute deterioration
model proposal != clinical truth
equipment availability != indication
friend/support worker != substitute authority
route failure != person failure
transport allocation != consent to board
emergency dispatch != treatment inference
```

## Running

```bash
npm install
npm run typecheck
npm test
npm run web
```

## Web build

```bash
npm run build:web
```

The resulting `dist/` directory is configured for Vercel through `vercel.json`.

## Testing

The UI tests use React Native Testing Library interaction patterns and query the interface through accessible roles and names. Runtime tests cover authority preservation, AAC access, simulation timing, declarative deterioration, VNN invocation, persistent world state, route barriers, object state, social support non-assumption, clinical continuity, procedural-city determinism, navmesh generation, transport allocation and emergency dispatch gating.

## Scope

MERT Engine is educational simulation software. Scenario physiology, accessibility thresholds, route weights, vehicle speeds and emergency-response timings are authored simulation parameters, not real-patient prediction, diagnosis, treatment guidance, device-control logic or statutory accessibility standards.
