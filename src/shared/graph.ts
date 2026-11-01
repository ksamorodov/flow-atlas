export const NODE_TYPES = ['service', 'database', 'cache', 'topic', 'external', 'gateway'] as const;

export type NodeType = (typeof NODE_TYPES)[number];
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface Evidence {
  path: string;
  line: number;
  protocol: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  snippet?: string;
}

export interface AtlasNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, JsonValue>;
}

export interface AtlasEdge {
  id: string;
  source: string;
  target: string;
  protocol?: string;
  evidence: Evidence[];
}

export interface GraphDocument {
  version: 1;
  nodes: AtlasNode[];
  edges: AtlasEdge[];
}

export interface SimulationSettings {
  intensity: number;
  paused: boolean;
  failedNodeIds?: string[];
  retryLimit?: number;
}

export interface NodeMetrics {
  id: string;
  status: 'healthy' | 'degraded' | 'failed';
  rps: number;
  latencyMs: number;
  errorRate: number;
  attempts: number;
  errors: number;
  retries: number;
}

export interface SimulationFrame {
  tick: number;
  nodes: NodeMetrics[];
}
