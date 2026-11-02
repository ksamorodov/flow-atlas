import { NODE_TYPES } from './shared/graph.ts';
import type { AtlasEdge, AtlasNode, GraphDocument } from './shared/graph.ts';
import { stepSimulation } from './shared/simulation.ts';
import { createPreset } from './shared/presets.ts';
import { createGraphStore } from './store/graph-store.ts';
import { selectVisibleGraph, summarizeMetrics } from './store/selectors.ts';
import { GraphView } from './graph-view.tsx';
import './styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing');
const appRoot: HTMLElement = root;
appRoot.innerHTML = `<div class="app">
  <aside class="sidebar"><div class="brand"><div class="brand-mark">✣</div><span class="brand-name">FLOW ATLAS</span></div><div><div class="side-label">Workspace</div><div class="nav-item active"><span>⌘ &nbsp; Architecture map</span></div><div class="nav-item"><span>◷ &nbsp; Recent scans</span></div></div><div class="side-bottom"><strong>Local-first by design</strong>Your source never leaves this machine. Discovery runs against explicitly allowed directories.</div></aside>
  <header class="topbar"><div class="crumb">Workspace &nbsp;/&nbsp; <strong>Architecture studio</strong></div><div class="top-actions"><div class="switcher" aria-label="Graph presets"><button class="active" data-action="preset" data-preset="microservices">E-commerce</button><button data-action="preset" data-preset="event-driven">Event-driven</button></div><div class="live"><i></i><span>Simulation live</span></div></div></header>
  <main class="workspace"><div class="metricbar" aria-label="Live simulation metrics"><div class="metric"><div class="metric-label">Ingress throughput</div><div class="metric-value" data-testid="metric-rps">— <small>req/s</small></div></div><div class="metric"><div class="metric-label">Error rate</div><div class="metric-value" data-testid="metric-error">— <small>%</small></div></div><div class="metric"><div class="metric-label">Weighted latency</div><div class="metric-value" data-testid="metric-latency">— <small>ms</small></div></div><div class="metric"><div class="metric-label">System health</div><div class="metric-value health-value"><i class="health-dot"></i><span data-testid="metric-health">Healthy</span></div></div><div class="status-line" data-testid="simulation-tick">Educational model · seeded frame</div></div>
    <div class="content"><section class="canvas-wrap" aria-label="Architecture canvas"><div class="toolbar"><button class="primary" data-action="add" data-testid="add-node">＋ Add</button><button data-action="connect" data-testid="connect-mode">↗ Connect</button><span class="toolbar-sep"></span><button data-action="discovery" data-testid="open-discovery">⌕ Discover</button><button data-action="import">Import</button><button data-action="export" data-testid="export-graph">Export</button></div><div class="zoom"><button data-action="zoom-out" aria-label="Zoom out">−</button><button data-action="zoom-in" aria-label="Zoom in">＋</button><button data-action="fit">Fit</button></div><div class="canvas-hint">Drag to arrange · scroll to zoom · drag background to pan</div><div class="legend"><span><i class="legend-service"></i>Services</span><span><i class="legend-data"></i>Data</span><span><i class="legend-event"></i>Events</span></div><div id="graph" class="graph-host"></div><div id="toast" class="toast" role="status" hidden></div></section>
    <aside class="inspector" aria-label="Inspector"><div class="inspector-head"><div class="eyebrow" data-testid="inspector-kind">Node inspector</div><button class="icon-button" data-action="clear-selection" aria-label="Close inspector selection">×</button></div><div id="inspector-body"></div><div class="section"><div class="section-title">Repository filters <span id="filter-count"></span></div><div id="filters" class="filters"></div></div><div class="section"><div class="section-title">Simulation controls</div><label class="field">Traffic intensity <span id="intensity-label">5 / 10</span><input data-testid="intensity" type="range" min="0" max="10" value="5"></label><div class="row"><button class="subtle-button" data-action="pause" data-testid="pause-simulation">Ⅱ Pause</button><button class="subtle-button" data-action="retry" data-testid="retry-toggle">↻ Retries on</button></div><div class="row"><button class="subtle-button danger" data-action="fail" data-testid="fail-node">Fail selected</button><button class="subtle-button" data-action="recover" data-testid="recover-node">Recover</button></div><p>Deterministic educational model · failures propagate upstream.</p></div></aside></div></main>
  </div><div class="discovery" id="discovery" hidden><section class="drawer" aria-label="Source discovery"><div class="drawer-top"><span class="eyebrow">Repository discovery</span><button class="icon-button" data-action="close-discovery" aria-label="Close discovery">×</button></div><h2>Import from Source Directory</h2><p>Select a pre-approved local root. Flow Atlas reads safe, bounded metadata only; configure additional roots server-side.</p><label class="field" for="root-select">Allowed source directory</label><select id="root-select" class="select-control"><option>Loading allowed roots…</option></select><p id="discovery-status" class="status-line">No source files are sent to a remote service.</p><button class="toolbar primary" data-action="run-discovery" data-testid="run-discovery">Discover architecture</button></section></div><input type="file" id="import-file" accept="application/json,.json" hidden></div>`;

