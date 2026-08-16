import { planPopulation } from './autonomy';
import { assessClinicalTrigger, bridgeToClinicalRuntime, type ClinicalRuntimePort } from './clinicalBridge';
import { defaultSchedules, runDailyLifeTick } from './dailyLife';
import { defaultSocialAgents, interact, socialEvents } from './socialAgents';
import { dynamicsEvents, proposeDynamics, type DynamicsProposal } from './vnnDynamics';
import type { PersonEntity, PersistentWorldState, PersistentWorldStore } from './worldModel';

export interface LiveWorldFrame {
  activities: ReturnType<typeof planPopulation>;
  proposals: DynamicsProposal[];
  clinical: ReturnType<typeof assessClinicalTrigger>[];
}

export class LiveWorldLoop {
  private accumulator = 0;
  private socialAccumulator = 0;
  private lastFrame: LiveWorldFrame = { activities: [], proposals: [], clinical: [] };

  constructor(private store: PersistentWorldStore, private clinicalRuntime?: ClinicalRuntimePort) {}

  snapshot() { return this.lastFrame; }

  step(realSeconds: number): LiveWorldFrame {
    this.store.tick(realSeconds);
    this.accumulator += realSeconds;
    this.socialAccumulator += realSeconds;
    if (this.accumulator < 5) return this.lastFrame;
    this.accumulator = 0;

    let state = this.store.snapshot();
    const dailyEvents = defaultSchedules.flatMap((schedule) => runDailyLifeTick(state, schedule).events);
    this.store.appendEvents(dailyEvents);
    state = this.store.snapshot();

    const activities = planPopulation(state);
    const proposals = activities.map((activity) => proposeDynamics(state, activity));
    this.store.appendEvents(proposals.flatMap((proposal) => dynamicsEvents(state, proposal)));

    if (this.socialAccumulator >= 15) {
      this.socialAccumulator = 0;
      const person = state.entities.find((entity): entity is PersonEntity => entity.kind === 'person');
      const agent = defaultSocialAgents[Math.floor(state.simulationSeconds / 15) % defaultSocialAgents.length];
      if (person && agent) {
        const interaction = interact(state, agent, person.id, person.communication.access === 'available' ? 'greet' : 'ask');
        if (interaction) this.store.appendEvents(socialEvents(state, interaction));
      }
    }

    state = this.store.snapshot();
    const clinical = state.entities
      .filter((entity): entity is PersonEntity => entity.kind === 'person')
      .map((person) => assessClinicalTrigger(state, person.id, proposals));

    if (this.clinicalRuntime) {
      for (const assessment of clinical) {
        const event = bridgeToClinicalRuntime(state, assessment, this.clinicalRuntime);
        if (event) this.store.appendEvents([event]);
      }
    }

    this.lastFrame = { activities, proposals, clinical };
    return this.lastFrame;
  }
}
