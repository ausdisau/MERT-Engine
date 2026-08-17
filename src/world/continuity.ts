import type { PersonEntity, PersistentWorldState, PersistentWorldStore, WorldEvent } from './worldModel';

export type ContinuityStage = 'community' | 'ambulance' | 'ed' | 'icu' | 'mert-scenario' | 'discharge' | 'community-return' | 'community-with-consequences';

export interface ContinuityEpisode {
  id:string;
  personId:string;
  stage:ContinuityStage;
  history:ContinuityStage[];
  preserved:{ authority:'self'; communication:true; worldHistory:true; baseline:true };
  consequences:{ fatigue:number; followupRequired:boolean; supportReviewRequired:boolean; accessChanges:string[] };
}

export const WOLFRAM_CONTINUITY_MODEL = {
  verifiedAcyclic: true,
  unexpectedDeadEnds: 0,
  exampleReturnPath: ['icu','mert-scenario','discharge','community-return','community-with-consequences'] as ContinuityStage[],
};

const transitions:Record<ContinuityStage,ContinuityStage[]> = {
  community:['ambulance'],
  ambulance:['ed'],
  ed:['icu','discharge'],
  icu:['mert-scenario'],
  'mert-scenario':['discharge'],
  discharge:['community-return'],
  'community-return':['community-with-consequences'],
  'community-with-consequences':[],
};

export class ContinuityEngine {
  private episodes=new Map<string,ContinuityEpisode>();
  constructor(private store?:PersistentWorldStore){}

  episode(personId:string){const e=this.episodes.get(personId);return e?JSON.parse(JSON.stringify(e)) as ContinuityEpisode:undefined;}

  start(person:PersonEntity,reason:string){const existing=this.episodes.get(person.id);if(existing&&existing.stage!=='community-with-consequences')return existing;const episode:ContinuityEpisode={id:`episode-${person.id}-${Date.now()}`,personId:person.id,stage:'ambulance',history:['community','ambulance'],preserved:{authority:'self',communication:true,worldHistory:true,baseline:true},consequences:{fatigue:0,followupRequired:false,supportReviewRequired:false,accessChanges:[]}};this.episodes.set(person.id,episode);this.event('continuity.started',person.id,`community->ambulance; reason=${reason}; authority=self`);return episode;}

  canAdvance(personId:string,next:ContinuityStage){const episode=this.episodes.get(personId);return Boolean(episode&&transitions[episode.stage].includes(next));}

  advance(personId:string,next:ContinuityStage,detail='explicit simulation transition'){
    const episode=this.episodes.get(personId);if(!episode||!transitions[episode.stage].includes(next))return false;
    const previous=episode.stage;episode.stage=next;episode.history.push(next);
    if(next==='icu'||next==='mert-scenario')episode.consequences.fatigue=Math.max(episode.consequences.fatigue,1);
    if(next==='discharge'){episode.consequences.followupRequired=true;episode.consequences.supportReviewRequired=true;}
    if(next==='community-return')episode.consequences.accessChanges.push('reassess transport, communication and equipment access after discharge');
    this.event('continuity.transition',personId,`${previous}->${next}; ${detail}`);return true;
  }

  advanceDemoPath(personId:string){const episode=this.episodes.get(personId);if(!episode)return false;const preferred:Partial<Record<ContinuityStage,ContinuityStage>>={ambulance:'ed',ed:'icu',icu:'mert-scenario','mert-scenario':'discharge',discharge:'community-return','community-return':'community-with-consequences'};const next=preferred[episode.stage];return next?this.advance(personId,next,'educational continuity demo'):false;}

  summary(personId:string){const e=this.episode(personId);return e?`${e.stage} · history ${e.history.join(' → ')}`:'community · no active clinical episode';}

  private event(type:string,entityId:string,detail:string):WorldEvent|undefined{return this.store?.recordEvent(type,entityId,detail);}
}

export function preservedContinuityContext(state:PersistentWorldState,personId:string){const person=state.entities.find((e):e is PersonEntity=>e.kind==='person'&&e.id===personId);return person?{personId,authority:person.authority,communication:person.communication,worldEvents:state.events.slice(-50)}:undefined;}
