import type { GraphDocument, SimulationFrame } from '../shared/graph.ts';

export interface AtlasFilters { protocols: string[]; confidences: string[]; repositories: string[] }

export function selectVisibleGraph(graph: GraphDocument, filters: AtlasFilters): GraphDocument {
  const edges = graph.edges.filter((edge) => {
    const protocol = (edge.protocol ?? edge.evidence[0]?.protocol ?? 'manual').toLowerCase();
    const protocolMatches = filters.protocols.length === 0 || filters.protocols.some((item) => item.toLowerCase() === protocol || edge.evidence.some((entry) => entry.protocol.toLowerCase() === item.toLowerCase()));
    const confidenceMatches = filters.confidences.length === 0 || edge.evidence.some((entry) => filters.confidences.includes(entry.confidence));
    const repositoryMatches = filters.repositories.length === 0 || edge.evidence.some((entry) => filters.repositories.some((repository) => entry.path.startsWith(`${repository}/`) || entry.path === repository));
    return protocolMatches && confidenceMatches && repositoryMatches;
  });
  const keep = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  for (const node of graph.nodes) if (filters.repositories.length === 0 || filters.repositories.some((repository) => node.data.repository === repository)) keep.add(node.id);
  return { version: 1, nodes: graph.nodes.filter((node) => keep.has(node.id)), edges };
}

export function summarizeMetrics(frame: SimulationFrame): { ingressRps: number; errorRate: number; latencyMs: number; health: 'healthy' | 'degraded' | 'failed' } {
  const requests = frame.nodes.reduce((sum, node) => sum + node.attempts, 0);
  const errors = frame.nodes.reduce((sum, node) => sum + node.errors, 0);
  const latency = frame.nodes.reduce((sum, node) => sum + node.latencyMs * node.attempts, 0);
  const failed = frame.nodes.filter((node) => node.status !== 'healthy').length;
  return { ingressRps: frame.nodes.reduce((sum, node) => sum + node.rps, 0), errorRate: requests ? errors / requests : 0,
    latencyMs: requests ? Math.round(latency / requests * 100) / 100 : 0,
    health: !failed ? 'healthy' : failed === frame.nodes.length ? 'failed' : 'degraded' };
}
