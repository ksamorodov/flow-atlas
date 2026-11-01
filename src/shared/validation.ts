import { NODE_TYPES } from './graph.ts';
import type { AtlasEdge, AtlasNode, Evidence, GraphDocument, JsonValue, NodeType } from './graph.ts';

const MAX_JSON_BYTES = 1_000_000;
const MAX_NODES = 2_000;
const MAX_EDGES = 5_000;
const MAX_EVIDENCE_PER_EDGE = 100;
const MAX_STRING_LENGTH = 4_096;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function record(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function boundedString(value: unknown, name: string, max = MAX_STRING_LENGTH): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new TypeError(`${name} must be a nonempty string of at most ${max} characters`);
  }
  return value;
}

function jsonValue(value: unknown, depth = 0): JsonValue {
  if (depth > 20) throw new TypeError('Graph data exceeds the maximum nesting depth');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
      throw new TypeError('Graph data string is too long');
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Graph data numbers must be finite');
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => jsonValue(item, depth + 1));
  if (typeof value === 'object') {
    const output: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      if (UNSAFE_KEYS.has(key)) throw new TypeError(`Unsafe graph data key: ${key}`);
      if (key.length > 256) throw new TypeError('Graph data key is too long');
      output[key] = jsonValue(item, depth + 1);
    }
    return output;
  }
  throw new TypeError('Graph data must contain only JSON values');
}

function assertJsonCompatible(value: unknown, ancestors = new Set<object>(), depth = 0): void {
  if (depth > 20) throw new TypeError('Graph data exceeds the maximum nesting depth');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Graph data numbers must be finite');
    return;
  }
  if (typeof value !== 'object') throw new TypeError('Graph must contain only JSON values');
  if (ancestors.has(value)) throw new TypeError('Graph must not contain circular references');

  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value) as object | null;
  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Graph must contain only plain JSON objects and arrays');
  }

  ancestors.add(value);
  if (isArray) {
    const array = value as unknown[];
    const keys = Reflect.ownKeys(array);
    if (keys.length !== array.length + 1 || keys.some((key) => typeof key !== 'string' || (key !== 'length' && String(Number(key)) !== key))) {
      throw new TypeError('Graph arrays must not have extra properties');
    }
    for (let index = 0; index < array.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(array, String(index));
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError('Graph arrays must not be sparse or contain accessors');
      }
      assertJsonCompatible(descriptor.value, ancestors, depth + 1);
    }
  } else {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new TypeError('Graph objects must not contain symbol keys');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError('Graph objects must contain enumerable data properties only');
      }
      assertJsonCompatible(descriptor.value, ancestors, depth + 1);
    }
  }
  ancestors.delete(value);
}

function evidence(input: unknown): Evidence {
  const value = record(input, 'Evidence');
  const line = value.line;
  const confidence = value.confidence;
  if (!Number.isSafeInteger(line) || (line as number) < 1) throw new TypeError('Evidence line must be a positive integer');
  if (confidence !== 'HIGH' && confidence !== 'MEDIUM' && confidence !== 'LOW') throw new TypeError('Evidence confidence must be HIGH, MEDIUM, or LOW');
  const output: Evidence = {
    path: boundedString(value.path, 'Evidence path'),
    line: line as number,
    protocol: boundedString(value.protocol, 'Evidence protocol'),
    confidence,
  };
  if (value.snippet !== undefined) output.snippet = boundedString(value.snippet, 'Evidence snippet');
  return output;
}

function parseGraph(value: unknown): GraphDocument {
  const root = record(value, 'Graph');
  if (root.version !== 1) throw new TypeError('Graph version must be 1');
  if (!Array.isArray(root.nodes) || root.nodes.length > MAX_NODES) throw new TypeError(`Graph nodes must be an array of at most ${MAX_NODES}`);
  if (!Array.isArray(root.edges) || root.edges.length > MAX_EDGES) throw new TypeError(`Graph edges must be an array of at most ${MAX_EDGES}`);

  const nodeIds = new Set<string>();
  const nodes: AtlasNode[] = root.nodes.map((input) => {
    const value = record(input, 'Node');
    const id = boundedString(value.id, 'Node id', 256);
    if (nodeIds.has(id)) throw new TypeError(`Duplicate node id: ${id}`);
    nodeIds.add(id);
    if (!NODE_TYPES.some((type) => type === value.type)) throw new TypeError(`Unsupported node type: ${String(value.type)}`);
    const position = record(value.position, 'Node position');
    if (typeof position.x !== 'number' || !Number.isFinite(position.x) || typeof position.y !== 'number' || !Number.isFinite(position.y)) {
      throw new TypeError('Node positions must be finite numbers');
    }
    const rawData = record(value.data, 'Node data');
    const data = jsonValue(rawData) as Record<string, JsonValue>;
    return {
      id,
      type: value.type as NodeType,
      position: { x: position.x, y: position.y },
      data,
    };
  });

  const edgeIds = new Set<string>();
  const edges: AtlasEdge[] = root.edges.map((input) => {
    const value = record(input, 'Edge');
    const id = boundedString(value.id, 'Edge id', 256);
    if (edgeIds.has(id)) throw new TypeError(`Duplicate edge id: ${id}`);
    edgeIds.add(id);
    const source = boundedString(value.source, 'Edge source', 256);
    const target = boundedString(value.target, 'Edge target', 256);
    if (!nodeIds.has(source) || !nodeIds.has(target)) throw new TypeError(`Edge ${id} refers to an unknown node`);
    if (!Array.isArray(value.evidence) || value.evidence.length > MAX_EVIDENCE_PER_EDGE) {
      throw new TypeError(`Edge evidence must be an array of at most ${MAX_EVIDENCE_PER_EDGE}`);
    }
    const edge: AtlasEdge = { id, source, target, evidence: value.evidence.map(evidence) };
    if (value.protocol !== undefined) edge.protocol = boundedString(value.protocol, 'Edge protocol');
    return edge;
  });

  return { version: 1, nodes, edges };
}

export function validateGraph(input: unknown): GraphDocument {
  assertJsonCompatible(input);
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new TypeError('Graph must be serializable JSON');
  }
  if (serialized === undefined || new TextEncoder().encode(serialized).byteLength > MAX_JSON_BYTES) {
    throw new TypeError(`Graph must be JSON and at most ${MAX_JSON_BYTES} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new TypeError('Graph must be serializable JSON');
  }
  return parseGraph(parsed);
}
