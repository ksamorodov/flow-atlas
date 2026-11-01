import test from 'node:test';
import assert from 'node:assert/strict';
import { discover } from './index.ts';

const fixture = new URL('../fixtures/synthetic/', import.meta.url).pathname;

test('discovers stable services, technologies, and evidence-backed edges from synthetic modules', async () => {
  const graph = await discover('synthetic', { roots: [{ id: 'synthetic', label: 'Synthetic', path: fixture }] });
  assert.deepEqual(graph, await discover('synthetic', { roots: [{ id: 'synthetic', label: 'Synthetic', path: fixture }] }));
  assert.ok(graph.nodes.some((node) => node.type === 'service' && node.data.name === 'orders'));
  assert.ok(graph.nodes.some((node) => node.type === 'service' && node.data.name === 'catalog'));
  assert.equal(graph.nodes.some((node) => node.data.name === 'fake.internal'), false);
  assert.ok(graph.nodes.some((node) => node.type === 'database' && node.data.name === 'postgresql'));
  assert.ok(graph.nodes.some((node) => node.type === 'cache' && node.data.name === 'redis'));
  assert.ok(graph.nodes.some((node) => node.type === 'topic' && node.data.name === 'orders.created'));
  assert.deepEqual(graph.nodes.filter((node) => node.type === 'service').map((node) => node.data.name).sort(), ['catalog', 'orders']);
  assert.ok(graph.edges.some((edge) => edge.protocol === 'Kafka'));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'RabbitMQ'));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'PostgreSQL'));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'Redis'));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'HTTP' && edge.evidence.some((item) => item.path.endsWith('OrderClient.java') && item.line === 5 && item.confidence === 'HIGH')));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'HTTP' && edge.evidence.some((item) => item.path.endsWith('OrderClient.java') && item.line === 3 && item.confidence === 'MEDIUM')));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'HTTP' && edge.evidence.some((item) => item.path.endsWith('OrderClient.java') && item.line === 4 && item.confidence === 'MEDIUM')));
  assert.ok(graph.edges.every((edge) => edge.evidence.length > 0 && edge.evidence.every((item) => !('snippet' in item))));
});
