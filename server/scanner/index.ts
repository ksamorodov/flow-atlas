import { validateGraph } from '../../src/shared/validation.ts';
import type { AtlasEdge, AtlasNode, Evidence, GraphDocument, NodeType } from '../../src/shared/graph.ts';
import { resolveRoot, type RootOptions } from '../security/roots.ts';
import { walkFiles, type ScannedFile } from '../security/walk.ts';

export interface DiscoverOptions extends RootOptions { limits?: { maxFiles?: number; maxBytes?: number; maxDepth?: number; maxEntries?: number } }
type Finding = { from: string; to: string; protocol: string; evidence: Evidence };
const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'unknown';
const nodeId = (type: NodeType, name: string): string => `${type}:${slug(name)}`;
const safeTargetName = (raw: string): string => {
  try { const url = new URL(raw.replace(/^jdbc:/, '')); return url.hostname || 'configured endpoint'; } catch { return raw.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80) || 'configured endpoint'; }
};
function sourceLines(files: ScannedFile[]): Array<{ file: ScannedFile; line: number; text: string }> {
  return files.flatMap((file) => {
    const isJava = /\.(java|kt)$/i.test(file.path);
    const content = isJava ? file.content.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, '')) : file.content;
    return content.split(/\r?\n/).map((original, index) => {
      let text = original;
      if (isJava) {
        let quote = '';
        let escaped = false;
        for (let position = 0; position < text.length - 1; position += 1) {
          const char = text[position];
          if (escaped) { escaped = false; continue; }
          if (char === '\\' && quote) { escaped = true; continue; }
          if ((char === '"' || char === "'") && (!quote || quote === char)) { quote = quote ? '' : char; continue; }
          if (!quote && char === '/' && text[position + 1] === '/') { text = text.slice(0, position); break; }
        }
      }
      return { file, line: index + 1, text: text.trim() };
    });
  }).filter(({ text }) => text && !text.startsWith('//') && !text.startsWith('*') && !text.startsWith('#'));
}

