export type Vec3 = readonly [number, number, number];
export type EntityKind = 'person' | 'assistive-tech' | 'infrastructure' | 'place' | 'service';
export type AccessModality = 'walk' | 'powered-wheelchair' | 'manual-wheelchair' | 'eye-gaze' | 'switch' | 'speech' | 'touch';

export interface WorldEntity {
  id: string;
  kind: EntityKind;
  label: string;
  position: Vec3;
  persistent: boolean;
  tags: string[];
}

export interface PersonEntity extends WorldEntity {
  kind: 'person';
  communication: {
    primary: 'speech' | 'aac' | 'sign' | 'multimodal';
    access: 'available' | 'degraded' | 'unavailable';
    responseLatencySeconds: number;
  };
  mobility: {
    mode: AccessModality;
    independent: boolean;
  };
  goals: string[];
  authority: 'self';
}

export interface InfrastructureEntity extends WorldEntity {
  kind: 'infrastructure';
  feature: 'lift' | 'ramp' | 'automatic-door' | 'crossing' | 'charging-point' | 'quiet-space';
  operational: boolean;
  accessibility: AccessModality[];
}

export type OpenWorldEntity = WorldEntity | PersonEntity | InfrastructureEntity;

export interface PersistentWorldState {
  version: 1;
  simulationSeconds: number;
  entities: OpenWorldEntity[];
  events: WorldEvent[];
}

export interface WorldEvent {
  id: string;
  at: number;
  type: string;
  entityId?: string;
  detail: string;
}

export const initialOpenWorldState: PersistentWorldState = {
  version: 1,
  simulationSeconds: 0,
  entities: [
    { id: 'clinical-centre', kind: 'place', label: 'Clinical Simulation Centre', position: [-24, 0, 8], persistent: true, tags: ['clinical', 'simulation'] },
    { id: 'community-hub', kind: 'place', label: 'Community Hub', position: [25, 0, 22], persistent: true, tags: ['community', 'social'] },
    { id: 'rehab-lab', kind: 'place', label: 'Rehabilitation Lab', position: [24, 0, -28], persistent: true, tags: ['rehabilitation'] },
    { id: 'transit', kind: 'place', label: 'Accessible Transit Station', position: [-25, 0, -34], persistent: true, tags: ['transport'] },
    { id: 'maya', kind: 'person', label: 'Maya', position: [5, 0, 9], persistent: true, tags: ['resident'], authority: 'self', communication: { primary: 'aac', access: 'available', responseLatencySeconds: 12 }, mobility: { mode: 'powered-wheelchair', independent: true }, goals: ['move through the community', 'communicate directly', 'participate in decisions'] },
    { id: 'station-lift', kind: 'infrastructure', label: 'Station lift', position: [-20, 0, -34], persistent: true, tags: ['transport', 'access'], feature: 'lift', operational: true, accessibility: ['powered-wheelchair', 'manual-wheelchair', 'walk'] },
    { id: 'aac-charge', kind: 'infrastructure', label: 'AAC and mobility charging point', position: [20, 0, 20], persistent: true, tags: ['power', 'access'], feature: 'charging-point', operational: true, accessibility: ['powered-wheelchair', 'manual-wheelchair', 'touch'] }
  ],
  events: []
};

export class PersistentWorldStore {
  private state: PersistentWorldState;

  constructor(seed: PersistentWorldState = initialOpenWorldState) {
    this.state = JSON.parse(JSON.stringify(seed)) as PersistentWorldState;
    this.restore();
  }

  snapshot(): PersistentWorldState { return JSON.parse(JSON.stringify(this.state)) as PersistentWorldState; }
  entity(id: string) { return this.state.entities.find((entity) => entity.id === id); }

  tick(seconds: number) {
    this.state.simulationSeconds += Math.max(0, seconds);
    this.persist();
  }

  move(id: string, position: Vec3) {
    const entity = this.entity(id);
    if (!entity) return;
    entity.position = position;
    this.persist();
  }

  upsertEntity(entity: OpenWorldEntity) {
    const index = this.state.entities.findIndex((item) => item.id === entity.id);
    if (index >= 0) this.state.entities[index] = JSON.parse(JSON.stringify(entity)) as OpenWorldEntity;
    else this.state.entities.push(JSON.parse(JSON.stringify(entity)) as OpenWorldEntity);
    this.persist();
  }

  setInfrastructure(id: string, operational: boolean) {
    const entity = this.entity(id);
    if (!entity || entity.kind !== 'infrastructure') return;
    (entity as InfrastructureEntity).operational = operational;
    this.record('infrastructure.changed', id, `${entity.label} ${operational ? 'operational' : 'unavailable'}`);
  }

  setCommunicationAccess(id: string, access: PersonEntity['communication']['access']) {
    const entity = this.entity(id);
    if (!entity || entity.kind !== 'person') return;
    (entity as PersonEntity).communication.access = access;
    this.record('communication.access.changed', id, `${entity.label} communication access: ${access}`);
  }

  appendEvents(events: WorldEvent[]) {
    this.state.events.push(...events);
    this.state.events = this.state.events.slice(-250);
    this.persist();
  }

  recordEvent(type: string, entityId: string | undefined, detail: string) {
    const id = `${this.state.simulationSeconds}-${this.state.events.length}-${type}`;
    const event: WorldEvent = { id, at: this.state.simulationSeconds, type, detail, ...(entityId ? { entityId } : {}) };
    this.appendEvents([event]);
    return event;
  }

  reset(seed: PersistentWorldState = initialOpenWorldState) {
    this.state = JSON.parse(JSON.stringify(seed)) as PersistentWorldState;
    this.persist();
  }

  private record(type: string, entityId: string, detail: string) { this.recordEvent(type, entityId, detail); }

  private persist() {
    if (typeof window !== 'undefined') window.localStorage?.setItem('mert-open-world-v1', JSON.stringify(this.state));
  }

  private restore() {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage?.getItem('mert-open-world-v1');
    if (!saved) return;
    try { this.state = JSON.parse(saved) as PersistentWorldState; } catch { /* retain safe seed */ }
  }
}

export function accessAssessment(person: PersonEntity, infrastructure: InfrastructureEntity) {
  const modalitySupported = infrastructure.accessibility.includes(person.mobility.mode);
  return {
    pass: infrastructure.operational && modalitySupported,
    cause: !infrastructure.operational ? 'environmental infrastructure unavailable' : modalitySupported ? 'accessible' : 'mobility modality not supported'
  };
}
