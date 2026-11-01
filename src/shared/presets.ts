import type { GraphDocument } from './graph.ts';

export type PresetName = 'microservices' | 'event-driven';

const presets: Record<PresetName, GraphDocument> = {
  microservices: {
    version: 1,
    nodes: [
      { id: 'web', type: 'gateway', position: { x: 0, y: 0 }, data: { label: 'API Gateway' } },
      { id: 'orders', type: 'service', position: { x: 240, y: -100 }, data: { label: 'Order Service' } },
      { id: 'catalog', type: 'service', position: { x: 240, y: 100 }, data: { label: 'Catalog Service' } },
      { id: 'orders-db', type: 'database', position: { x: 500, y: -100 }, data: { label: 'Orders DB' } },
      { id: 'catalog-cache', type: 'cache', position: { x: 500, y: 100 }, data: { label: 'Catalog Cache' } },
    ],
    edges: [
      { id: 'web-orders', source: 'web', target: 'orders', protocol: 'http', evidence: [] },
      { id: 'web-catalog', source: 'web', target: 'catalog', protocol: 'http', evidence: [] },
      { id: 'orders-db', source: 'orders', target: 'orders-db', protocol: 'postgres', evidence: [] },
      { id: 'catalog-cache', source: 'catalog', target: 'catalog-cache', protocol: 'redis', evidence: [] },
    ],
  },
  'event-driven': {
    version: 1,
    nodes: [
      { id: 'checkout', type: 'service', position: { x: 0, y: 0 }, data: { label: 'Checkout Service' } },
      { id: 'orders-topic', type: 'topic', position: { x: 240, y: 0 }, data: { label: 'orders.created' } },
      { id: 'fulfillment', type: 'service', position: { x: 480, y: -100 }, data: { label: 'Fulfillment Service' } },
      { id: 'notifications', type: 'service', position: { x: 480, y: 100 }, data: { label: 'Notification Service' } },
      { id: 'mail', type: 'external', position: { x: 720, y: 100 }, data: { label: 'Email Provider' } },
    ],
    edges: [
      { id: 'checkout-topic', source: 'checkout', target: 'orders-topic', protocol: 'kafka', evidence: [] },
      { id: 'topic-fulfillment', source: 'orders-topic', target: 'fulfillment', protocol: 'kafka', evidence: [] },
      { id: 'topic-notifications', source: 'orders-topic', target: 'notifications', protocol: 'kafka', evidence: [] },
      { id: 'notifications-mail', source: 'notifications', target: 'mail', protocol: 'https', evidence: [] },
    ],
  },
};

export function createPreset(name: PresetName): GraphDocument {
  const preset = presets[name];
  if (!preset) throw new RangeError(`Unknown preset: ${String(name)}`);
  return structuredClone(preset);
}
