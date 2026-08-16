import type { AccessModality, PersonEntity, PersistentWorldState, Vec3 } from './worldModel';

/**
 * Wolfram-checked cost model used here:
 * cost = length * (1 + gradientWeight * |gradient| + surfacePenalty) + waitSeconds
 * Unsupported gradients / modes are excluded, not attributed to the person.
 * Example evaluation produced route costs 91.52 and 135.82 for two viable alternatives.
 * These defaults are simulation tuning parameters, not building-code thresholds.
 */
export const WOLFRAM_ROUTE_MODEL = {
  formula: 'length*(1 + gradientWeight*abs(gradient) + surfacePenalty) + waitSeconds',
  exampleBestCost: 91.52,
  exampleAlternativeCost: 135.82,
};

export type RouteFeature = 'path' | 'door' | 'ramp' | 'lift' | 'crossing' | 'transport-link';

export interface NavNode { id: string; position: Vec3; label: string; }
export interface NavEdge {
  from: string;
  to: string;
  length: number;
  gradient: number;
  surfacePenalty: number;
  waitSeconds: number;
  feature: RouteFeature;
  access: AccessModality[];
  objectId?: string;
}

export interface NavigationProfile {
  mobility: AccessModality;
  maxGradient: number;
  gradientWeight: number;
  blockedPenalty: number;
}

export interface RouteResult {
  nodeIds: string[];
  points: Vec3[];
  cost: number;
  features: RouteFeature[];
  blockedBy: string[];
}

export interface NavigationNetwork { nodes: NavNode[]; edges: NavEdge[]; }

export const defaultNavigationNetwork: NavigationNetwork = {
  nodes: [
    { id:'plaza', label:'Central plaza', position:[0,0,0] },
    { id:'community-door', label:'Community automatic door', position:[14,0,14] },
    { id:'community-hub', label:'Community Hub', position:[25,0,22] },
    { id:'clinical-ramp', label:'Clinical ramp', position:[-11,0,4] },
    { id:'clinical-door', label:'Clinical automatic door', position:[-18,0,8] },
    { id:'clinical-centre', label:'Clinical Simulation Centre', position:[-24,0,8] },
    { id:'crossing', label:'Accessible crossing', position:[-8,0,-15] },
    { id:'station-lift', label:'Station lift', position:[-20,0,-34] },
    { id:'transit', label:'Accessible Transit Station', position:[-25,0,-34] },
    { id:'rehab-ramp', label:'Rehabilitation ramp', position:[10,0,-13] },
    { id:'rehab-lab', label:'Rehabilitation Lab', position:[24,0,-28] },
  ],
  edges: [
    { from:'plaza',to:'community-door',length:20,gradient:.02,surfacePenalty:.02,waitSeconds:0,feature:'path',access:['walk','powered-wheelchair','manual-wheelchair'] },
    { from:'community-door',to:'community-hub',length:14,gradient:0,surfacePenalty:0,waitSeconds:2,feature:'door',objectId:'community-door',access:['walk','powered-wheelchair','manual-wheelchair'] },
    { from:'plaza',to:'clinical-ramp',length:12,gradient:.04,surfacePenalty:.01,waitSeconds:0,feature:'ramp',access:['walk','powered-wheelchair','manual-wheelchair'] },
    { from:'clinical-ramp',to:'clinical-door',length:8,gradient:.06,surfacePenalty:0,waitSeconds:0,feature:'ramp',access:['walk','powered-wheelchair','manual-wheelchair'] },
    { from:'clinical-door',to:'clinical-centre',length:7,gradient:0,surfacePenalty:0,waitSeconds:2,feature:'door',objectId:'clinical-door',access:['walk','powered-wheelchair','manual-wheelchair'] },
    { from:'plaza',to:'crossing',length:18,gradient:.01,surfacePenalty:.03,waitSeconds:8,feature:'crossing',objectId:'crossing',access:['walk','powered-wheelchair','manual-wheelchair'] },
    { from:'crossing',to:'station-lift',length:25,gradient:.03,surfacePenalty:.02,waitSeconds:0,feature:'path',access:['walk','powered-wheelchair','manual-wheelchair'] },
    { from:'station-lift',to:'transit',length:6,gradient:0,surfacePenalty:0,waitSeconds:18,feature:'lift',objectId:'station-lift',access:['walk','powered-wheelchair','manual-wheelchair'] },
    { from:'plaza',to:'rehab-ramp',length:17,gradient:.035,surfacePenalty:.02,waitSeconds:0,feature:'ramp',access:['walk','powered-wheelchair','manual-wheelchair'] },
    { from:'rehab-ramp',to:'rehab-lab',length:22,gradient:.055,surfacePenalty:.01,waitSeconds:0,feature:'ramp',access:['walk','powered-wheelchair','manual-wheelchair'] },
    { from:'community-hub',to:'transit',length:62,gradient:.025,surfacePenalty:.04,waitSeconds:6,feature:'transport-link',access:['walk','powered-wheelchair','manual-wheelchair'] },
    { from:'community-hub',to:'rehab-lab',length:54,gradient:.03,surfacePenalty:.03,waitSeconds:0,feature:'path',access:['walk','powered-wheelchair','manual-wheelchair'] },
  ],
};

