import { createRoot, type Root } from 'react-dom/client';
import { useCallback, useEffect, useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import {
  Background, BackgroundVariant, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow,
  getSmoothStepPath, MarkerType, useReactFlow, type Connection, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps,
} from '@xyflow/react';
import type { AtlasNode, NodeMetrics, NodeType } from './shared/graph.ts';
import type { GraphStore } from './store/graph-store.ts';
import { selectVisibleGraph } from './store/selectors.ts';

const nodePalette: Record<NodeType, string> = {
  gateway: '#66d8bd', service: '#78a8ff', database: '#eeaa68', cache: '#d39bff', topic: '#f0cf69', external: '#d5918a',
};
const nodeGlyph: Record<NodeType, string> = { gateway: '⌘', service: '◇', database: '▤', cache: '◈', topic: '≋', external: '↗' };
const typeNames: Record<NodeType, string> = { gateway: 'API gateway', service: 'Service', database: 'Database', cache: 'Cache', topic: 'Event stream', external: 'External API' };
interface CardData extends Record<string, unknown> {
  type: NodeType;
  label: string;
  repository: string;
  metric?: NodeMetrics;
  selected: boolean;
}
function ServiceCard({ id, data }: NodeProps<Node<CardData, 'service'>>) {
  const color = nodePalette[data.type];
  return <div className={`node-card${data.selected ? ' selected' : ''}`} data-node-id={id} data-testid={`node-${id}`} style={{ '--node-accent': color } as CSSProperties}>
    <Handle type="target" position={Position.Left} />
    <div className="node-card-head"><span className="node-icon">{nodeGlyph[data.type]}</span><span className="node-status" data-status={data.metric?.status ?? 'healthy'} /></div>
    <strong className="node-title" title={data.label}>{data.label}</strong>
    <span className="node-sub">{typeNames[data.type]} <i>·</i> {data.repository}</span>
    <span className="node-metric">{data.metric ? `${data.metric.rps} req/s　${data.metric.latencyMs} ms` : 'Awaiting simulation'}</span>
    <Handle type="source" position={Position.Right} />
  </div>;
}
const nodeTypes = { service: ServiceCard };
function AtlasEdgeView(props: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX: props.sourceX, sourceY: props.sourceY, targetX: props.targetX,
    targetY: props.targetY, sourcePosition: props.sourcePosition, targetPosition: props.targetPosition });
  return <g data-edge-id={props.id}>
    <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} interactionWidth={20} />
    <EdgeLabelRenderer><div className="edge-protocol" style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}>{String(props.data?.protocol ?? 'manual').toUpperCase()}</div></EdgeLabelRenderer>
  </g>;
}
const edgeTypes = { atlas: AtlasEdgeView };

function FlowCanvas({ store, readMetrics, root }: { store: GraphStore; readMetrics: () => NodeMetrics[]; root: HTMLElement }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const graph = useMemo(() => selectVisibleGraph(state.graph, state.filters), [state.graph, state.filters]);
  const metrics = readMetrics();
  const nodes = useMemo<Node<CardData, 'service'>[]>(() => graph.nodes.map((item: AtlasNode) => ({
    id: item.id, type: 'service', position: item.position,
    data: { type: item.type, label: typeof item.data.label === 'string' ? item.data.label : typeof item.data.name === 'string' ? item.data.name : item.id,
      repository: typeof item.data.repository === 'string' ? item.data.repository : 'manual',
      metric: metrics.find((metric) => metric.id === item.id), selected: state.selectedNodeId === item.id },
  })), [graph.nodes, metrics, state.selectedNodeId]);
  const edges = useMemo<Edge[]>(() => graph.edges.map((edge) => ({
    id: edge.id, source: edge.source, target: edge.target, type: 'atlas', markerEnd: { type: MarkerType.ArrowClosed }, animated: !state.simulation.paused && state.simulation.intensity > 0,
    className: state.selectedEdgeId === edge.id ? 'selected' : '', data: { protocol: edge.protocol ?? 'manual' },
  })), [graph.edges, state.selectedEdgeId, state.simulation.paused, state.simulation.intensity]);
  const connect = useCallback((connection: Connection) => {
    if (connection.source && connection.target) {
      try { store.connect(connection.source, connection.target); }
      catch (error) { const toast = root.querySelector<HTMLElement>('#toast'); if (toast) { toast.textContent = error instanceof Error ? error.message : 'Could not connect nodes'; toast.hidden = false; } }
    }
  }, [store, root]);
  const moveNodes = useCallback((changes: NodeChange<Node<CardData, 'service'>>[]) => {
    for (const change of changes) if (change.type === 'position' && change.position) store.moveNode(change.id, change.position);
  }, [store]);
  return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onConnect={connect}
    onNodesChange={moveNodes}
    onNodeClick={(_, node) => store.selectNode(node.id)} onEdgeClick={(_, edge) => store.selectEdge(edge.id)}
    onPaneClick={() => { store.selectNode(null); store.selectEdge(null); }}
    onNodeDragStop={(_, node) => store.moveNode(node.id, node.position)}
    fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.25} maxZoom={1.8} deleteKeyCode={null}
    proOptions={{ hideAttribution: true }} aria-label="Interactive service dependency graph" data-testid="graph-canvas">
    <ViewportActions />
    <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#233342" />
    <Controls showInteractive={false} />
    <MiniMap nodeColor={(node) => nodePalette[(node.data as CardData).type] ?? '#78a8ff'} maskColor="rgba(6,12,18,.7)" />
  </ReactFlow>;
}

function ViewportActions() {
  const flow = useReactFlow();
  useEffect(() => {
    const fit = () => flow.fitView({ padding: 0.2, duration: 300 });
    const zoom = (event: Event) => flow.zoomTo(Math.max(0.25, Math.min(1.8, flow.getZoom() + (event as CustomEvent<number>).detail)), { duration: 180 });
    window.addEventListener('flow-atlas-fit', fit);
    window.addEventListener('flow-atlas-zoom', zoom);
    return () => { window.removeEventListener('flow-atlas-fit', fit); window.removeEventListener('flow-atlas-zoom', zoom); };
  }, [flow]);
  return null;
}

export class GraphView {
  private root: Root;
  private host: HTMLElement;
  private store: GraphStore;
  private readMetrics: () => NodeMetrics[];
  constructor(host: HTMLElement, store: GraphStore, readMetrics: () => NodeMetrics[]) {
    this.host = host;
    this.store = store;
    this.readMetrics = readMetrics;
    this.root = createRoot(host);
    this.render();
  }
  fit() { window.dispatchEvent(new Event('flow-atlas-fit')); }
  setZoom(delta: number) { window.dispatchEvent(new CustomEvent('flow-atlas-zoom', { detail: delta })); }
  render() { this.root.render(<FlowCanvas store={this.store} readMetrics={this.readMetrics} root={this.host.closest('#app') ?? document.body} />); }
}
