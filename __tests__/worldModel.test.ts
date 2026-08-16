import { InfrastructureEntity, PersonEntity, PersistentWorldStore, accessAssessment, initialOpenWorldState } from '../src/world/worldModel';

describe('persistent disability world', () => {
  it('attributes a failed lift to the environment rather than person incapacity', () => {
    const store = new PersistentWorldStore(initialOpenWorldState);
    const person = store.entity('maya') as PersonEntity;
    const lift = store.entity('station-lift') as InfrastructureEntity;
    expect(accessAssessment(person, lift)).toEqual({ pass: true, cause: 'accessible' });
    store.setInfrastructure('station-lift', false);
    expect(accessAssessment(person, store.entity('station-lift') as InfrastructureEntity)).toEqual({ pass: false, cause: 'environmental infrastructure unavailable' });
    expect(person.authority).toBe('self');
  });

  it('does not change decision authority when AAC access degrades', () => {
    const store = new PersistentWorldStore(initialOpenWorldState);
    store.setCommunicationAccess('maya', 'degraded');
    const person = store.entity('maya') as PersonEntity;
    expect(person.communication.access).toBe('degraded');
    expect(person.authority).toBe('self');
  });
});