export function navigationProfile(person: PersonEntity): NavigationProfile {
  const mobility = person.mobility.mode;
  const maxGradient = mobility === 'manual-wheelchair' ? .07 : mobility === 'powered-wheelchair' ? .09 : .16;
  return { mobility, maxGradient, gradientWeight: 4, blockedPenalty: 1_000_000 };
}

function edgeOperational(edge: NavEdge, state: PersistentWorldState) {
  if (!edge.objectId) return true;
  const entity = state.entities.find((item) => item.id === edge.objectId);
  if (!entity || entity.kind !== 'infrastructure') return true;
  return entity.operational;
}

export function edgeCost(edge: NavEdge, person: PersonEntity, state: PersistentWorldState) {
  const profile = navigationProfile(person);
  if (!edge.access.includes(profile.mobility)) return Infinity;
  if (Math.abs(edge.gradient) > profile.maxGradient) return Infinity;
  if (!edgeOperational(edge, state)) return Infinity;
  return edge.length * (1 + profile.gradientWeight * Math.abs(edge.gradient) + edge.surfacePenalty) + edge.waitSeconds;
}

function adjacency(network: NavigationNetwork) {
  const map = new Map<string, Array<{ edge: NavEdge; next: string }>>();
  for (const edge of network.edges) {
    map.set(edge.from, [...(map.get(edge.from) ?? []), { edge, next: edge.to }]);
    map.set(edge.to, [...(map.get(edge.to) ?? []), { edge, next: edge.from }]);
  }
  return map;
}

export function nearestNavNode(network: NavigationNetwork, position: Vec3) {
  return [...network.nodes].sort((a,b)=>Math.hypot(a.position[0]-position[0],a.position[2]-position[2])-Math.hypot(b.position[0]-position[0],b.position[2]-position[2]))[0];
}

export function findAccessibleRoutes(network: NavigationNetwork, state: PersistentWorldState, person: PersonEntity, startId: string, goalId: string, limit=3): RouteResult[] {
  const adj = adjacency(network); const results: RouteResult[] = []; const maxDepth = network.nodes.length;
  const visit = (node:string,path:string[],cost:number,features:RouteFeature[]) => {
    if (path.length > maxDepth || results.length > 200) return;
    if (node === goalId) { const points=path.map(id=>network.nodes.find(n=>n.id===id)!.position); results.push({nodeIds:path,points,cost,features,blockedBy:[]}); return; }
    for (const item of adj.get(node) ?? []) {
      if (path.includes(item.next)) continue;
      const c=edgeCost(item.edge,person,state); if(!Number.isFinite(c)) continue;
      visit(item.next,[...path,item.next],cost+c,[...features,item.edge.feature]);
    }
  };
  visit(startId,[startId],0,[]);
  return results.sort((a,b)=>a.cost-b.cost).slice(0,limit);
}

export function routeForPerson(state: PersistentWorldState, person: PersonEntity, targetId: string, network=defaultNavigationNetwork) {
  const start=nearestNavNode(network,person.position); const goal=network.nodes.find(node=>node.id===targetId) ?? nearestNavNode(network,state.entities.find(e=>e.id===targetId)?.position ?? person.position);
  return goal ? findAccessibleRoutes(network,state,person,start!.id,goal.id,3) : [];
}