const store = createGraphStore(createPreset('microservices'));
let frame = stepSimulation(store.getState().graph, store.getState().simulation, 1847, 0);
let connectMode = false, retryEnabled = true, rootId = '', toastTimer = 0;
const graphHost = appRoot.querySelector<HTMLElement>('#graph')!;
const view = new GraphView(graphHost, store, () => frame.nodes);
const inspector = appRoot.querySelector<HTMLElement>('#inspector-body')!;
const filtersEl = appRoot.querySelector<HTMLElement>('#filters')!;
let inspectorGraph: GraphDocument | null = null, inspectorNodeId: string | null = null, inspectorEdgeId: string | null = null;
let filtersGraph: GraphDocument | null = null;
let renderedFilters: ReturnType<typeof store.getState>['filters'] | null = null;
const names: Record<string, string> = { service: 'Microservice', database: 'PostgreSQL', cache: 'Redis', topic: 'Kafka topic', external: 'External API', gateway: 'API Gateway' };
const safeText = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
function showToast(message: string, error = false) { const toast = appRoot.querySelector<HTMLElement>('#toast')!; toast.textContent = message; toast.classList.toggle('error', error); toast.hidden = false; window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3400); }
function button(action: string, title: string, klass = 'subtle-button') { const element = document.createElement('button'); element.type = 'button'; element.className = klass; element.dataset.action = action; element.textContent = title; return element; }
function field(label: string, value: string, testId: string) { const wrap = document.createElement('label'); wrap.className = 'field'; wrap.textContent = label; const input = document.createElement('input'); input.value = value; input.dataset.testid = testId; wrap.append(input); return { wrap, input }; }
function renderFilters() {
  const state = store.getState(), graph = state.graph;
  if (filtersGraph === graph && renderedFilters === state.filters) return;
  filtersGraph = graph; renderedFilters = state.filters;
  const protocols = [...new Set(graph.edges.flatMap((edge) => [edge.protocol ?? 'manual', ...edge.evidence.map((item) => item.protocol)]))].sort();
  const repositories = [...new Set(graph.nodes.flatMap((node) => typeof node.data.repository === 'string' ? [node.data.repository] : []))].sort();
  filtersEl.replaceChildren(); const filters = state.filters;
  for (const [category, values] of [['protocols', protocols], ['confidences', ['HIGH', 'MEDIUM', 'LOW']], ['repositories', repositories]] as const) for (const value of values) {
    const chip = button('filter', value, `filter-chip${filters[category].includes(value) ? ' active' : ''}`); chip.dataset.category = category; chip.dataset.value = value; filtersEl.append(chip);
  }
  const visible = selectVisibleGraph(graph, filters); appRoot.querySelector('#filter-count')!.textContent = `· ${visible.edges.length}/${graph.edges.length} edges`;
}
function renderInspector() {
  const state = store.getState(), node = state.graph.nodes.find((item) => item.id === state.selectedNodeId), edge = state.graph.edges.find((item) => item.id === state.selectedEdgeId);
  if (inspectorGraph === state.graph && inspectorNodeId === state.selectedNodeId && inspectorEdgeId === state.selectedEdgeId) {
    if (node) updateInspectorMetrics(node);
    return;
  }
  inspectorGraph = state.graph; inspectorNodeId = state.selectedNodeId; inspectorEdgeId = state.selectedEdgeId;
  inspector.replaceChildren();
  const kind = appRoot.querySelector<HTMLElement>('[data-testid="inspector-kind"]')!; kind.textContent = edge ? 'Dependency inspector' : 'Node inspector';
  if (edge) { renderEdgeInspector(edge); return; }
  if (!node) { const h = document.createElement('h2'); h.textContent = 'Select a service'; inspector.append(h); const p = document.createElement('p'); p.textContent = 'Choose any node to inspect its runtime health, dependencies, and source evidence.'; inspector.append(p); return; }
  const metric = frame.nodes.find((entry) => entry.id === node.id), title = document.createElement('h2'); title.textContent = safeText(node.data.label, safeText(node.data.name, node.id)); inspector.append(title);
  const type = document.createElement('span'); type.className = 'type-tag'; type.textContent = names[node.type] ?? node.type; inspector.append(type);
  const p = document.createElement('p'); p.dataset.testid = 'inspector-status'; p.textContent = `${safeText(node.data.repository, 'Manual node')} · ${metric?.status ?? 'healthy'} · ${node.id}`; inspector.append(p);
  const grid = document.createElement('div'); grid.className = 'detail-grid'; for (const [name, value] of [['Throughput', `${metric?.rps ?? 0} req/s`], ['Latency', `${metric?.latencyMs ?? 0} ms`], ['Error rate', `${Math.round((metric?.errorRate ?? 0) * 100)}%`], ['Dependencies', `${state.graph.edges.filter((item) => item.source === node.id || item.target === node.id).length}`]]) { const cell = document.createElement('div'); cell.className = 'detail-cell'; const caption = document.createElement('span'); caption.textContent = name; const content = document.createElement('strong'); if (name !== 'Dependencies') content.dataset.metricValue = name; content.textContent = value; cell.append(caption, content); grid.append(cell); } inspector.append(grid);
  const edit = document.createElement('div'); edit.className = 'section'; const heading = document.createElement('div'); heading.className = 'section-title'; heading.textContent = 'Service details'; edit.append(heading);
  const labelField = field('Display name', safeText(node.data.label, safeText(node.data.name, node.id)), 'edit-node-label'); labelField.input.addEventListener('change', () => store.renameNode(node.id, labelField.input.value)); edit.append(labelField.wrap);
  const typeField = document.createElement('label'); typeField.className = 'field'; typeField.textContent = 'Node type'; const select = document.createElement('select'); select.dataset.testid = 'edit-node-type'; for (const typeName of NODE_TYPES) { const option = document.createElement('option'); option.value = typeName; option.textContent = names[typeName] ?? typeName; option.selected = node.type === typeName; select.append(option); } select.addEventListener('change', () => store.changeNodeType(node.id, select.value as typeof node.type)); typeField.append(select); edit.append(typeField);
  const conn = document.createElement('div'); conn.className = 'section'; const connTitle = document.createElement('div'); connTitle.className = 'section-title'; connTitle.textContent = 'Connections'; conn.append(connTitle); const incoming = state.graph.edges.filter((item) => item.target === node.id), outgoing = state.graph.edges.filter((item) => item.source === node.id); const stats = document.createElement('p'); stats.textContent = `${incoming.length} incoming · ${outgoing.length} outgoing`; conn.append(stats);
  const evidence = document.createElement('div'); evidence.className = 'section'; const evidenceTitle = document.createElement('div'); evidenceTitle.className = 'section-title'; evidenceTitle.textContent = 'Dependency evidence'; evidence.append(evidenceTitle); const related = state.graph.edges.filter((item) => item.source === node.id || item.target === node.id); if (!related.length) { const empty = document.createElement('div'); empty.className = 'empty-evidence'; empty.textContent = 'No dependency evidence attached. Manual relationships are never represented as source findings.'; evidence.append(empty); } else for (const item of related) { const itemButton = button('select-edge', `${item.source} → ${item.target} · ${(item.protocol ?? 'manual').toUpperCase()}`, 'evidence-item'); itemButton.dataset.edgeId = item.id; const small = document.createElement('small'); small.textContent = item.evidence.length ? `${item.evidence.length} source ${item.evidence.length === 1 ? 'reference' : 'references'} · inspect all evidence` : 'Manual edge · no source evidence'; itemButton.append(small); evidence.append(itemButton); }
  inspector.append(edit, conn, evidence);
  const actionRow = document.createElement('div'); actionRow.className = 'section'; const remove = button('delete-node', 'Delete node and dependencies', 'subtle-button danger'); remove.dataset.testid = 'delete-node'; actionRow.append(remove); inspector.append(actionRow);
}
function updateInspectorMetrics(node: AtlasNode) {
  const metric = frame.nodes.find((entry) => entry.id === node.id);
  const status = inspector.querySelector<HTMLElement>('[data-testid="inspector-status"]');
  if (status) status.textContent = `${safeText(node.data.repository, 'Manual node')} · ${metric?.status ?? 'healthy'} · ${node.id}`;
  const values: Record<string, string> = {
    Throughput: `${metric?.rps ?? 0} req/s`, Latency: `${metric?.latencyMs ?? 0} ms`,
    'Error rate': `${Math.round((metric?.errorRate ?? 0) * 100)}%`,
  };
  for (const [label, value] of Object.entries(values)) {
    const element = inspector.querySelector<HTMLElement>(`[data-metric-value="${label}"]`);
    if (element) element.textContent = value;
  }
}
function renderEdgeInspector(edge: AtlasEdge) {
  const title = document.createElement('h2'); title.textContent = `${edge.source} → ${edge.target}`; inspector.append(title); const tag = document.createElement('span'); tag.className = 'type-tag'; tag.textContent = (edge.protocol ?? 'manual').toUpperCase(); inspector.append(tag);
  const p = document.createElement('p'); p.textContent = 'Directed dependency · evidence is read-only and preserved through filters and graph import/export.'; inspector.append(p);
  const source = field('Source node', edge.source, 'edge-source'); const target = field('Target node', edge.target, 'edge-target'); source.input.readOnly = true; target.input.readOnly = true; const row = document.createElement('div'); row.className = 'row'; row.append(source.wrap, target.wrap); inspector.append(row);
  const list = document.createElement('div'); list.className = 'section'; const heading = document.createElement('div'); heading.className = 'section-title'; heading.textContent = `All evidence · ${edge.evidence.length}`; list.append(heading);
  if (!edge.evidence.length) { const empty = document.createElement('div'); empty.className = 'empty-evidence'; empty.textContent = 'Manual relationship — no source evidence was discovered for this edge.'; list.append(empty); }
  else { const items = document.createElement('div'); items.className = 'evidence'; for (const finding of edge.evidence) { const item = document.createElement('button'); item.className = 'evidence-item'; item.type = 'button'; item.dataset.testid = 'evidence-item'; item.textContent = `${finding.path}:${finding.line}`; const small = document.createElement('small'); small.textContent = `${finding.protocol} · ${finding.confidence} confidence${finding.snippet ? ` · ${finding.snippet}` : ''}`; item.append(small); item.addEventListener('click', () => showToast(`Read-only reference · ${finding.path}:${finding.line}`)); items.append(item); } list.append(items); }
  inspector.append(list); const del = button('delete-edge', 'Remove dependency', 'subtle-button danger'); inspector.append(del);
}
function renderMetrics() {
  const totals = summarizeMetrics(frame); appRoot.querySelector('[data-testid="metric-rps"]')!.innerHTML = `${totals.ingressRps} <small>req/s</small>`;
  appRoot.querySelector('[data-testid="metric-error"]')!.innerHTML = `${(totals.errorRate * 100).toFixed(1)} <small>%</small>`; appRoot.querySelector('[data-testid="metric-latency"]')!.innerHTML = `${totals.latencyMs} <small>ms</small>`;
  const health = appRoot.querySelector<HTMLElement>('[data-testid="metric-health"]')!, dot = appRoot.querySelector<HTMLElement>('.health-dot')!; health.textContent = totals.health[0]!.toUpperCase() + totals.health.slice(1); dot.className = `health-dot ${totals.health}`; appRoot.querySelector('[data-testid="simulation-tick"]')!.textContent = `Educational model · frame ${frame.tick}`;
  appRoot.querySelector<HTMLElement>('[data-testid="pause-simulation"]')!.textContent = store.getState().simulation.paused ? '▶ Resume' : 'Ⅱ Pause';
  appRoot.querySelector<HTMLElement>('[data-testid="retry-toggle"]')!.textContent = retryEnabled ? '↻ Retries on' : '↻ Retries off';
  appRoot.querySelector<HTMLElement>('#intensity-label')!.textContent = `${store.getState().simulation.intensity} / 10`;
}
function render() { renderMetrics(); renderInspector(); renderFilters(); view.render(); }
let observedGraph = store.getState().graph;
store.subscribe(() => {
  const state = store.getState();
  if (state.graph !== observedGraph) {
    observedGraph = state.graph;
    frame = stepSimulation(state.graph, state.simulation, 1847, state.tick);
  }
  render();
});

