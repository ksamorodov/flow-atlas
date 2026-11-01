import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreset } from './presets.ts';
import { stepSimulation } from './simulation.ts';
import { validateGraph } from './validation.ts';
import type { GraphDocument } from './graph.ts';

const minimalGraph: GraphDocument = {
  version: 1,
  nodes: [
    { id: 'api', type: 'service', position: { x: 0, y: 0 }, data: { label: 'API' } },
    { id: 'db', type: 'database', position: { x: 100, y: 0 }, data: { label: 'DB' } },
  ],
  edges: [{ id: 'api-db', source: 'api', target: 'db', protocol: 'postgres', evidence: [] }],
};

test('validateGraph returns a canonical JSON-safe round trip', () => {
  const graph = validateGraph(JSON.parse(JSON.stringify(minimalGraph)) as unknown);
  assert.deepEqual(graph, minimalGraph);
  assert.equal(JSON.stringify(validateGraph(graph)), JSON.stringify(graph));
});

test('validateGraph rejects malformed structure, duplicate IDs, bad endpoints, and unsafe data keys', () => {
  assert.throws(() => validateGraph(null));
  assert.throws(() => validateGraph({ ...minimalGraph, version: 2 }));
  assert.throws(() => validateGraph({ ...minimalGraph, nodes: [...minimalGraph.nodes, minimalGraph.nodes[0]] }));
  assert.throws(() => validateGraph({ ...minimalGraph, edges: [{ ...minimalGraph.edges[0], target: 'missing' }] }));
  const unsafeGraph = JSON.parse('{"version":1,"nodes":[{"id":"api","type":"service","position":{"x":0,"y":0},"data":{"__proto__":{"polluted":true}}}],"edges":[]}') as unknown;
  assert.throws(() => validateGraph(unsafeGraph));
  assert.throws(() => validateGraph({ ...minimalGraph, nodes: [{ ...minimalGraph.nodes[0], position: { x: Number.NaN, y: 0 } }] }));
});

test('validateGraph enforces evidence bounds and rejects oversized JSON', () => {
  assert.throws(() => validateGraph({
    ...minimalGraph,
    edges: [{ ...minimalGraph.edges[0], evidence: [{ path: 'src/App.java', line: 0, protocol: 'http', confidence: 1 }] }],
  }));
  assert.throws(() => validateGraph({ ...minimalGraph, nodes: [{ ...minimalGraph.nodes[0], data: { text: 'x'.repeat(1_000_001) } }] }));
});

test('validateGraph rejects non-JSON values before serialization can coerce or drop them', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, undefined, () => 'not JSON']) {
    const input = {
      ...minimalGraph,
      nodes: [{ ...minimalGraph.nodes[0], data: { nested: [{ value }] } }],
      edges: [],
    };
    assert.throws(() => validateGraph(input));
  }
});

test('evidence confidence is one of the documented categories', () => {
  const withEvidence = {
    ...minimalGraph,
    edges: [{
      ...minimalGraph.edges[0],
      evidence: [{ path: 'src/Api.java', line: 12, protocol: 'postgres', confidence: 'HIGH' }],
    }],
  };
  assert.deepEqual(validateGraph(withEvidence).edges[0].evidence[0].confidence, 'HIGH');
  assert.throws(() => validateGraph({
    ...withEvidence,
    edges: [{ ...withEvidence.edges[0], evidence: [{ ...withEvidence.edges[0].evidence[0], confidence: 'certain' }] }],
  }));
});

test('each named preset produces a valid graph with nonempty nodes and edges', () => {
  for (const name of ['microservices', 'event-driven'] as const) {
    const graph = createPreset(name);
    assert.deepEqual(validateGraph(graph), graph);
    assert.ok(graph.nodes.length > 0, `${name} has nodes`);
    assert.ok(graph.edges.length > 0, `${name} has edges`);
  }
});

test('simulation is deterministic for identical graph, state, seed, and tick', () => {
  const first = stepSimulation(minimalGraph, { intensity: 1, paused: false }, 42, 8);
  const second = stepSimulation(minimalGraph, { intensity: 1, paused: false }, 42, 8);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.ok(first.nodes.every(({ rps, latencyMs, errorRate }) =>
    Number.isFinite(rps) && Number.isFinite(latencyMs) && Number.isFinite(errorRate)));
  assert.notEqual(first.nodes[0].rps, stepSimulation(minimalGraph, { intensity: 1, paused: false }, 43, 8).nodes[0].rps);
});

