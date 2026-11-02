import assert from 'node:assert/strict';
import test from 'node:test';
import { createGraphStore } from './graph-store.ts';
import { selectVisibleGraph, summarizeMetrics } from './selectors.ts';
import { createPreset } from '../shared/presets.ts';
import type { GraphDocument, SimulationFrame } from '../shared/graph.ts';

const graph: GraphDocument = {
  version: 1,
  nodes: [
    { id: 'api', type: 'service', position: { x: 0, y: 0 }, data: { label: 'API', repository: 'orders' } },
    { id: 'db', type: 'database', position: { x: 100, y: 0 }, data: { label: 'DB', repository: 'orders' } },
    { id: 'cache', type: 'cache', position: { x: 200, y: 0 }, data: { label: 'Cache', repository: 'catalog' } },
  ],
  edges: [
    { id: 'api-db', source: 'api', target: 'db', protocol: 'postgres', evidence: [{ path: 'orders/Api.java', line: 8, protocol: 'postgres', confidence: 'HIGH' }] },
    { id: 'db-cache', source: 'db', target: 'cache', protocol: 'redis', evidence: [{ path: 'catalog/Cache.java', line: 12, protocol: 'redis', confidence: 'LOW' }] },
  ],
};

test('store adds, connects, edits, deletes nodes and incident edges immutably', () => {
  const store = createGraphStore(graph);
  const id = store.addNode('service', { x: 20, y: 30 });
  store.connect('api', id, 'http');
  store.renameNode(id, 'Search');
  assert.equal(store.getState().graph.nodes.find((node) => node.id === id)?.data.label, 'Search');
  store.deleteNode(id);
  assert.equal(store.getState().graph.nodes.some((node) => node.id === id), false);
  assert.equal(store.getState().graph.edges.some((edge) => edge.source === id || edge.target === id), false);
  assert.equal(graph.nodes.length, 3);
});

test('store replace and import validate atomically and reset stale simulation state', () => {
  const store = createGraphStore(graph);
  store.setSimulation({ failedNodeIds: ['db'] });
  const before = store.getState().graph;
  assert.throws(() => store.importJson('{"version":1}'));
  assert.deepEqual(store.getState().graph, before);
  store.importJson(JSON.stringify(createPreset('event-driven')));
  assert.equal(store.getState().graph.nodes.length, 5);
  assert.deepEqual(store.getState().simulation.failedNodeIds, []);
});

test('layout and label edits preserve active simulation failures and tick', () => {
  const store = createGraphStore(graph);
  store.setSimulation({ failedNodeIds: ['db'] });
  store.advanceTick();
  store.moveNode('api', { x: 40, y: 50 });
  assert.equal(store.getState().tick, 1);
  assert.deepEqual(store.getState().simulation.failedNodeIds, ['db']);
  store.renameNode('api', 'Orders API');
  assert.equal(store.getState().tick, 1);
  assert.deepEqual(store.getState().simulation.failedNodeIds, ['db']);
});

test('removing a graph edge preserves unrelated simulation failures and tick', () => {
  const store = createGraphStore(graph);
  store.setSimulation({ failedNodeIds: ['db'] });
  store.advanceTick();
  store.deleteEdge('api-db');
  assert.equal(store.getState().tick, 1);
  assert.deepEqual(store.getState().simulation.failedNodeIds, ['db']);
  assert.equal(store.getState().graph.edges.some((edge) => edge.id === 'api-db'), false);
});

test('new node and edge IDs do not collide with imported IDs', () => {
  const imported: GraphDocument = {
    version: 1,
    nodes: [{ id: 'service-1', type: 'service', position: { x: 0, y: 0 }, data: { label: 'Existing' } },
      { id: 'database-2', type: 'database', position: { x: 100, y: 0 }, data: { label: 'DB' } }],
    edges: [{ id: 'edge-3', source: 'service-1', target: 'database-2', evidence: [] }],
  };
  const store = createGraphStore(imported);
  const nodeId = store.addNode('service', { x: 200, y: 0 });
  const edgeId = store.connect('service-1', 'database-2');
  assert.equal(new Set(store.getState().graph.nodes.map((node) => node.id)).size, store.getState().graph.nodes.length);
  assert.equal(new Set(store.getState().graph.edges.map((edge) => edge.id)).size, store.getState().graph.edges.length);
  assert.notEqual(nodeId, 'service-1');
  assert.notEqual(edgeId, 'edge-3');
});

test('visible graph filters edges by protocol, confidence, and repository without losing evidence', () => {
  const visible = selectVisibleGraph(graph, { protocols: ['postgres'], confidences: ['HIGH'], repositories: ['orders'] });
  assert.deepEqual(visible.edges.map((edge) => edge.id), ['api-db']);
  assert.deepEqual(visible.edges[0].evidence, graph.edges[0].evidence);
  assert.ok(visible.nodes.some((node) => node.id === 'api'));
  assert.equal(selectVisibleGraph(graph, { protocols: ['redis'], confidences: ['HIGH'], repositories: [] }).edges.length, 0);
});

test('metrics summary aggregates actual frame values with request-weighted latency', () => {
  const frame: SimulationFrame = { tick: 1, nodes: [
    { id: 'api', status: 'healthy', rps: 10, latencyMs: 20, errorRate: 0, attempts: 10, errors: 0, retries: 0 },
    { id: 'db', status: 'failed', rps: 30, latencyMs: 40, errorRate: 0.5, attempts: 30, errors: 15, retries: 0 },
  ] };
  assert.deepEqual(summarizeMetrics(frame), { ingressRps: 40, errorRate: 0.375, latencyMs: 35, health: 'degraded' });
});
