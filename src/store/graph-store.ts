import { NODE_TYPES } from '../shared/graph.ts';
import { createStore } from 'zustand/vanilla';
import type { AtlasEdge, AtlasNode, GraphDocument, NodeType, SimulationSettings } from '../shared/graph.ts';
import { createPreset, type PresetName } from '../shared/presets.ts';
import { validateGraph } from '../shared/validation.ts';
import type { AtlasFilters } from './selectors.ts';

export interface GraphState {
  graph: GraphDocument;
  filters: AtlasFilters;
  simulation: SimulationSettings;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  tick: number;
}

export function createGraphStore(initial: GraphDocument = createPreset('microservices')) {
  let sequence = 1;
  const zustandStore = createStore<GraphState>()(() => ({
    graph: validateGraph(initial),
    filters: { protocols: [], confidences: [], repositories: [] },
    simulation: { intensity: 5, paused: false, failedNodeIds: [], retryLimit: 2 },
    selectedNodeId: initial.nodes[0]?.id ?? null,
    selectedEdgeId: null,
    tick: 0,
  }));
  const state = zustandStore.getState;
  const commit = (patch: Partial<GraphState>) => zustandStore.setState(patch);
  const commitGraph = (graph: GraphDocument, resetSimulation = true) => {
    const current = state();
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    commit({ graph: validateGraph(graph), ...(resetSimulation ? { tick: 0,
      simulation: { ...current.simulation, failedNodeIds: [] }, filters: { protocols: [], confidences: [], repositories: [] } } : { simulation: {
        ...current.simulation, failedNodeIds: (current.simulation.failedNodeIds ?? []).filter((id) => nodeIds.has(id)),
      } }), selectedEdgeId: null,
      selectedNodeId: graph.nodes.some((node) => node.id === current.selectedNodeId) ? current.selectedNodeId : graph.nodes[0]?.id ?? null });
  };
  const uniqueId = (prefix: string, existing: string[]) => {
    const ids = new Set(existing);
    let id = `${prefix}-${sequence++}`;
    while (ids.has(id)) id = `${prefix}-${sequence++}`;
    return id;
  };
  return {
    getState: state,
    subscribe(listener: () => void) { return zustandStore.subscribe(() => listener()); },
    addNode(type: NodeType, position: { x: number; y: number }) {
      if (!NODE_TYPES.includes(type)) throw new TypeError('Unsupported node type');
      const id = uniqueId(type, state().graph.nodes.map((node) => node.id));
      const node: AtlasNode = { id, type, position: { ...position }, data: { label: `New ${type}` } };
      commitGraph({ ...state().graph, nodes: [...state().graph.nodes, node] }, false);
      commit({ selectedNodeId: id });
      return id;
    },
    connect(source: string, target: string, protocol = 'http') {
      if (source === target || !state().graph.nodes.some((node) => node.id === source) || !state().graph.nodes.some((node) => node.id === target)) {
        throw new TypeError('Choose two different nodes in this graph');
      }
      const id = uniqueId('edge', state().graph.edges.map((edge) => edge.id));
      const edge: AtlasEdge = { id, source, target, protocol, evidence: [] };
      commitGraph({ ...state().graph, edges: [...state().graph.edges, edge] }, false);
      commit({ selectedEdgeId: id, selectedNodeId: null });
      return id;
    },
    moveNode(id: string, position: { x: number; y: number }) {
      commitGraph({ ...state().graph, nodes: state().graph.nodes.map((node) => node.id === id ? { ...node, position: { ...position } } : node) }, false);
    },
    renameNode(id: string, label: string) {
      const clean = label.trim().slice(0, 120);
      if (!clean || !state().graph.nodes.some((node) => node.id === id)) return;
      commitGraph({ ...state().graph, nodes: state().graph.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, label: clean } } : node) }, false);
    },
    changeNodeType(id: string, type: NodeType) {
      commitGraph({ ...state().graph, nodes: state().graph.nodes.map((node) => node.id === id ? { ...node, type } : node) }, false);
    },
    deleteNode(id: string) {
      commitGraph({ ...state().graph, nodes: state().graph.nodes.filter((node) => node.id !== id), edges: state().graph.edges.filter((edge) => edge.source !== id && edge.target !== id) }, false);
    },
    deleteEdge(id: string) {
      commitGraph({ ...state().graph, edges: state().graph.edges.filter((edge) => edge.id !== id) }, false);
    },
    selectNode(id: string | null) { commit({ selectedNodeId: id, selectedEdgeId: null }); },
    selectEdge(id: string | null) { commit({ selectedEdgeId: id, selectedNodeId: null }); },
    replaceGraph(document: GraphDocument) { commitGraph(document); },
    importJson(text: string) { if (new TextEncoder().encode(text).byteLength > 1_000_000) throw new TypeError('Import must be at most 1 MB'); commitGraph(validateGraph(JSON.parse(text) as unknown)); },
    loadPreset(name: PresetName) { commitGraph(createPreset(name)); },
    setFilters(filters: AtlasFilters) { commit({ filters: structuredClone(filters) }); },
    setSimulation(settings: Partial<SimulationSettings>) { commit({ simulation: { ...state().simulation, ...settings } }); },
    advanceTick() { commit({ tick: state().tick + 1 }); },
  };
}

export type GraphStore = ReturnType<typeof createGraphStore>;