async function loadRoots() {
  const status = appRoot.querySelector<HTMLElement>('#discovery-status')!, select = appRoot.querySelector<HTMLSelectElement>('#root-select')!;
  try { const response = await fetch('/api/roots'); if (!response.ok) throw new Error('Could not load allowed roots'); const body: unknown = await response.json(); if (!body || typeof body !== 'object' || !Array.isArray((body as { roots?: unknown }).roots)) throw new Error('Invalid root list'); select.replaceChildren(); for (const entry of (body as { roots: Array<{ id: string; label: string }> }).roots) { if (typeof entry.id !== 'string' || typeof entry.label !== 'string') continue; const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.label; select.append(option); } rootId = select.value; if (!rootId) throw new Error('No allowed roots are configured'); status.textContent = `${select.options.length} approved source ${select.options.length === 1 ? 'root' : 'roots'} available.`; }
  catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not load allowed roots.'; }
}
function openImport() {
  const back = document.createElement('div'); back.className = 'modal-back'; back.dataset.testid = 'import-modal'; const modal = document.createElement('section'); modal.className = 'modal'; const title = document.createElement('h2'); title.textContent = 'Import graph JSON'; const note = document.createElement('p'); note.className = 'status-line'; note.textContent = 'Validated graph documents up to 1 MB. Invalid imports leave the current map unchanged.'; const area = document.createElement('textarea'); area.dataset.testid = 'import-json'; area.setAttribute('aria-label', 'Graph JSON'); area.value = JSON.stringify(store.getState().graph, null, 2); const actions = document.createElement('div'); actions.className = 'modal-actions'; const cancel = button('cancel-import', 'Cancel'); const apply = button('apply-import', 'Validate and import', 'toolbar primary'); actions.append(cancel, apply); modal.append(title, note, area, actions); back.append(modal); appRoot.append(back); }

