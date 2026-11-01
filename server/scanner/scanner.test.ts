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
  assert.ok(graph.nodes.some((node) => node.type === 'database' && node.data.name === 'db'));
  assert.ok(graph.nodes.some((node) => node.type === 'cache' && node.data.name === 'cache'));
  assert.ok(graph.nodes.some((node) => node.type === 'topic' && node.data.name === 'orders.created'));
  assert.deepEqual(graph.nodes.filter((node) => node.type === 'service' && node.data.repository !== '.').map((node) => node.data.name).sort(), ['catalog', 'orders']);
  assert.ok(graph.edges.some((edge) => edge.protocol === 'Kafka'));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'RabbitMQ'));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'PostgreSQL'));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'Redis'));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'HTTP' && edge.evidence.some((item) => item.path.endsWith('OrderClient.java') && item.line === 5 && item.confidence === 'HIGH')));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'HTTP' && edge.evidence.some((item) => item.path.endsWith('OrderClient.java') && item.line === 3 && item.confidence === 'HIGH')));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'HTTP' && edge.evidence.some((item) => item.path.endsWith('OrderClient.java') && item.line === 4 && item.confidence === 'HIGH')));
  assert.ok(graph.edges.every((edge) => edge.evidence.length > 0 && edge.evidence.every((item) => !('snippet' in item))));
});

test('attributes findings only to nested Spring modules and distinguishes services, brokers, and infra endpoints', async () => {
  const regressionRoot = new URL('../fixtures/scanner-regressions/', import.meta.url).pathname;
  const graph = await discover('nested', { roots: [{ id: 'nested', label: 'Nested synthetic', path: regressionRoot }] });
  assert.deepEqual(graph, await discover('nested', { roots: [{ id: 'nested', label: 'Nested synthetic', path: regressionRoot }] }));
  const services = graph.nodes.filter((node) => node.type === 'service' && typeof node.data.repository === 'string' && node.data.repository.startsWith('platform/'));
  assert.deepEqual(services.map((node) => node.data.name).sort(), ['inventory-api', 'orders-api']);
  assert.equal(services.some((node) => node.data.name === 'common' || node.data.name === 'platform' || node.data.name === 'ghost'), false);
  assert.equal(services.find((node) => node.data.name === 'orders-api')?.data.repository, 'platform/orders');
  assert.equal(services.find((node) => node.data.name === 'inventory-api')?.data.repository, 'platform/inventory');
  assert.ok(graph.nodes.some((node) => node.type === 'service' && node.data.name === 'orders-worker'));
  assert.ok(graph.nodes.some((node) => node.type === 'service' && node.data.name === 'inventory-deploy'));
  assert.ok(graph.nodes.some((node) => node.type === 'service' && node.data.name === 'inventory-service'));
  assert.equal(graph.nodes.some((node) => node.type === 'service' && node.data.name === 'unrelated-name-must-not-win'), false);
  assert.equal(graph.nodes.some((node) => node.type === 'service' && node.data.name === 'random-not-an-application-name'), false);
  assert.equal(graph.nodes.some((node) => node.type === 'service' && node.data.name === 'missing.client.url'), false);
  assert.equal(graph.nodes.some((node) => node.data.name === 'phantom-compose-name' || node.data.name === 'phantom-env-name' || node.data.name === 'inventory-container'), false);
  const brokers = graph.nodes.filter((node) => node.type === 'topic' && node.data.name === 'orders');
  assert.deepEqual(brokers.map((node) => node.data.broker).sort(), ['Kafka', 'RabbitMQ']);
  for (const broker of ['Kafka', 'RabbitMQ']) {
    const topic = brokers.find((node) => node.data.broker === broker)!;
    const ordersService = services.find((node) => node.data.name === 'orders-api')!;
    const inventoryService = services.find((node) => node.data.name === 'inventory-api')!;
    assert.ok(graph.edges.some((edge) => edge.protocol === broker && edge.source === ordersService.id && edge.target === topic.id));
    assert.ok(graph.edges.some((edge) => edge.protocol === broker && edge.source === topic.id && edge.target === inventoryService.id));
  }
  assert.equal(graph.nodes.some((node) => node.data.name === 'not-a-kafka-topic' || node.data.name === 'ghost'), false);
  const dbs = graph.nodes.filter((node) => node.type === 'database');
  assert.deepEqual(dbs.map((node) => node.data.name).sort(), ['db', 'inventory-db.internal', 'orders-db.internal']);
  const caches = graph.nodes.filter((node) => node.type === 'cache');
  assert.deepEqual(caches.map((node) => node.data.name).sort(), ['inventory-cache.internal', 'orders-cache.internal', 'redis']);
  assert.equal(caches.filter((node) => node.data.name === 'redis').length, 1);
  const serialized = JSON.stringify(graph);
  for (const secret of ['must-not-leak', 'verySecret', 'otherSecret', 'password=', 'commented.invalid', 'ghost.invalid']) assert.equal(serialized.includes(secret), false);
  assert.ok(graph.edges.some((edge) => edge.protocol === 'HTTP' && edge.evidence.some((evidence) => evidence.path.includes('Outbound.java') && evidence.confidence === 'HIGH')));
  for (const line of [3, 8, 9, 10, 12, 13]) {
    assert.ok(graph.edges.some((edge) => edge.protocol === 'HTTP' && edge.evidence.some((evidence) => evidence.path.endsWith('Outbound.java') && evidence.line === line && evidence.confidence === 'HIGH')));
  }
  assert.ok(graph.edges.some((edge) => edge.protocol === 'PostgreSQL' && edge.evidence.some((evidence) => evidence.path.endsWith('application.yml') && evidence.confidence === 'MEDIUM')));
  assert.ok(graph.edges.some((edge) => edge.protocol === 'Redis' && edge.evidence.some((evidence) => evidence.path.endsWith('application.yml') && evidence.confidence === 'MEDIUM')));
  assert.ok(graph.edges.every((edge) => edge.evidence.every((evidence) => evidence.line > 0 && evidence.path.startsWith('platform/'))));
});

test('recognizes a single-module root service and associates it with the root descriptor', async () => {
  const standaloneRoot = new URL('../fixtures/scanner-regressions/standalone/', import.meta.url).pathname;
  const graph = await discover('standalone', { roots: [{ id: 'standalone', label: 'Standalone', path: standaloneRoot }] });
  const app = graph.nodes.find((node) => node.type === 'service' && node.data.name === 'standalone-api');
  assert.ok(app);
  assert.equal(app.data.repository, '.');
});