export async function discover(rootId: string, options: DiscoverOptions = {}): Promise<GraphDocument> {
  const root = await resolveRoot(rootId, options);
  const files = await walkFiles(root.path, options.limits);
  const lines = sourceLines(files);
  const serviceNames = new Map<string, string>();
  for (const file of files.filter((entry) => /\.(java|kt)$/.test(entry.path))) {
    const module = file.path.split('/')[0];
    const config = files.find((entry) => entry.path.startsWith(`${module}/`) && /application\.(properties|ya?ml)$/i.test(entry.path));
    const appName = config?.content.match(/(?:spring\.application\.name\s*[=:]\s*|name:\s*)([a-zA-Z0-9._-]+)/)?.[1];
    if (/@(?:org\.springframework\.boot\.autoconfigure\.SpringBootApplication|SpringBootApplication)/.test(file.content)) serviceNames.set(module, appName ?? module);
  }
  const nodes = new Map<string, AtlasNode>();
  const edges: AtlasEdge[] = [];
  const findings: Finding[] = [];
  const ensure = (type: NodeType, name: string): string => {
    const id = nodeId(type, name);
    if (!nodes.has(id)) nodes.set(id, { id, type, position: { x: 0, y: 0 }, data: { name: name.slice(0, 100) } });
    return id;
  };
  for (const name of serviceNames.values()) ensure('service', name);
  const serviceFor = (path: string): string => {
    const module = path.split('/')[0];
    const name = serviceNames.get(module) ?? module;
    return ensure('service', name);
  };
  const addFinding = (from: string, to: string, protocol: string, file: ScannedFile, line: number, confidence: Evidence['confidence']): void => {
    findings.push({ from, to, protocol, evidence: { path: file.path, line, protocol, confidence } });
  };
  for (const { file, line, text } of lines) {
    const isSource = /\.(java|kt)$/i.test(file.path);
    const isConfig = /application\.(?:properties|ya?ml)$/i.test(file.path);
    const isInfrastructure = /(?:compose|docker-compose|deploy|k8s|kubernetes).*\.ya?ml$/i.test(file.path);
    if (!isSource && !isConfig && !isInfrastructure) continue;
    if (isInfrastructure) {
      if (/image:\s*postgres(?::|\s|$)/i.test(text)) ensure('database', 'postgresql');
      if (/image:\s*redis(?::|\s|$)/i.test(text)) ensure('cache', 'redis');
      const declaration = text.match(/^\s{2}([a-zA-Z0-9_-]+):\s*$/);
      if (declaration && /postgres|database|db/i.test(declaration[1])) ensure('database', declaration[1]);
      else if (declaration && /redis|cache/i.test(declaration[1])) ensure('cache', declaration[1]);
      const k8sName = text.match(/^\s*name:\s*([a-zA-Z0-9._-]+)/)?.[1];
      if (k8sName && /(?:deploy|k8s|kubernetes).*\.ya?ml$/i.test(file.path)) ensure('service', k8sName);
      continue;
    }
    const from = serviceFor(file.path);
    const code = text.replace(/"(?:\\.|[^"\\])*"/g, (value) => value);
    const urlMatch = code.match(/https?:\/\/[^"'\s)]+/);
    const feignTarget = code.match(/FeignClient[^)]*\bname\s*=\s*["']([^"']+)["']/)?.[1];
    if ((urlMatch || feignTarget) && /(getForObject|postForObject|exchange|\.uri\(|FeignClient|HttpExchange|GetExchange|PostExchange)/.test(code)) {
      const target = urlMatch ? safeTargetName(urlMatch[0]) : safeTargetName(feignTarget ?? 'configured endpoint');
      const to = ensure('service', target);
      addFinding(from, to, 'HTTP', file, line, urlMatch && /getForObject|postForObject|exchange\(|\.uri\(/.test(code) ? 'HIGH' : 'MEDIUM');
    }
    const kafkaSend = code.match(/\.send\(\s*["']([^"']+)["']/);
    const kafkaListen = code.match(/(?:KafkaListener|topics\s*=)\s*\(?\s*(?:topics\s*=\s*)?["']([^"']+)["']/);
    const rabbitSend = code.match(/convertAndSend\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/);
    const rabbitListen = code.match(/RabbitListener\s*\([^)]*(?:queues?\s*=\s*)?["']([^"']+)["']/);
    if (kafkaSend || kafkaListen) {
      const topic = ensure('topic', kafkaSend?.[1] ?? kafkaListen![1]);
      addFinding(kafkaSend ? from : topic, kafkaSend ? topic : from, 'Kafka', file, line, 'HIGH');
    }
    if (rabbitSend || rabbitListen) {
      const topic = ensure('topic', rabbitSend?.[2] ?? rabbitListen![1]);
      addFinding(rabbitSend ? from : topic, rabbitSend ? topic : from, 'RabbitMQ', file, line, 'HIGH');
    }
    const db = code.match(/jdbc:postgres(?:ql)?:\/\/([^:/?]+)/i);
    if (db) addFinding(from, ensure('database', 'postgresql'), 'PostgreSQL', file, line, 'MEDIUM');
    const redis = code.match(/redis:\/\/([^:/?]+)/i);
    if (redis) addFinding(from, ensure('cache', 'redis'), 'Redis', file, line, 'MEDIUM');
  }
  for (const finding of findings) edges.push({
    id: `edge:${slug(finding.from)}:${slug(finding.to)}:${slug(finding.protocol)}`,
    source: finding.from, target: finding.to, protocol: finding.protocol, evidence: [finding.evidence],
  });
  const deduped = new Map<string, AtlasEdge>();
  for (const edge of edges) {
    const prior = deduped.get(edge.id);
    if (prior) prior.evidence.push(...edge.evidence);
    else deduped.set(edge.id, edge);
  }
  const ordered = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  ordered.forEach((node, index) => { node.position = { x: (index % 4) * 240, y: Math.floor(index / 4) * 140 }; });
  const graph = { version: 1 as const, nodes: ordered, edges: [...deduped.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  return validateGraph(graph);
}