appRoot.addEventListener('click', async (event) => {
  const target = (event.target as Element).closest<HTMLElement>('[data-action]'); if (!target) return;
  const action = target.dataset.action;
  try {
    if (action === 'add') { const type = window.prompt('Add node: gateway, service, database, cache, topic, external', 'service'); if (type && NODE_TYPES.includes(type as typeof NODE_TYPES[number])) { const graph = store.getState().graph, x = graph.nodes.length ? Math.max(...graph.nodes.map((node) => node.position.x)) + 230 : 80; store.addNode(type as typeof NODE_TYPES[number], { x, y: 60 }); showToast(`${names[type] ?? type} added`); } }
    if (action === 'connect') { connectMode = !connectMode; target.textContent = connectMode ? 'Select endpoints…' : '↗ Connect'; target.classList.toggle('primary', connectMode); if (connectMode) openConnectDialog(); }
    if (action === 'discovery') { appRoot.querySelector('#discovery')!.removeAttribute('hidden'); await loadRoots(); }
    if (action === 'close-discovery') appRoot.querySelector<HTMLElement>('#discovery')!.hidden = true;
    if (action === 'run-discovery') { const buttonEl = target; const select = appRoot.querySelector<HTMLSelectElement>('#root-select')!; buttonEl.setAttribute('disabled', ''); appRoot.querySelector<HTMLElement>('#discovery-status')!.textContent = 'Scanning approved source…'; try { const response = await fetch('/api/discover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rootId: select.value }) }); const data: unknown = await response.json(); if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Discovery failed'); store.replaceGraph(data as Parameters<typeof store.replaceGraph>[0]); appRoot.querySelector<HTMLElement>('#discovery')!.hidden = true; view.fit(); showToast('Architecture discovered · source evidence preserved'); } finally { buttonEl.removeAttribute('disabled'); } }
    if (action === 'import') openImport();
    if (action === 'export') { const blob = new Blob([JSON.stringify(store.getState().graph, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'flow-atlas-graph.json'; link.click(); URL.revokeObjectURL(url); showToast('Exported complete graph document'); }
    if (action === 'preset') { store.loadPreset(target.dataset.preset as 'microservices' | 'event-driven'); for (const item of appRoot.querySelectorAll('[data-action="preset"]')) item.classList.toggle('active', item === target); view.fit(); }
    if (action === 'zoom-in') view.setZoom(.15); if (action === 'zoom-out') view.setZoom(-.15); if (action === 'fit') view.fit();
    if (action === 'pause') store.setSimulation({ paused: !store.getState().simulation.paused });
    if (action === 'retry') { retryEnabled = !retryEnabled; store.setSimulation({ retryLimit: retryEnabled ? 2 : 0 }); }
    if (action === 'fail' || action === 'recover') { const id = store.getState().selectedNodeId; if (id) { const failures = new Set(store.getState().simulation.failedNodeIds ?? []); action === 'fail' ? failures.add(id) : failures.delete(id); store.setSimulation({ failedNodeIds: [...failures] }); store.advanceTick(); frame = stepSimulation(store.getState().graph, store.getState().simulation, 1847, store.getState().tick); render(); } }
    if (action === 'delete-node') { const selectedNodeId = store.getState().selectedNodeId; if (selectedNodeId) store.deleteNode(selectedNodeId); }
    if (action === 'delete-edge') { const id = store.getState().selectedEdgeId; if (id) { store.deleteEdge(id); store.selectNode(null); } }
    if (action === 'select-edge') store.selectEdge(target.dataset.edgeId ?? null);
    if (action === 'clear-selection') { store.selectNode(null); store.selectEdge(null); }
    if (action === 'filter') { const { category, value } = target.dataset; if (!category || !value || !['protocols', 'confidences', 'repositories'].includes(category)) return; const filters = structuredClone(store.getState().filters), list = filters[category as keyof typeof filters], i = list.indexOf(value); if (i >= 0) list.splice(i, 1); else list.push(value); store.setFilters(filters); }
    if (action === 'cancel-import') appRoot.querySelector('[data-testid="import-modal"]')?.remove();
    if (action === 'apply-import') { const input = appRoot.querySelector<HTMLTextAreaElement>('[data-testid="import-json"]')!; store.importJson(input.value); appRoot.querySelector('[data-testid="import-modal"]')?.remove(); view.fit(); showToast('Validated graph imported'); }
  } catch (error) { const message = error instanceof Error ? error.message : 'Action failed'; showToast(message, true); const status = appRoot.querySelector<HTMLElement>('#discovery-status'); if (status && action === 'run-discovery') status.textContent = message; }
});

function openConnectDialog() {
  const nodes = store.getState().graph.nodes; if (nodes.length < 2) { showToast('Add at least two nodes to connect', true); return; }
  const back = document.createElement('div'); back.className = 'modal-back'; back.dataset.testid = 'connect-modal'; const modal = document.createElement('section'); modal.className = 'modal'; const title = document.createElement('h2'); title.textContent = 'Create directed dependency'; const row = document.createElement('div'); row.className = 'row'; const source = document.createElement('select'), target = document.createElement('select'); source.dataset.testid = 'connect-source'; target.dataset.testid = 'connect-target'; for (const node of nodes) for (const select of [source, target]) { const option = document.createElement('option'); option.value = node.id; option.textContent = safeText(node.data.label, node.id); select.append(option); } if (nodes[1]) target.value = nodes[1].id; const protocol = document.createElement('select'); protocol.dataset.testid = 'connect-protocol'; for (const item of ['http', 'https', 'postgres', 'redis', 'kafka', 'rabbitmq', 'manual']) { const option = document.createElement('option'); option.value = item; option.textContent = item; protocol.append(option); } const actions = document.createElement('div'); actions.className = 'modal-actions'; const cancel = button('cancel-connect', 'Cancel'), apply = button('apply-connect', 'Create directed edge', 'toolbar primary'); actions.append(cancel, apply); const fields = document.createElement('div'); fields.className = 'row'; fields.append(source, target, protocol); modal.append(title, fields, actions); back.append(modal); appRoot.append(back); connectMode = false; appRoot.querySelector('[data-action="connect"]')!.classList.remove('primary'); appRoot.querySelector('[data-action="connect"]')!.textContent = '↗ Connect';
}
appRoot.addEventListener('click', (event) => { const target = (event.target as Element).closest<HTMLElement>('[data-action]'); if (!target) return; if (target.dataset.action === 'cancel-connect') appRoot.querySelector('[data-testid="connect-modal"]')?.remove(); if (target.dataset.action === 'apply-connect') { const source = appRoot.querySelector<HTMLSelectElement>('[data-testid="connect-source"]')!, dest = appRoot.querySelector<HTMLSelectElement>('[data-testid="connect-target"]')!, protocol = appRoot.querySelector<HTMLSelectElement>('[data-testid="connect-protocol"]')!; store.connect(source.value, dest.value, protocol.value); appRoot.querySelector('[data-testid="connect-modal"]')?.remove(); showToast('Directed dependency created'); } });
appRoot.addEventListener('input', (event) => { const target = event.target as HTMLInputElement; if (target.dataset.testid === 'intensity') store.setSimulation({ intensity: Number(target.value) }); });
appRoot.querySelector<HTMLSelectElement>('#root-select')!.addEventListener('change', (event) => { rootId = (event.target as HTMLSelectElement).value; });
appRoot.querySelector<HTMLInputElement>('#import-file')!.addEventListener('change', async (event) => { const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file) return; try { if (file.size > 1_000_000) throw new Error('Import must be at most 1 MB'); store.importJson(await file.text()); showToast('Validated graph imported'); view.fit(); } catch (error) { showToast(error instanceof Error ? error.message : 'Invalid graph file', true); } finally { input.value = ''; } });
appRoot.querySelector('[data-action="import"]')?.addEventListener('contextmenu', (event) => { event.preventDefault(); appRoot.querySelector<HTMLInputElement>('#import-file')!.click(); });
window.setInterval(() => { if (store.getState().simulation.paused) return; store.advanceTick(); frame = stepSimulation(store.getState().graph, store.getState().simulation, 1847, store.getState().tick, frame); render(); }, 800);
render(); window.requestAnimationFrame(() => view.fit());