test('pause holds metrics and zero intensity yields finite zero traffic', () => {
  const moving = stepSimulation(minimalGraph, { intensity: 1, paused: false }, 10, 3);
  const paused = stepSimulation(minimalGraph, { intensity: 1, paused: true }, 10, 4, moving);
  assert.deepEqual(paused.nodes, moving.nodes);
  const idle = stepSimulation(minimalGraph, { intensity: 0, paused: false }, 10, 3);
  assert.ok(idle.nodes.every(({ rps, latencyMs, errorRate }) =>
    rps === 0 && latencyMs === 0 && errorRate === 0));
});

test('failures propagate upstream, track retries, and recover when cleared', () => {
  const chain: GraphDocument = {
    version: 1,
    nodes: [
      { id: 'client', type: 'service', position: { x: 0, y: 0 }, data: { label: 'Client' } },
      { id: 'api', type: 'service', position: { x: 1, y: 0 }, data: { label: 'API' } },
      { id: 'db', type: 'database', position: { x: 2, y: 0 }, data: { label: 'DB' } },
    ],
    edges: [
      { id: 'client-api', source: 'client', target: 'api', evidence: [] },
      { id: 'api-db', source: 'api', target: 'db', evidence: [] },
    ],
  };
  const healthy = stepSimulation(chain, { intensity: 1, paused: false }, 99, 5);
  const failed = stepSimulation(chain, { intensity: 1, paused: false, failedNodeIds: ['db'], retryLimit: 2 }, 99, 6, healthy);
  assert.ok(failed.nodes.find(({ id }) => id === 'db')!.errorRate > 0);
  assert.ok(failed.nodes.find(({ id }) => id === 'client')!.errorRate > 0);
  assert.ok(failed.nodes.every(({ attempts }) => attempts > 0));
  assert.ok(failed.nodes.every(({ retries }) => retries > 0));
  const exhausted = stepSimulation(chain, { intensity: 1, paused: false, failedNodeIds: ['db'], retryLimit: 0 }, 99, 6);
  assert.ok(exhausted.nodes.every(({ status, retries }) => status === 'failed' && retries === 0));
  const recovered = stepSimulation(chain, { intensity: 1, paused: false }, 99, 7, failed);
  assert.ok(recovered.nodes.every(({ errorRate }) => errorRate === 0));
  assert.ok(recovered.nodes.every(({ retries }) => retries === 0));
});

test('failure propagation terminates across a cycle and shared diamond dependencies', () => {
  const graph: GraphDocument = {
    version: 1,
    nodes: ['root', 'left', 'right', 'store'].map((id, index) => ({
      id,
      type: 'service',
      position: { x: index, y: 0 },
      data: { label: id },
    })),
    edges: [
      { id: 'root-left', source: 'root', target: 'left', evidence: [] },
      { id: 'root-right', source: 'root', target: 'right', evidence: [] },
      { id: 'left-store', source: 'left', target: 'store', evidence: [] },
      { id: 'right-store', source: 'right', target: 'store', evidence: [] },
      { id: 'store-root', source: 'store', target: 'root', evidence: [] },
    ],
  };
  const frame = stepSimulation(graph, { intensity: 1, paused: false, failedNodeIds: ['store'] }, 7, 2);
  assert.equal(frame.nodes.length, 4);
  assert.ok(frame.nodes.every(({ errors }) => errors > 0));
});

test('single-node simulation locks the seeded metric semantics including retries in rps', () => {
  const graph: GraphDocument = {
    version: 1,
    nodes: [{ id: 'only', type: 'service', position: { x: 0, y: 0 }, data: { label: 'Only' } }],
    edges: [],
  };
  assert.deepEqual(stepSimulation(graph, { intensity: 1, paused: false }, 1, 0), {
    tick: 0,
    nodes: [{ id: 'only', status: 'healthy', rps: 7, latencyMs: 30, errorRate: 0, attempts: 7, errors: 0, retries: 0 }],
  });
});
