import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  for (const line of [8, 9, 10, 12, 13]) {
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

async function withSyntheticRoot(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'flow-atlas-task4-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('keeps YAML nesting across blank and comment lines for application identity and infrastructure', async () => {
  await withSyntheticRoot(async (root) => {
    await mkdir(join(root, 'orders/src/main/java/example'), { recursive: true });
    await mkdir(join(root, 'orders/src/main/resources'), { recursive: true });
    await writeFile(join(root, 'orders/build.gradle.kts'), 'plugins {}\n');
    await writeFile(join(root, 'orders/src/main/java/example/App.java'), '@SpringBootApplication class App {}\n');
    const config = 'spring:\n  application:\n\n    # keep application nesting\n    name: orders-api\n  datasource:\n    url: jdbc:postgresql://db.local:5432/orders\n  data:\n    redis:\n      url: redis://cache.local:6380\n';
    await writeFile(join(root, 'orders/src/main/resources/application.yml'), config);
    const graph = await discover('synthetic', { roots: [{ id: 'synthetic', label: 'Synthetic', path: root }] });
    assert.ok(graph.nodes.some((node) => node.type === 'service' && node.data.name === 'orders-api'));
    assert.equal(graph.nodes.find((node) => node.type === 'service' && node.data.name === 'orders-api')?.data.repository, 'orders');
    assert.ok(graph.edges.some((edge) => edge.protocol === 'PostgreSQL' && edge.evidence[0].line === 7));
    assert.ok(graph.edges.some((edge) => edge.protocol === 'Redis' && edge.evidence[0].line === 10));
  });
});

test('uses sanitized Feign endpoint identities and exact service matching with explicit ports', async () => {
  await withSyntheticRoot(async (root) => {
    await mkdir(join(root, 'orders/src/main/java/example'), { recursive: true });
    await mkdir(join(root, 'orders/src/main/resources'), { recursive: true });
    await mkdir(join(root, 'catalog/src/main/java/example'), { recursive: true });
    await writeFile(join(root, 'orders/build.gradle.kts'), 'plugins {}\n');
    await writeFile(join(root, 'catalog/build.gradle.kts'), 'plugins {}\n');
    await writeFile(join(root, 'orders/src/main/java/example/App.java'), '@SpringBootApplication class Orders {}\n');
    await writeFile(join(root, 'catalog/src/main/java/example/App.java'), '@SpringBootApplication class Catalog {}\n');
    await writeFile(join(root, 'orders/src/main/resources/application.yml'), 'clients:\n  configured:\n    url: https://resolved.example:9443/private?token=hidden\n');
    await writeFile(join(root, 'orders/src/main/java/example/Clients.java'), [
      '@FeignClient(url = "https://user:secret@api.example:8443/private?token=hidden") interface Literal {}',
      '@FeignClient(name = "wrong", url = "https://api.example:9443/path") interface Conflict {}',
      '@FeignClient(url = "${clients.configured.url}") interface Configured {}',
      '@FeignClient(name = "fallback", url = "${missing.client.url}") interface Unresolved {}',
      'client.getForObject("http://orders.evil.example:8123/private", String.class);',
      'client.getForObject("http://orders:8123/private", String.class);',
    ].join('\n'));
    const graph = await discover('synthetic', { roots: [{ id: 'synthetic', label: 'Synthetic', path: root }] });
    const edges = graph.edges.filter((edge) => edge.protocol === 'HTTP');
    const external = graph.nodes.filter((node) => node.type === 'external');
    assert.deepEqual(external.map((node) => node.data.name).sort(), ['api.example', 'api.example', 'orders.evil.example', 'resolved.example']);
    assert.deepEqual(external.map((node) => node.data.port).sort(), ['8123', '8443', '9443', '9443']);
    assert.ok(edges.some((edge) => edge.target === graph.nodes.find((node) => node.type === 'service' && node.data.name === 'orders')?.id));
    assert.equal(external.some((node) => node.data.name === 'wrong' || node.data.name === 'fallback'), false);
    assert.equal(JSON.stringify(graph).includes('secret'), false);
    assert.equal(JSON.stringify(graph).includes('/private'), false);
    assert.equal(JSON.stringify(graph).includes('hidden'), false);
  });
});
