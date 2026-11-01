import type { GraphDocument, NodeMetrics, SimulationFrame, SimulationSettings } from './graph.ts';

function sample(seed: number, tick: number, id: string): number {
  let value = (seed ^ Math.imul(tick + 1, 0x9e3779b1)) >>> 0;
  for (let index = 0; index < id.length; index += 1) {
    value = Math.imul(value ^ id.charCodeAt(index), 0x45d9f3b) >>> 0;
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b) >>> 0;
  value ^= value >>> 16;
  return value / 0x1_0000_0000;
}

function propagatedFailures(graph: GraphDocument, failedNodeIds: readonly string[]): Set<string> {
  const upstream = new Map<string, string[]>();
  for (const edge of graph.edges) {
    const parents = upstream.get(edge.target) ?? [];
    parents.push(edge.source);
    upstream.set(edge.target, parents);
  }
  const failed = new Set<string>();
  const pending = [...failedNodeIds];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || failed.has(current)) continue;
    failed.add(current);
    pending.push(...(upstream.get(current) ?? []));
  }
  return failed;
}

function baseDemand(graph: GraphDocument, nodeId: string): number {
  const degree = graph.edges.reduce((count, edge) => count + Number(edge.source === nodeId || edge.target === nodeId), 0);
  return 8 + degree * 2;
}

export function stepSimulation(
  graph: GraphDocument,
  settings: SimulationSettings,
  seed: number,
  tick: number,
  previous?: SimulationFrame,
): SimulationFrame {
  if (settings.paused && previous) return structuredClone(previous);

  const intensity = Number.isFinite(settings.intensity) ? Math.min(100, Math.max(0, settings.intensity)) : 0;
  const retryLimit = Number.isFinite(settings.retryLimit) ? Math.max(0, Math.floor(settings.retryLimit ?? 0)) : 2;
  const failures = propagatedFailures(graph, settings.failedNodeIds ?? []);
  const nodes = graph.nodes.map<NodeMetrics>((node) => {
    const traffic = intensity === 0 ? 0 : Math.max(0, Math.round(baseDemand(graph, node.id) * intensity * (0.9 + sample(seed, tick, node.id) * 0.2)));
    const errors = failures.has(node.id) ? traffic : 0;
    const retries = errors === 0 ? 0 : Math.min(errors * retryLimit, errors * 10_000);
    const attempts = traffic + retries;
    const errorRate = attempts === 0 ? 0 : errors / attempts;
    const latencyMs = attempts === 0 ? 0 : Math.round((12 + (traffic / Math.max(1, attempts)) * 18 + retries * 3) * 100) / 100;
    return {
      id: node.id,
      status: errors === 0 ? 'healthy' : retries > 0 ? 'degraded' : 'failed',
      rps: attempts,
      latencyMs,
      errorRate,
      attempts,
      errors,
      retries,
    };
  });
  return { tick, nodes };
}
