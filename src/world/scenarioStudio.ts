import type { AccessModality, InfrastructureEntity, PersistentWorldState, Vec3 } from './worldModel';

export interface WorldStudioDraft {
  title: string;
  description: string;
  seed: PersistentWorldState;
}

export interface PlaceDraft {
  id: string;
  label: string;
  position: Vec3;
  tags?: string[];
}

export interface InfrastructureDraft {
  id: string;
  label: string;
  position: Vec3;
  feature: InfrastructureEntity['feature'];
  accessibility: AccessModality[];
  operational?: boolean;
}

export function addPlace(draft: WorldStudioDraft, place: PlaceDraft): WorldStudioDraft {
  return {
    ...draft,
    seed: {
      ...draft.seed,
      entities: [...draft.seed.entities, { ...place, kind: 'place', persistent: true, tags: place.tags ?? [] }],
    },
  };
}

export function addInfrastructure(draft: WorldStudioDraft, infrastructure: InfrastructureDraft): WorldStudioDraft {
  const entity: InfrastructureEntity = {
    ...infrastructure,
    kind: 'infrastructure',
    persistent: true,
    tags: ['access'],
    operational: infrastructure.operational ?? true,
  };
  return { ...draft, seed: { ...draft.seed, entities: [...draft.seed.entities, entity] } };
}

export interface StudioValidationIssue { severity: 'error' | 'warning'; path: string; message: string; }

export function validateWorldDraft(draft: WorldStudioDraft): StudioValidationIssue[] {
  const issues: StudioValidationIssue[] = [];
  const ids = new Set<string>();
  for (const entity of draft.seed.entities) {
    if (ids.has(entity.id)) issues.push({ severity: 'error', path: `entities.${entity.id}`, message: 'Entity IDs must be unique.' });
    ids.add(entity.id);
    if (entity.kind === 'person' && entity.authority !== 'self') issues.push({ severity: 'error', path: `entities.${entity.id}.authority`, message: 'Open-world person authority cannot be silently reassigned by a scenario draft.' });
    if (entity.kind === 'infrastructure' && entity.accessibility.length === 0) issues.push({ severity: 'warning', path: `entities.${entity.id}.accessibility`, message: 'Infrastructure has no represented access modalities; verify this is intentional.' });
  }
  return issues;
}

export function exportWorldDraft(draft: WorldStudioDraft) {
  const issues = validateWorldDraft(draft);
  if (issues.some((issue) => issue.severity === 'error')) throw new Error('World draft contains validation errors.');
  return JSON.stringify(draft, null, 2);
}
