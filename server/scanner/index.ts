import { basename, dirname } from 'node:path';
import { validateGraph } from '../../src/shared/validation.ts';
import type { AtlasEdge, AtlasNode, Evidence, GraphDocument, JsonValue, NodeType } from '../../src/shared/graph.ts';
import { resolveRoot, type RootOptions } from '../security/roots.ts';
import { walkFiles, type ScannedFile } from '../security/walk.ts';

export interface DiscoverOptions extends RootOptions {
  limits?: { maxFiles?: number; maxBytes?: number; maxDepth?: number; maxEntries?: number; maxMillis?: number };
}
type Finding = { from: string; to: string; protocol: string; evidence: Evidence; identity: string };
type ModuleInfo = { directory: string; name: string; id: string; repository: string };
type FlatValue = { key: string; value: string; line: number };
const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'item';
function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return (result >>> 0).toString(16).padStart(8, '0');
}
function nodeId(type: NodeType, label: string, identity: string): string { return `${type}:${slug(label)}-${hash(identity)}`; }
function withoutComments(content: string): string {
  const noBlocks = content.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''));
  return noBlocks.split(/\r?\n/).map((line) => {
    let quote = '', escaped = false;
    for (let index = 0; index < line.length - 1; index += 1) {
      const char = line[index];
      if (escaped) { escaped = false; continue; }
      if (char === '\\' && quote) { escaped = true; continue; }
      if ((char === '"' || char === "'") && (!quote || quote === char)) { quote = quote ? '' : char; continue; }
      if (!quote && char === '/' && line[index + 1] === '/') return line.slice(0, index);
    }
    return line;
  }).join('\n');
}
function linesOf(file: ScannedFile, content = file.content): Array<{ file: ScannedFile; line: number; text: string }> {
  return content.split(/\r?\n/).map((text, index) => ({ file, line: index + 1, text: text.trim() })).filter(({ text }) => text.length > 0);
}
function rawLines(file: ScannedFile, content = file.content): Array<{ line: number; text: string }> {
  return content.split(/\r?\n/).map((text, index) => ({ line: index + 1, text }));
}
function yamlValue(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed.replace(/\s+#.*$/, '').trim();
}
function configValues(file: ScannedFile): FlatValue[] {
  const result: FlatValue[] = [];
  if (/\.properties$/i.test(file.path)) {
    for (const { line, text } of linesOf(file)) {
      const clean = text.replace(/\s+#.*$/, '').trim();
      if (!clean || clean.startsWith('#') || clean.startsWith('!')) continue;
      const match = clean.match(/^([^=:\s]+)\s*[=:]\s*(.*)$/);
      if (match) result.push({ key: match[1], value: yamlValue(match[2]), line });
    }
    return result;
  }
  const stack: Array<{ indent: number; key: string }> = [];
  for (const { line, text } of rawLines(file)) {
    const clean = text.replace(/\s+#.*$/, '').trimEnd();
    if (!clean.trim() || clean.trim().startsWith('#')) continue;
    if (clean.trim() === '---') { stack.length = 0; continue; }
    const indent = text.match(/^\s*/)?.[0].length ?? 0;
    const match = clean.trim().match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/);
    if (!match) continue;
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    const key = [...stack.map((part) => part.key), match[1]].join('.');
    const value = yamlValue(match[2] ?? '');
    if (value) result.push({ key, value, line });
    else stack.push({ indent, key: match[1] });
  }
  return result;
}
function serviceDisplay(raw: string, fallback: string): string {
  const candidate = raw.trim().replace(/^['"]|['"]$/g, '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(candidate) || /secret|credential|password|token/i.test(candidate)) return fallback;
  return candidate;
}
function hostPort(raw: string, protocol: 'PostgreSQL' | 'Redis'): { host: string; port: string } | undefined {
  try {
    const url = new URL(raw.replace(/^jdbc:/i, ''));
    if (protocol === 'PostgreSQL' && !/^postgres(?:ql)?$/i.test(url.protocol.replace(':', ''))) return undefined;
    if (protocol === 'Redis' && url.protocol !== 'redis:') return undefined;
    if (!url.hostname) return undefined;
    return { host: url.hostname.toLowerCase(), port: url.port || (protocol === 'PostgreSQL' ? '5432' : '6379') };
  } catch { return undefined; }
}
function httpEndpoint(raw: string): { host: string; port: string } | undefined {
  try {
    const url = new URL(raw);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return undefined;
    return { host: url.hostname.toLowerCase(), port: url.port || (url.protocol === 'https:' ? '443' : '80') };
  } catch { return undefined; }
}
function annotationEntries(content: string, pattern: RegExp): Array<{ line: number; args: string }> {
  const entries: Array<{ line: number; args: string }> = [];
  for (const match of content.matchAll(pattern)) {
    const start = match.index ?? 0;
    entries.push({ line: content.slice(0, start).split('\n').length, args: match[1] ?? '' });
  }
  return entries;
}
function javaStringLiteral(argument: string): string | undefined {
  const trimmed = argument.trim();
  const match = trimmed.match(/^"((?:\\.|[^"\\])*)"$/);
  return match?.[1];
}
function callArguments(content: string, openingParen: number): string[] | undefined {
  const args: string[] = [];
  let start = openingParen + 1, depth = 0, quote = '', escaped = false;
  for (let index = openingParen + 1; index < content.length; index += 1) {
    const char = content[index];
    if (escaped) { escaped = false; continue; }
    if (char === '\\' && quote) { escaped = true; continue; }
    if ((char === '"' || char === "'") && (!quote || quote === char)) { quote = quote ? '' : char; continue; }
    if (quote) continue;
    if (char === '(') { depth += 1; continue; }
    if (char === ')') {
      if (depth > 0) { depth -= 1; continue; }
      const last = content.slice(start, index).trim();
      if (last) args.push(last);
      return args;
    }
    if (char === ',' && depth === 0) { args.push(content.slice(start, index).trim()); start = index + 1; }
    if (char === '\n' && depth === 0) return undefined;
  }
  return undefined;
}
function safeRabbitName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) && !/secret|credential|password|token/i.test(value);
}
function kubernetesContainerImages(document: string): string[] {
  const images: string[] = [];
  let containersIndent = -1;
  let itemIndent = -1;
  for (const raw of document.split(/\r?\n/)) {
    const indent = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text === 'containers:') { containersIndent = indent; itemIndent = -1; continue; }
    if (containersIndent < 0 || !text) continue;
    if (indent <= containersIndent) { containersIndent = -1; itemIndent = -1; continue; }
    if (indent === containersIndent + 2 && /^-\s+name\s*:/.test(text)) { itemIndent = indent; continue; }
    if (itemIndent >= 0 && indent > itemIndent && indent <= itemIndent + 2) {
      const image = text.match(/^image:\s*([^\s#]+)/)?.[1];
      if (image) images.push(image);
    }
  }
  return images;
}

export async function discover(rootId: string, options: DiscoverOptions = {}): Promise<GraphDocument> {
  const root = await resolveRoot(rootId, options);
  const files = await walkFiles(root.path, options.limits);
  const descriptors = new Set(['']);
  for (const file of files) if (/(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?)$/i.test(file.path)) descriptors.add(dirname(file.path) === '.' ? '' : dirname(file.path));
  const moduleDirs = [...descriptors].sort((a, b) => a.length - b.length || a.localeCompare(b));
  const moduleFor = (filePath: string): string => moduleDirs.filter((directory) => directory === '' || filePath.startsWith(`${directory}/`)).sort((a, b) => b.length - a.length)[0] ?? '';
  const propsByModule = new Map<string, Array<{ file: ScannedFile; value: FlatValue }>>();
  for (const file of files.filter((entry) => /(?:^|\/)application\.(?:properties|ya?ml)$/i.test(entry.path))) {
    const owner = moduleFor(file.path);
    const values = configValues(file).map((value) => ({ file, value }));
    propsByModule.set(owner, [...(propsByModule.get(owner) ?? []), ...values]);
  }
  const serviceModules = new Map<string, ModuleInfo>();
  for (const file of files.filter((entry) => /\.(?:java|kt)$/i.test(entry.path))) {
    const clean = withoutComments(file.content);
    if (!/@(?:[\w.]+\.)?SpringBootApplication\b/.test(clean)) continue;
    const directory = moduleFor(file.path);
    const fallback = basename(directory) || basename(root.path) || 'service';
    const appValue = (propsByModule.get(directory) ?? []).find(({ value }) => value.key === 'spring.application.name')?.value.value;
    const name = serviceDisplay(appValue ?? fallback, fallback);
    const repository = directory || '.';
    const identity = `source-module:${repository}`;
    serviceModules.set(directory, { directory, name, id: nodeId('service', name, identity), repository });
  }

  const nodes = new Map<string, AtlasNode>();
  const findings: Finding[] = [];
  const ensure = (type: NodeType, name: string, identity: string, data: Record<string, JsonValue>): string => {
    const id = nodeId(type, name, identity);
    if (!nodes.has(id)) nodes.set(id, { id, type, position: { x: 0, y: 0 }, data: { name: name.slice(0, 100), ...data } });
    return id;
  };
  for (const service of serviceModules.values()) ensure('service', service.name, `source-module:${service.repository}`, { repository: service.repository });
  const ownerOf = (file: ScannedFile): ModuleInfo | undefined => serviceModules.get(moduleFor(file.path));
  const externalOrService = (raw: string, repository: string, port?: string): string | undefined => {
    const normalized = raw.toLowerCase().replace(/\.$/, '');
    for (const service of serviceModules.values()) {
      const moduleName = basename(service.directory).toLowerCase();
      const appName = service.name.toLowerCase();
      if (normalized === moduleName || normalized === appName) return service.id;
    }
    if (!/^[a-zA-Z0-9.-]{1,253}$/.test(raw)) return undefined;
    return ensure('external', raw.toLowerCase(), `external:${raw.toLowerCase()}:${port ?? ''}`, { repository, ...(port ? { port } : {}) });
  };
  const add = (from: string, to: string, protocol: string, file: ScannedFile, line: number, confidence: Evidence['confidence'], identity: string): void => {
    findings.push({ from, to, protocol, identity, evidence: { path: file.path, line, protocol, confidence } });
  };
  const infra = (type: 'database' | 'cache', host: string, port: string, repository: string): string => {
    const label = host;
    return ensure(type, label, `${type}:${host}:${port}`, { repository, port });
  };

  for (const file of files.filter((entry) => /\.(?:java|kt)$/i.test(entry.path))) {
    const owner = ownerOf(file);
    if (!owner) continue;
    const content = withoutComments(file.content);
    const codeLines = linesOf(file, content);
    for (const line of codeLines) {
      const text = line.text;
      const directUrl = text.match(/(?:getForObject|postForObject|exchange|\.uri)\s*\([^)]*["'](https?:\/\/[^"']+)/)?.[1];
      const webClientUrl = text.match(/(?:\.baseUrl|WebClient\.create)\s*\(\s*["'](https?:\/\/[^"']+)/)?.[1];
      if (directUrl || webClientUrl) {
        const endpoint = httpEndpoint(directUrl ?? webClientUrl ?? '');
        const target = endpoint ? externalOrService(endpoint.host, owner.repository, endpoint.port) : undefined;
        if (target) add(owner.id, target, 'HTTP', file, line.line, 'HIGH', `HTTP:${owner.id}:${target}`);
      }
    }
    for (const annotation of annotationEntries(content, /@(?:[\w.]+\.)?FeignClient\s*\(([\s\S]*?)\)/g)) {
      const targetName = annotation.args.match(/\b(?:name|value)\s*=\s*["']([^"']+)["']/)?.[1];
      const url = annotation.args.match(/\burl\s*=\s*["']([^"']+)["']/)?.[1];
      const placeholder = url?.match(/^\$\{(clients\.[A-Za-z0-9_-]+\.url)\}$/)?.[1];
      const configuredValue = placeholder ? (propsByModule.get(moduleFor(file.path)) ?? []).find(({ value }) => value.key === placeholder) : undefined;
      const endpoint = url && !placeholder ? httpEndpoint(url) : configuredValue ? httpEndpoint(configuredValue.value.value) : undefined;
      const alias = url ? undefined : targetName;
      const target = endpoint ? externalOrService(endpoint.host, owner.repository, endpoint.port) : !url && alias ? externalOrService(alias, owner.repository) : undefined;
      if (target) {
        if (placeholder && configuredValue) add(owner.id, target, 'HTTP', configuredValue.file, configuredValue.value.line, 'MEDIUM', `HTTP:${owner.id}:${target}`);
        else add(owner.id, target, 'HTTP', file, annotation.line, 'HIGH', `HTTP:${owner.id}:${target}`);
      }
    }
    for (const annotation of annotationEntries(content, /@(?:[\w.]+\.)?(?:HttpExchange|GetExchange|PostExchange|PutExchange|DeleteExchange)\s*\(([\s\S]*?)\)/g)) {
      const url = annotation.args.match(/["'](https?:\/\/[^"']+)["']/)?.[1];
      if (!url) continue;
      const endpoint = httpEndpoint(url);
      const target = endpoint ? externalOrService(endpoint.host, owner.repository, endpoint.port) : undefined;
      if (target) add(owner.id, target, 'HTTP', file, annotation.line, 'HIGH', `HTTP:${owner.id}:${target}`);
    }

    const kafkaVariables = new Set([...content.matchAll(/KafkaTemplate(?:\s*<[^;()]+>)?\s+(\w+)/g)].map((match) => match[1]));
    const rabbitVariables = new Set([...content.matchAll(/RabbitTemplate\s+(\w+)/g)].map((match) => match[1]));
    for (const line of codeLines) {
      const kafkaSend = line.text.match(/\b(\w+)\s*\.\s*send\s*\(\s*["']([^"']+)["']/);
      if (kafkaSend && kafkaVariables.has(kafkaSend[1])) {
        const topicName = kafkaSend[2];
        const topic = ensure('topic', topicName, `topic:Kafka:${topicName}`, { repository: owner.repository, broker: 'Kafka' });
        add(owner.id, topic, 'Kafka', file, line.line, 'HIGH', `Kafka:${owner.id}:${topic}`);
      }
      for (const invocation of line.text.matchAll(/\b(\w+)\s*\.\s*convertAndSend\s*\(/g)) {
        if (!rabbitVariables.has(invocation[1])) continue;
        const openingParen = (invocation.index ?? 0) + invocation[0].lastIndexOf('(');
        const args = callArguments(line.text, openingParen);
        if (!args || (args.length !== 2 && args.length !== 3)) continue;
        const first = javaStringLiteral(args[0]);
        if (!first || !safeRabbitName(first)) continue;
        if (args.length === 2) {
          if (!args[1]) continue;
          const queue = ensure('topic', first, `queue:RabbitMQ:${first}`, { repository: owner.repository, broker: 'RabbitMQ', subtype: 'queue' });
          add(owner.id, queue, 'RabbitMQ', file, line.line, 'HIGH', `RabbitMQ:${owner.id}:${queue}`);
          continue;
        }
        const routingKey = javaStringLiteral(args[1]);
        if (!routingKey || !safeRabbitName(routingKey) || !args[2]) continue;
        const destinationName = `${first} → ${routingKey}`;
        const destination = ensure('topic', destinationName, `exchange-routing-key:RabbitMQ:${first}:${routingKey}`, {
          repository: owner.repository, broker: 'RabbitMQ', subtype: 'exchange-routing-key', exchange: first, routingKey,
        });
        add(owner.id, destination, 'RabbitMQ', file, line.line, 'HIGH', `RabbitMQ:${owner.id}:${destination}`);
      }
    }
    for (const annotation of annotationEntries(content, /@(?:[\w.]+\.)?KafkaListener\s*\(([\s\S]*?)\)/g)) {
      const name = annotation.args.match(/\b(?:topics?|value)\s*=\s*["']([^"']+)["']/)?.[1];
      if (!name) continue;
      const topic = ensure('topic', name, `topic:Kafka:${name}`, { repository: owner.repository, broker: 'Kafka' });
      add(topic, owner.id, 'Kafka', file, annotation.line, 'HIGH', `Kafka:${topic}:${owner.id}`);
    }
    for (const annotation of annotationEntries(content, /@(?:[\w.]+\.)?RabbitListener\s*\(([\s\S]*?)\)/g)) {
      const name = annotation.args.match(/\b(?:queues?|value)\s*=\s*["']([^"']+)["']/)?.[1];
      if (!name) continue;
      if (!safeRabbitName(name)) continue;
      const topic = ensure('topic', name, `queue:RabbitMQ:${name}`, { repository: owner.repository, broker: 'RabbitMQ', subtype: 'queue' });
      add(topic, owner.id, 'RabbitMQ', file, annotation.line, 'HIGH', `RabbitMQ:${topic}:${owner.id}`);
    }
  }

  for (const [module, values] of propsByModule) {
    const service = serviceModules.get(module);
    if (!service) continue;
    const seen = new Set<string>();
    for (const { file, value } of values) {
      let protocol: 'PostgreSQL' | 'Redis' | undefined;
      let endpoint: { host: string; port: string } | undefined;
      if (/^spring\.datasource\.(?:url|hikari\.jdbc-url|hikari\.jdbcUrl)$/i.test(value.key) && /^jdbc:postgres(?:ql)?:\/\//i.test(value.value)) {
        protocol = 'PostgreSQL'; endpoint = hostPort(value.value, protocol);
      } else if (/^spring\.(?:data\.redis|redis)\.url$/i.test(value.key)) {
        protocol = 'Redis'; endpoint = hostPort(value.value, protocol);
      }
      if (protocol && endpoint) {
        const target = infra(protocol === 'PostgreSQL' ? 'database' : 'cache', endpoint.host, endpoint.port, service.repository);
        const edgeKey = `${protocol}:${service.id}:${target}`;
        if (!seen.has(edgeKey)) add(service.id, target, protocol, file, value.line, 'MEDIUM', edgeKey);
        seen.add(edgeKey);
        continue;
      }
      const redisHostKey = /^spring\.(?:data\.redis|redis)\.host$/i.test(value.key);
      if (redisHostKey && /^[a-zA-Z0-9.-]{1,253}$/.test(value.value)) {
        const port = values.find((candidate) => candidate.value.key.toLowerCase() === value.key.replace(/host$/i, 'port').toLowerCase())?.value.value ?? '6379';
        const target = infra('cache', value.value.toLowerCase(), /^[0-9]{1,5}$/.test(port) ? port : '6379', service.repository);
        const edgeKey = `Redis:${service.id}:${target}`;
        if (!seen.has(edgeKey)) add(service.id, target, 'Redis', file, value.line, 'MEDIUM', edgeKey);
        seen.add(edgeKey);
      }
    }
  }

  for (const file of files.filter((entry) => /(?:^|\/)(?:compose|docker-compose)\.ya?ml$/i.test(entry.path))) {
    let inServices = false;
    let current: { name: string; indent: number; image?: string; line: number } | undefined;
    const services: Array<{ name: string; image?: string; line: number }> = [];
    for (const { line, text: rawText } of rawLines(file)) {
      const text = rawText.trimEnd();
      if (!text.trim()) continue;
      const indent = text.length - text.trimStart().length;
      if (indent === 0 && text.trim() === 'services:') { inServices = true; current = undefined; continue; }
      if (!inServices) continue;
      if (indent === 0) { inServices = false; current = undefined; continue; }
      const serviceDecl = text.match(/^\s{2}([A-Za-z0-9_-]+):\s*$/);
      if (serviceDecl) {
        if (current) services.push(current);
        current = { name: serviceDecl[1], indent: 2, line };
      } else if (current && indent === current.indent + 2) {
        const image = text.match(/^\s+image:\s*([^\s#]+)/)?.[1];
        if (image) current.image = image;
      }
    }
    if (current) services.push(current);
    for (const item of services) {
      const image = item.image?.split(':')[0].toLowerCase().split('/').at(-1);
      const type: NodeType = image?.includes('postgres') ? 'database' : image?.includes('redis') ? 'cache' : 'service';
      ensure(type, item.name, `compose:${file.path}:${item.name}`, { repository: '.' });
    }
  }

  for (const file of files.filter((entry) => /(?:deploy|k8s|kubernetes).*\.ya?ml$/i.test(entry.path))) {
    for (const document of file.content.split(/^---\s*$/m)) {
      const props = configValues({ ...file, content: document });
      const kind = props.find((value) => value.key === 'kind')?.value;
      const name = props.find((value) => value.key === 'metadata.name')?.value;
      if (name && (kind === 'Service' || kind === 'Deployment' || kind === 'StatefulSet')) {
        ensure('service', name, `kubernetes:${file.path}:${kind}:${name}`, { repository: '.' });
      }
      if (kind === 'Deployment' || kind === 'StatefulSet') {
        for (const rawImage of kubernetesContainerImages(document)) {
          const image = rawImage.split(':')[0].toLowerCase().split('/').at(-1) ?? '';
          if (image.includes('postgres')) ensure('database', 'postgresql', `kubernetes-image:postgresql`, { repository: '.' });
          if (image.includes('redis')) ensure('cache', 'redis', `kubernetes-image:redis`, { repository: '.' });
        }
      }
    }
  }

  const edgeMap = new Map<string, AtlasEdge>();
  for (const finding of findings) {
    const id = `edge:${hash(finding.identity)}`;
    const existing = edgeMap.get(id);
    if (existing) existing.evidence.push(finding.evidence);
    else edgeMap.set(id, { id, source: finding.from, target: finding.to, protocol: finding.protocol, evidence: [finding.evidence] });
  }
  const orderedNodes = [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  orderedNodes.forEach((node, index) => { node.position = { x: (index % 4) * 240, y: Math.floor(index / 4) * 140 }; });
  return validateGraph({ version: 1, nodes: orderedNodes, edges: [...edgeMap.values()].sort((a, b) => a.id.localeCompare(b.id)) });
}
