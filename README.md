# MERT Engine

Cross-platform disability-inclusive medical simulation runtime for web, iOS and Android.

## Architecture status

### Step 1 — Typed protocol + patient/world state
- Shared TypeScript contracts for physiology, AAC, authority, access, systems, uncertainty and evidence.
- Typed `SimulationEvent` transport.

### Step 2 — Simulation kernel + safety invariants
- Central `SimulationKernel` owns world state, event audit and simulation time.
- AAC composition can pause simulation time.
- Protected invariants prevent communication failure from being converted into loss of self-authority.

### Step 3 — React/React Native as view-controller
- UI sends semantic scenario events and renders snapshots.
- UI does not own clinical/world truth.

### Step 4 — Scenario Engine
- `DeclarativeScenarioEngine` owns branch progression, delayed consequences and node state.

### Step 5 — Declarative Scenario Rules
- Case logic is represented as data: trigger → conditions → delay → effects → transition.
- Rules can request domain-model dynamics instead of directly hard-coding every consequence.

### Step 6 — World-State / VNN Dynamics Modules
- `VNNDynamicsCoordinator` routes `dynamics.requested` events to registered modules.
- Included example modules:
  - `respiratory-dynamics`
  - `access-dynamics`
- Dynamics return proposals with confidence, rationale and provenance before world-state events are committed through the kernel.

## Core invariant

```text
communication failure != incapacity
disability != acute deterioration
model proposal != clinical truth
equipment availability != indication
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

The UI tests use React Native Testing Library v14 interaction patterns and query the interface by accessible roles and labels rather than implementation details.

The runtime tests cover:
- AAC restoration without authority transfer
- simulation-clock pause during AAC composition
- delayed declarative deterioration
- VNN dynamics invocation
- protected authority invariants

## Scope

MERT Engine is educational simulation software. Scenario physiology and dynamics are authored educational models, not real-patient prediction, diagnosis, treatment guidance or device-control logic.
