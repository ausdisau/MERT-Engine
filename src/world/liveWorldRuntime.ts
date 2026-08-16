import { planPopulation, type PlannedActivity } from './autonomy';
import { assessClinicalTrigger, bridgeToClinicalRuntime, type ClinicalRuntimePort } from './clinicalBridge';
import { proposeDynamics, dynamicsEvents, type DynamicsProposal } from './vnnDynamics';
import { defaultSocialAgents, interact, socialEvents } from './socialAgents';
import { WorldTimeline } from './timeline';
import type { PersonEntity, PersistentWorldState, PersistentWorldStore, Vec3, WorldEvent } from './worldModel';

export interface LiveWorldFrame {
  state: PersistentWorldState;
  activities: PlannedActivity[];
  proposals: DynamicsProposal[];
  clinical: ReturnType<typeof assessClinicalTrigger>[];
}

export class LiveWorldRuntime {
  private accumulator = 0;
  private timeline = new WorldTimeline();
  private lastFrame?: LiveWorldFrame;

  constructor(private store: PersistentWorldStore, private clinicalRuntime?: ClinicalRuntimePort) {}

  step(deltaSeconds: number): LiveWorldFrame {
    this.store.tick(deltaSeconds);
    this.accumulator += deltaSeconds;
    if (this.lastFrame && this.accumulator < 2) return { ...this.lastFrame, state: this.store.snapshot() };
    this.accumulator = 0;

    const state = this.store.snapshot();
    const activities = planPopulation(state);
    const proposals = activities.map((activity) => proposeDynamics(state, activity));
    const generated: WorldEvent[] = proposals.flatMap((proposal) => dynamicsEvents(state, proposal));

    for (const activity of activities) this.advancePerson(activity, state);

    for (const person of state.entities.filter((entity): entity is PersonEntity => entity.kind === 'person')) {
      const peer = defaultSocialAgents[0];
      const social = interact(state, peer, person.id, 'greet');
      if (social && state.simulationSeconds % 30 < 2) generated.push(...socialEvents(state, social));
    }

    this.store.appendEvents(generated);
    const next = this.store.snapshot();
    const clinical = next.entities
      .filter((entity): entity is PersonEntity => entity.kind === 'person')
      .map((person) => assessClinicalTrigger(next, person.id, proposals));

    if (this.clinicalRuntime) {
      for (const assessment of clinical) {
        const event = bridgeToClinicalRuntime(next, assessment, this.clinicalRuntime);
        if (event) this.store.appendEvents([event]);
      }
    }

    this.timeline.capture(this.store.snapshot(), `live world at ${Math.round(next.simulationSeconds)}s`);
    this.lastFrame = { state: this.store.snapshot(), activities, proposals, clinical };
    return this.lastFrame;
  }

  latest() { return this.lastFrame; }
  timelineStore() { return this.timeline; }

  private advancePerson(activity: PlannedActivity, state: PersistentWorldState) {
    if (!activity.targetId || (activity.kind !== 'travel' && activity.kind !== 'seek-alternative')) return;
    const person = state.entities.find((entity): entity is PersonEntity => entity.kind === 'person' && entity.id === activity.personId);
    const target = state.entities.find((entity) => entity.id === activity.targetId);
    if (!person || !target) return;
    const [px, py, pz] = person.position;
    const [tx, , tz] = target.position;
    const dx = tx - px; const dz = tz - pz; const distance = Math.hypot(dx, dz);
    if (distance < 1.5) return;
    const speed = person.mobility.mode === 'powered-wheelchair' ? 1.25 : 0.9;
    const step = Math.min(speed * 2, distance);
    const next: Vec3 = [px + (dx / distance) * step, py, pz + (dz / distance) * step];
    this.store.move(person.id, next);
  }
}
