import { connectHost, HostRequestError } from '@openchamber/sdk';
import { applyHostReady, mountButton, mountEmpty } from '@openchamber/sdk/ui';

import type {
  ContainerRow,
  ImageRow,
  VolumeRow,
  NetworkRow,
  InspectView,
  FsListing,
  FsFile,
  LogsView,
  ExecResult,
  MainTabId,
  FilterId,
  ViewMode,
  PublishedPort,
  FsEntry,
  SystemDfItem,
} from './types.ts';
import { renderTabs, renderStatsGroup, renderSystemView } from './components/CatalogView.ts';
import { renderExecView } from './components/ExecView.ts';
import { renderLogsView, updateLogsContent } from './components/LogsView.ts';
import { renderFsView } from './components/FsView.ts';
import { renderInspectView } from './components/InspectView.ts';

const LOG_TAIL_DEFAULT = 200;
const LOG_POLL_MS = 2000;

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root');
}

const host = connectHost();
let loadGeneration = 0;
let fsGeneration = 0;
let logsGeneration = 0;

let containers: ContainerRow[] = [];
let images: ImageRow[] = [];
let volumes: VolumeRow[] = [];
let networks: NetworkRow[] = [];
let systemDf: SystemDfItem[] = [];

let activeTab: MainTabId = 'containers';
let tabScrollLeft = 0;
let filter: FilterId = 'all';
let query = '';
let selectedIds = new Set<string>();
const collapsedComposeProjects = new Set<string>();

let view: ViewMode = 'catalog';

// FS state
let fsContainer: ContainerRow | null = null;
let fsPath = '/';
let fsListing: FsListing | null = null;
let fsFile: FsFile | null = null;
let fsBusy = false;
let showHidden = true;

// Logs state
let logsContainer: ContainerRow | null = null;
let logsView: LogsView | null = null;
let logsBusy = false;
let logsLive = true;
let logsTail = LOG_TAIL_DEFAULT;
let logsSearchQuery = '';
let logsWordWrap = false;
let logsTimer: ReturnType<typeof setInterval> | null = null;
let logsScrollTop = -1;
let logsIsAtBottom = true;

// Inspect state
let inspectContainerRow: ContainerRow | null = null;
let inspectView: InspectView | null = null;
let inspectBusy = false;

// Exec state
let execContainer: ContainerRow | null = null;
let execOutput: string | null = null;
let execExitCode: number | null = null;
let execBusy = false;

let booted = false;
let app: HTMLElement | null = null;
let bodyEl: HTMLElement | null = null;
let subtitleEl: HTMLElement | null = null;
let searchInput: HTMLInputElement | null = null;

const asText = (value: unknown): string => (
  typeof value === 'string' ? value : value == null ? '' : String(value)
);

const report = (error: unknown): void => {
  const message = error instanceof HostRequestError
    ? error.message
    : error instanceof Error
      ? error.message
      : 'Request failed.';
  void host.toast({ kind: 'error', message });
};

const parseArray = <T>(
  body: string,
  key: string,
  mapRow: (row: Record<string, unknown>) => T | null,
): T[] => {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const value = json[key];
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const mapped = mapRow(entry as Record<string, unknown>);
      return mapped ? [mapped] : [];
    });
  } catch {
    return [];
  }
};

const parsePorts = (value: unknown): PublishedPort[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const hostPort = asText(row.hostPort).trim();
    if (!hostPort) return [];
    const urlRaw = asText(row.url).trim();
    return [{
      hostIp: asText(row.hostIp),
      hostPort,
      containerPort: asText(row.containerPort),
      protocol: asText(row.protocol) || 'tcp',
      url: urlRaw || null,
    }];
  });
};

const parseCompose = (value: unknown) => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const project = asText(row.project).trim();
  if (!project) return null;
  return { project, service: asText(row.service).trim() };
};

const parseContainers = (body: string): ContainerRow[] => parseArray(body, 'containers', (row) => {
  const id = asText(row.id).trim();
  if (!id) return null;
  let stats = null;
  if (row.stats && typeof row.stats === 'object') {
    const s = row.stats as Record<string, unknown>;
    stats = {
      cpu: asText(s.cpu),
      mem: asText(s.mem),
      memPerc: asText(s.memPerc),
    };
  }
  return {
    id,
    names: asText(row.names),
    image: asText(row.image),
    status: asText(row.status),
    state: asText(row.state),
    health: asText(row.health).trim() || null,
    ports: parsePorts(row.ports),
    compose: parseCompose(row.compose),
    stats,
  };
});

const parseImages = (body: string): ImageRow[] => parseArray(body, 'images', (row) => {
  const id = asText(row.id).trim();
  if (!id) return null;
  return {
    id,
    repository: asText(row.repository),
    tag: asText(row.tag),
    size: asText(row.size),
    created: asText(row.created),
    used: Boolean(row.used),
  };
});

const parseVolumes = (body: string): VolumeRow[] => parseArray(body, 'volumes', (row) => {
  const name = asText(row.name).trim();
  if (!name) return null;
  return {
    name,
    driver: asText(row.driver),
    scope: asText(row.scope),
    mountpoint: asText(row.mountpoint),
    used: Boolean(row.used),
  };
});

const parseNetworks = (body: string): NetworkRow[] => parseArray(body, 'networks', (row) => {
  const id = asText(row.id).trim();
  const name = asText(row.name).trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    driver: asText(row.driver),
    scope: asText(row.scope),
    used: Boolean(row.used),
  };
});

const parseSystemDf = (body: string): SystemDfItem[] => {
  try {
    const raw = JSON.parse(body);
    const df = raw.df;
    if (!Array.isArray(df)) return [];
    return df.map((row: Record<string, unknown>) => ({
      Type: asText(row.Type || row.type),
      TotalCount: asText(row.TotalCount || row.totalCount || '0'),
      Active: asText(row.Active || row.active || '0'),
      Size: asText(row.Size || row.size || '0B'),
      Reclaimable: asText(row.Reclaimable || row.reclaimable || ''),
    }));
  } catch {
    return [];
  }
};

const parseFsListing = (body: string): FsListing | null => {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const path = asText(json.path).trim() || '/';
    const kindRaw = asText(json.kind);
    const kind = kindRaw === 'file' || kindRaw === 'other' ? kindRaw : 'dir';
    const entries: FsEntry[] = Array.isArray(json.entries)
      ? json.entries.flatMap((entry): FsEntry[] => {
        if (!entry || typeof entry !== 'object') return [];
        const row = entry as Record<string, unknown>;
        const name = asText(row.name).trim();
        const entryPath = asText(row.path).trim();
        if (!name || !entryPath) return [];
        const typeRaw = asText(row.type);
        const type: FsEntry['type'] = typeRaw === 'dir' || typeRaw === 'file' ? typeRaw : 'other';
        return [{
          name,
          type,
          path: entryPath,
          hidden: Boolean(row.hidden) || name.startsWith('.'),
        }];
      })
      : [];
    return {
      path,
      kind,
      parent: asText(json.parent).trim() || '/',
      truncated: Boolean(json.truncated),
      entries,
    };
  } catch {
    return null;
  }
};

const parseFsFile = (body: string): FsFile | null => {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const path = asText(json.path).trim();
    if (!path) return null;
    return {
      path,
      binary: Boolean(json.binary),
      truncated: Boolean(json.truncated),
      size: typeof json.size === 'number' ? json.size : 0,
      content: typeof json.content === 'string' ? json.content : null,
    };
  } catch {
    return null;
  }
};

const parseLogs = (body: string): LogsView | null => {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const text = typeof json.text === 'string' ? json.text : null;
    if (text === null) return null;
    return {
      id: asText(json.id).trim() || 'container',
      name: asText(json.name).trim() || 'container',
      tail: typeof json.tail === 'number' ? json.tail : LOG_TAIL_DEFAULT,
      truncated: Boolean(json.truncated),
      text,
    };
  } catch {
    return null;
  }
};

const parseInspect = (body: string): InspectView | null => {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const id = asText(json.id).trim();
    if (!id) return null;
    return {
      id,
      name: asText(json.name),
      image: asText(json.image),
      created: asText(json.created),
      state: asText(json.state),
      status: asText(json.status),
      health: asText(json.health).trim() || null,
      command: asText(json.command),
      entrypoint: asText(json.entrypoint),
      env: Array.isArray(json.env) ? json.env.map((entry) => asText(entry)) : [],
      mounts: Array.isArray(json.mounts)
        ? json.mounts.flatMap((entry) => {
          if (!entry || typeof entry !== 'object') return [];
          const row = entry as Record<string, unknown>;
          return [{
            type: asText(row.type),
            name: asText(row.name),
            source: asText(row.source),
            destination: asText(row.destination),
            mode: asText(row.mode),
            rw: Boolean(row.rw),
          }];
        })
        : [],
      networks: Array.isArray(json.networks) ? json.networks.map((entry) => asText(entry)) : [],
      ports: parsePorts(json.ports),
      compose: parseCompose(json.compose),
      restartPolicy: asText(json.restartPolicy),
    };
  } catch {
    return null;
  }
};

const shortId = (id: string): string => id.slice(0, 12);
const displayName = (row: ContainerRow): string => {
  const names = row.names.trim();
  if (!names) return shortId(row.id);
  return names.split(',')[0]?.replace(/^\//, '') || shortId(row.id);
};
const imageLabel = (row: ImageRow): string => {
  const repo = row.repository.trim() || '<none>';
  const tag = row.tag.trim() || '<none>';
  return `${repo}:${tag}`;
};
const normalizeState = (state: string): string => state.trim().toLowerCase();
const isRunning = (row: ContainerRow): boolean => normalizeState(row.state) === 'running';

const readErrorMessage = async (res: { body: string; statusText?: string }): Promise<string> => {
  try {
    const json = JSON.parse(res.body) as { message?: string; error?: string };
    if (json.message) return json.message;
    if (json.error) return json.error;
  } catch {
    // fallthrough
  }
  return res.statusText || 'Host request failed.';
};

const loadCatalog = async (): Promise<void> => {
  const generation = ++loadGeneration;
  try {
    const [resC, resI, resV, resN, resS] = await Promise.all([
      host.serviceRequest({ method: 'GET', path: '/containers' }),
      host.serviceRequest({ method: 'GET', path: '/images' }),
      host.serviceRequest({ method: 'GET', path: '/volumes' }),
      host.serviceRequest({ method: 'GET', path: '/networks' }),
      host.serviceRequest({ method: 'GET', path: '/system/df' }),
    ]);

    if (generation !== loadGeneration) return;

    if (resC.status === 200) containers = parseContainers(resC.body);
    if (resI.status === 200) images = parseImages(resI.body);
    if (resV.status === 200) volumes = parseVolumes(resV.body);
    if (resN.status === 200) networks = parseNetworks(resN.body);
    if (resS.status === 200) systemDf = parseSystemDf(resS.body);

    const currentIds = new Set(containers.map((c) => c.id));
    selectedIds = new Set([...selectedIds].filter((id) => currentIds.has(id)));

    paint();
  } catch (error) {
    if (generation !== loadGeneration) return;
    report(error);
  }
};

const openExec = (row: ContainerRow): void => {
  if (!isRunning(row)) {
    void host.toast({ kind: 'error', message: 'Start the container before running commands.' });
    return;
  }
  stopLogsLive();
  view = 'exec';
  execContainer = row;
  execOutput = null;
  execExitCode = null;
  execBusy = false;
  paint();
};

const closeExec = (): void => {
  view = 'catalog';
  execContainer = null;
  execOutput = null;
  execExitCode = null;
  paint();
};

const runExecCommand = async (command: string): Promise<void> => {
  if (!execContainer || execBusy) return;
  execBusy = true;
  paint();
  try {
    const res = await host.serviceRequest({
      method: 'POST',
      path: `/containers/${encodeURIComponent(execContainer.id)}/exec`,
      body: JSON.stringify({ command }),
    });
    if (res.status !== 200) {
      throw new Error(await readErrorMessage(res));
    }
    const json = JSON.parse(res.body) as ExecResult;
    execOutput = json.output || '(No output)';
    execExitCode = json.exitCode ?? 0;
  } catch (error) {
    execOutput = error instanceof Error ? error.message : 'Execution failed';
    execExitCode = 1;
  } finally {
    execBusy = false;
    paint();
  }
};

const openFs = (row: ContainerRow): void => {
  if (!isRunning(row)) {
    void host.toast({ kind: 'error', message: 'Start the container before browsing files.' });
    return;
  }
  stopLogsLive();
  view = 'fs';
  fsContainer = row;
  fsPath = '/';
  fsListing = null;
  fsFile = null;
  paint();
  void loadFs(row.id, '/').catch(report);
};

const closeFs = (): void => {
  view = 'catalog';
  fsContainer = null;
  fsPath = '/';
  fsListing = null;
  fsFile = null;
  paint();
};

const openLogs = (row: ContainerRow): void => {
  stopLogsLive();
  view = 'logs';
  logsContainer = row;
  logsView = null;
  logsScrollTop = -1;
  logsIsAtBottom = true;
  paint();
  void loadLogs(row.id).then(() => startLogsLive()).catch(report);
};

const closeLogs = (): void => {
  stopLogsLive();
  view = 'catalog';
  logsContainer = null;
  logsView = null;
  paint();
};

const openInspect = (row: ContainerRow): void => {
  stopLogsLive();
  view = 'inspect';
  inspectContainerRow = row;
  inspectView = null;
  inspectBusy = true;
  paint();
  void loadInspect(row.id);
};

const closeInspect = (): void => {
  view = 'catalog';
  inspectContainerRow = null;
  inspectView = null;
  inspectBusy = false;
  paint();
};

const loadInspect = async (containerId: string): Promise<void> => {
  inspectBusy = true;
  paint();
  try {
    const result = await host.serviceRequest({
      method: 'GET',
      path: `/containers/${encodeURIComponent(containerId)}/inspect`,
    });
    if (result.status !== 200) throw new Error(await readErrorMessage(result));
    const parsed = parseInspect(result.body);
    if (!parsed) throw new Error('Could not parse container inspect data.');
    inspectView = parsed;
  } catch (error) {
    report(error);
  } finally {
    inspectBusy = false;
    paint();
  }
};

const buildContainerRow = (c: ContainerRow): HTMLElement => {
  const row = document.createElement('div');
  row.className = 'docker-row';

  const body = document.createElement('div');
  body.className = 'docker-row-body';

  const dot = document.createElement('span');
  dot.className = 'docker-dot';
  dot.dataset.state = isRunning(c) ? 'running' : 'exited';

  const main = document.createElement('div');
  main.className = 'docker-main';
  main.style.cursor = 'pointer';
  main.title = 'Click to inspect container details';

  const name = document.createElement('div');
  name.className = 'docker-name';
  name.textContent = c.compose?.service ? `${c.compose.service} (${displayName(c)})` : displayName(c);

  const meta = document.createElement('div');
  meta.className = 'docker-meta';
  meta.textContent = `${c.image} • ${c.status}`;

  main.appendChild(name);
  main.appendChild(meta);

  if (c.ports.length > 0) {
    const portsDiv = document.createElement('div');
    portsDiv.className = 'docker-ports';
    portsDiv.style.display = 'flex';
    portsDiv.style.flexWrap = 'wrap';
    portsDiv.style.gap = '4px';
    portsDiv.style.marginTop = '4px';

    for (const p of c.ports) {
      const pLink = document.createElement('a');
      pLink.className = 'docker-port-badge';
      const targetUrl = p.url || `http://localhost:${p.hostPort}`;
      pLink.href = targetUrl;
      pLink.target = '_blank';
      pLink.textContent = `${p.hostPort}:${p.containerPort}/${p.protocol}`;
      pLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void host.openUrl(targetUrl).catch(() => {
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
        });
      });
      portsDiv.appendChild(pLink);
    }
    main.appendChild(portsDiv);
  }

  if (c.stats && isRunning(c)) {
    main.appendChild(renderStatsGroup(c.stats));
  }

  main.addEventListener('click', () => openInspect(c));

  const actions = document.createElement('div');
  actions.className = 'docker-actions';

  if (isRunning(c)) {
    mountButton(actions, {
      label: 'Stop',
      variant: 'secondary',
      size: 'xs',
      onClick: () => void containerAction(c.id, 'stop'),
    });
    mountButton(actions, {
      label: 'Exec',
      variant: 'default',
      size: 'xs',
      onClick: () => openExec(c),
    });
  } else {
    mountButton(actions, {
      label: 'Start',
      variant: 'default',
      size: 'xs',
      onClick: () => void containerAction(c.id, 'start'),
    });
  }

  mountButton(actions, {
    label: 'Logs',
    variant: 'secondary',
    size: 'xs',
    onClick: () => openLogs(c),
  });

  mountButton(actions, {
    label: 'Files',
    variant: 'secondary',
    size: 'xs',
    onClick: () => openFs(c),
  });

  mountButton(actions, {
    label: 'Inspect',
    variant: 'ghost',
    size: 'xs',
    onClick: () => openInspect(c),
  });

  body.appendChild(dot);
  body.appendChild(main);
  body.appendChild(actions);
  row.appendChild(body);
  return row;
};

let logsPolling = false;

const startLogsLive = (): void => {
  stopLogsLive();
  if (!logsLive || view !== 'logs' || !logsContainer) return;
  scheduleNextLogsPoll();
};

const scheduleNextLogsPoll = (): void => {
  stopLogsLive();
  if (!logsLive || view !== 'logs' || !logsContainer) return;
  logsTimer = setTimeout(() => {
    void pollLogs();
  }, LOG_POLL_MS);
};

const pollLogs = async (): Promise<void> => {
  if (logsPolling || view !== 'logs' || !logsContainer || !logsLive) return;
  logsPolling = true;
  try {
    await loadLogs(logsContainer.id, true);
  } finally {
    logsPolling = false;
    if (view === 'logs' && logsLive && logsContainer) {
      scheduleNextLogsPoll();
    }
  }
};

const stopLogsLive = (): void => {
  if (logsTimer !== null) {
    clearTimeout(logsTimer);
    logsTimer = null;
  }
};

const loadLogs = async (containerId: string, quiet = false): Promise<void> => {
  const currentGen = logsGeneration;
  if (!quiet) {
    logsBusy = true;
    paint();
  }
  try {
    const result = await host.serviceRequest({
      method: 'GET',
      path: `/containers/${encodeURIComponent(containerId)}/logs`,
      query: { tail: String(logsTail) },
    });
    if (currentGen !== logsGeneration) return;
    if (result.status !== 200) {
      throw new Error(await readErrorMessage(result));
    }
    const parsed = parseLogs(result.body);
    if (!parsed) throw new Error('Could not parse logs.');
    logsView = parsed;
    paint();
  } catch (error) {
    if (currentGen !== logsGeneration) return;
    if (!quiet) report(error);
  } finally {
    if (currentGen === logsGeneration) {
      logsBusy = false;
      paint();
    }
  }
};

const copyLogsText = async (): Promise<void> => {
  if (!logsView?.text) {
    void host.toast({ kind: 'error', message: 'No logs available to copy.' });
    return;
  }
  try {
    await host.writeClipboard(logsView.text);
    void host.toast({ kind: 'success', message: 'Logs copied to clipboard.' });
  } catch {
    try {
      await navigator.clipboard.writeText(logsView.text);
      void host.toast({ kind: 'success', message: 'Logs copied to clipboard.' });
    } catch (err) {
      report(err);
    }
  }
};

const askLogsInChat = async (): Promise<void> => {
  if (!logsView?.text) {
    void host.toast({ kind: 'error', message: 'No logs available to ask in chat.' });
    return;
  }
  const maxLen = 8000;
  const rawText = logsView.text.trim();
  const trimmed = rawText.length > maxLen ? rawText.slice(-maxLen) : rawText;
  const containerName = logsContainer?.names.replace(/^\//, '') || 'container';
  const promptText = `Analyze these Docker logs for container "${containerName}":\n\n\`\`\`log\n${trimmed}\n\`\`\``;

  try {
    await host.compose({ text: promptText });
    void host.toast({ kind: 'success', message: 'Logs attached to AI chat prompt.' });
  } catch {
    try {
      await host.prompt({ text: promptText });
      void host.toast({ kind: 'success', message: 'Logs sent to AI chat.' });
    } catch (err) {
      report(err);
    }
  }
};

const loadFs = async (containerId: string, path: string): Promise<void> => {
  const generation = ++fsGeneration;
  fsBusy = true;
  fsPath = path;
  fsFile = null;
  paint();
  try {
    const result = await host.serviceRequest({
      method: 'GET',
      path: `/containers/${encodeURIComponent(containerId)}/fs`,
      query: { path },
    });
    if (generation !== fsGeneration) return;
    if (result.status !== 200) throw new Error(await readErrorMessage(result));
    const listing = parseFsListing(result.body);
    if (!listing) throw new Error('Could not parse filesystem listing.');
    if (listing.kind === 'file') {
      await loadFsFile(containerId, listing.path, generation);
      return;
    }
    fsListing = listing;
    fsPath = listing.path;
    fsFile = null;
    paint();
  } catch (error) {
    if (generation !== fsGeneration) return;
    report(error);
  } finally {
    if (generation === fsGeneration) {
      fsBusy = false;
      paint();
    }
  }
};

const loadFsFile = async (containerId: string, path: string, generation = ++fsGeneration): Promise<void> => {
  fsBusy = true;
  fsPath = path;
  paint();
  try {
    const result = await host.serviceRequest({
      method: 'GET',
      path: `/containers/${encodeURIComponent(containerId)}/fs/file`,
      query: { path },
    });
    if (generation !== fsGeneration) return;
    if (result.status !== 200) throw new Error(await readErrorMessage(result));
    const file = parseFsFile(result.body);
    if (!file) throw new Error('Could not parse file.');
    fsFile = file;
    fsPath = file.path;
    fsListing = {
      path: file.path,
      kind: 'file',
      parent: file.path === '/' ? '/' : file.path.split('/').slice(0, -1).join('/') || '/',
      entries: [],
    };
    paint();
  } catch (error) {
    if (generation !== fsGeneration) return;
    report(error);
  } finally {
    if (generation === fsGeneration) {
      fsBusy = false;
      paint();
    }
  }
};

const containerAction = async (id: string, action: 'start' | 'stop' | 'restart' | 'remove'): Promise<void> => {
  try {
    const res = await host.serviceRequest({
      method: 'POST',
      path: `/containers/${encodeURIComponent(id)}/${action}`,
    });
    if (res.status !== 200) throw new Error(await readErrorMessage(res));
    void host.toast({ kind: 'success', message: `Container ${action}ed.` });
    await loadCatalog();
  } catch (error) {
    report(error);
  }
};

const runContainerFromImage = async (imageRef: string): Promise<void> => {
  try {
    void host.toast({ kind: 'info', message: `Launching container from ${imageRef}...` });
    const res = await host.serviceRequest({
      method: 'POST',
      path: '/containers/run',
      body: JSON.stringify({ image: imageRef }),
    });
    if (res.status !== 200) throw new Error(await readErrorMessage(res));
    void host.toast({ kind: 'success', message: `Container launched from ${imageRef}.` });
    activeTab = 'containers';
    await loadCatalog();
  } catch (error) {
    report(error);
  }
};

const removeImage = async (id: string): Promise<void> => {
  try {
    const res = await host.serviceRequest({
      method: 'POST',
      path: `/images/${encodeURIComponent(id)}/remove`,
    });
    if (res.status !== 200) throw new Error(await readErrorMessage(res));
    void host.toast({ kind: 'success', message: 'Image removed.' });
    await loadCatalog();
  } catch (error) {
    report(error);
  }
};

let showPullInput = false;
let pullImageRef = '';
let showPruneConfirm = false;
let headerBannerContainer: HTMLElement | null = null;
let systemPruneBusy = false;
let pruneItemBusyType: string | null = null;

const systemPrune = async (): Promise<void> => {
  if (systemPruneBusy) return;
  systemPruneBusy = true;
  paint();
  try {
    void host.toast({ kind: 'info', message: 'Pruning unused Docker system resources...' });
    const res = await host.serviceRequest({
      method: 'POST',
      path: '/system/prune',
    });
    if (res.status !== 200) throw new Error(await readErrorMessage(res));
    void host.toast({ kind: 'success', message: 'System prune complete.' });
    await loadCatalog();
  } catch (error) {
    report(error);
  } finally {
    systemPruneBusy = false;
    paint();
  }
};

const pruneCategory = async (type: string): Promise<void> => {
  if (pruneItemBusyType) return;
  pruneItemBusyType = type;
  paint();
  const lower = type.toLowerCase();
  let endpoint = '/system/prune';
  let label = type;
  if (lower.includes('image')) {
    endpoint = '/images/prune';
    label = 'Images';
  } else if (lower.includes('container')) {
    endpoint = '/containers/prune';
    label = 'Containers';
  } else if (lower.includes('volume')) {
    endpoint = '/volumes/prune';
    label = 'Volumes';
  } else if (lower.includes('cache') || lower.includes('builder')) {
    endpoint = '/builder/prune';
    label = 'Build Cache';
  }
  try {
    void host.toast({ kind: 'info', message: `Pruning unused ${label}...` });
    const res = await host.serviceRequest({
      method: 'POST',
      path: endpoint,
    });
    if (res.status !== 200) throw new Error(await readErrorMessage(res));
    void host.toast({ kind: 'success', message: `Pruned ${label} successfully.` });
  } catch (error) {
    report(error);
  } finally {
    pruneItemBusyType = null;
    try {
      await loadCatalog();
    } catch {}
    paint();
  }
};

const executePullImage = async (ref: string): Promise<void> => {
  const cleanRef = ref.trim();
  if (!cleanRef) return;
  try {
    void host.toast({ kind: 'info', message: `Pulling image ${cleanRef}...` });
    const res = await host.serviceRequest({
      method: 'POST',
      path: '/images/pull',
      body: JSON.stringify({ ref: cleanRef }),
    });
    if (res.status !== 200) throw new Error(await readErrorMessage(res));
    void host.toast({ kind: 'success', message: `Image ${cleanRef} pulled successfully.` });
    await loadCatalog();
  } catch (error) {
    report(error);
  }
};

const buildAppSkeleton = (): void => {
  root.innerHTML = '';
  app = document.createElement('div');
  app.className = 'docker-app';

  // Header
  const header = document.createElement('div');
  header.className = 'docker-header';

  const titleRow = document.createElement('div');
  titleRow.className = 'docker-title-row';

  const titleBlock = document.createElement('div');
  titleBlock.className = 'docker-title-block';

  const title = document.createElement('h1');
  title.className = 'docker-title';
  title.textContent = 'Docker';

  subtitleEl = document.createElement('p');
  subtitleEl.className = 'docker-subtitle';
  subtitleEl.textContent = 'Loading Docker environment...';

  titleBlock.appendChild(title);
  titleBlock.appendChild(subtitleEl);

  const headerActions = document.createElement('div');
  headerActions.style.display = 'flex';
  headerActions.style.gap = '6px';

  mountButton(headerActions, {
    label: '+ Pull Image',
    variant: 'secondary',
    size: 'xs',
    onClick: () => {
      showPullInput = !showPullInput;
      showPruneConfirm = false;
      paint();
    },
  });

  mountButton(headerActions, {
    label: 'Prune System',
    variant: 'ghost',
    size: 'xs',
    onClick: () => {
      showPruneConfirm = !showPruneConfirm;
      showPullInput = false;
      paint();
    },
  });

  titleRow.appendChild(titleBlock);
  titleRow.appendChild(headerActions);

  headerBannerContainer = document.createElement('div');
  headerBannerContainer.className = 'docker-banner-container';

  // Search toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'docker-toolbar';

  searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = 'docker-search';
  searchInput.placeholder = 'Search containers, images, volumes...';
  searchInput.value = query;
  searchInput.addEventListener('input', () => {
    query = searchInput?.value || '';
    paint();
  });
  toolbar.appendChild(searchInput);

  header.appendChild(titleRow);
  header.appendChild(headerBannerContainer);
  header.appendChild(toolbar);

  app.appendChild(header);

  // Body
  bodyEl = document.createElement('div');
  bodyEl.className = 'docker-body';
  app.appendChild(bodyEl);

  root.appendChild(app);
};

const renderCatalogView = (): HTMLElement => {
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  container.style.gap = '8px';

  const composeProjects = new Set(containers.map((c) => c.compose?.project).filter(Boolean));

  // Tabs header
  const tabsEl = renderTabs(
    activeTab,
    {
      containers: containers.length,
      compose: composeProjects.size,
      images: images.length,
      volumes: volumes.length,
      networks: networks.length,
    },
    (tab) => {
      activeTab = tab;
      paint();
    },
    tabScrollLeft,
    (s) => {
      tabScrollLeft = s;
    },
  );
  container.appendChild(tabsEl);

  const q = query.trim().toLowerCase();

  if (activeTab === 'containers') {
    // Container filter sub-bar
    const filters = document.createElement('div');
    filters.className = 'docker-filters';
    const filterOptions: FilterId[] = ['all', 'running', 'stopped'];
    for (const f of filterOptions) {
      const btn = document.createElement('button');
      btn.className = 'docker-filter';
      btn.dataset.active = filter === f ? 'true' : 'false';
      btn.textContent = f.charAt(0).toUpperCase() + f.slice(1);
      btn.addEventListener('click', () => {
        filter = f;
        paint();
      });
      filters.appendChild(btn);
    }
    container.appendChild(filters);

    let filteredC = containers.filter((c) => {
      if (filter === 'running' && !isRunning(c)) return false;
      if (filter === 'stopped' && isRunning(c)) return false;
      if (q && !c.names.toLowerCase().includes(q) && !c.image.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    if (filteredC.length === 0) {
      mountEmpty(container, {
        title: 'No Containers Found',
        body: q ? `No containers match "${q}".` : 'No containers available.',
      });
      return container;
    }

    const list = document.createElement('div');
    list.className = 'docker-list';

    for (const c of filteredC) {
      list.appendChild(buildContainerRow(c));
    }

    container.appendChild(list);
  } else if (activeTab === 'compose') {
    const composeMap = new Map<string, ContainerRow[]>();
    for (const c of containers) {
      const proj = c.compose?.project;
      if (!proj) continue;
      if (q && !proj.toLowerCase().includes(q) && !c.names.toLowerCase().includes(q) && !c.compose?.service?.toLowerCase().includes(q)) {
        continue;
      }
      const existing = composeMap.get(proj) || [];
      existing.push(c);
      composeMap.set(proj, existing);
    }

    if (composeMap.size === 0) {
      mountEmpty(container, {
        title: 'No Compose Stacks Found',
        body: q ? `No Compose projects match "${q}".` : 'No Docker Compose stacks currently running.',
      });
      return container;
    }

    const list = document.createElement('div');
    list.className = 'docker-list';

    for (const [project, projContainers] of composeMap.entries()) {
      const isCollapsed = collapsedComposeProjects.has(project);

      const projectCard = document.createElement('div');
      projectCard.className = 'docker-section';
      projectCard.style.padding = '8px';
      projectCard.style.marginBottom = '6px';

      const headerRow = document.createElement('div');
      headerRow.className = 'docker-title-row';
      headerRow.style.marginBottom = isCollapsed ? '0px' : '8px';
      headerRow.style.cursor = 'pointer';
      headerRow.style.userSelect = 'none';

      const toggleIcon = document.createElement('span');
      toggleIcon.style.marginRight = '6px';
      toggleIcon.style.fontSize = '0.75rem';
      toggleIcon.style.color = '#94a3b8';
      toggleIcon.style.display = 'inline-block';
      toggleIcon.style.transition = 'transform 0.15s ease';
      toggleIcon.textContent = isCollapsed ? '►' : '▼';

      const titleSpan = document.createElement('span');
      titleSpan.style.fontWeight = '600';
      titleSpan.style.fontSize = '0.875rem';
      titleSpan.textContent = `Project: ${project}`;

      const titleGroup = document.createElement('div');
      titleGroup.style.display = 'flex';
      titleGroup.style.alignItems = 'center';
      titleGroup.appendChild(toggleIcon);
      titleGroup.appendChild(titleSpan);

      const runningCount = projContainers.filter(isRunning).length;
      const countBadge = document.createElement('span');
      countBadge.className = 'docker-section-count';
      countBadge.textContent = `${runningCount}/${projContainers.length} running`;

      const projectActions = document.createElement('div');
      projectActions.className = 'docker-actions';
      projectActions.addEventListener('click', (e) => e.stopPropagation());

      if (runningCount > 0) {
        mountButton(projectActions, {
          label: 'Stop Stack',
          variant: 'secondary',
          size: 'xs',
          onClick: () => {
            for (const c of projContainers) {
              if (isRunning(c)) void containerAction(c.id, 'stop');
            }
          },
        });
      } else {
        mountButton(projectActions, {
          label: 'Start Stack',
          variant: 'default',
          size: 'xs',
          onClick: () => {
            for (const c of projContainers) {
              if (!isRunning(c)) void containerAction(c.id, 'start');
            }
          },
        });
      }

      headerRow.appendChild(titleGroup);
      headerRow.appendChild(countBadge);
      headerRow.appendChild(projectActions);

      headerRow.addEventListener('click', () => {
        if (collapsedComposeProjects.has(project)) {
          collapsedComposeProjects.delete(project);
        } else {
          collapsedComposeProjects.add(project);
        }
        paint();
      });

      projectCard.appendChild(headerRow);

      if (!isCollapsed) {
        const rowsList = document.createElement('div');
        rowsList.className = 'docker-list';

        for (const c of projContainers) {
          rowsList.appendChild(buildContainerRow(c));
        }

        projectCard.appendChild(rowsList);
      }

      list.appendChild(projectCard);
    }

    container.appendChild(list);
  } else if (activeTab === 'images') {
    let filteredI = images.filter((img) => !q || imageLabel(img).toLowerCase().includes(q) || img.id.includes(q));
    if (filteredI.length === 0) {
      mountEmpty(container, { title: 'No Images', body: 'No images available.' });
    } else {
      const list = document.createElement('div');
      list.className = 'docker-list';
      for (const img of filteredI) {
        const row = document.createElement('div');
        row.className = 'docker-row';

        const body = document.createElement('div');
        body.className = 'docker-row-body';

        const dot = document.createElement('span');
        dot.className = 'docker-dot';
        dot.dataset.state = img.used ? 'used' : 'neutral';

        const main = document.createElement('div');
        main.className = 'docker-main';

        const name = document.createElement('div');
        name.className = 'docker-name';
        name.textContent = imageLabel(img);

        const meta = document.createElement('div');
        meta.className = 'docker-meta';
        meta.textContent = `${img.size} • Created: ${img.created}`;

        main.appendChild(name);
        main.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'docker-actions';

        mountButton(actions, {
          label: 'Run',
          variant: 'default',
          size: 'xs',
          onClick: () => void runContainerFromImage(imageLabel(img)),
        });

        if (!img.used) {
          mountButton(actions, {
            label: 'Remove',
            variant: 'destructive',
            size: 'xs',
            onClick: () => void removeImage(img.id),
          });
        }

        body.appendChild(dot);
        body.appendChild(main);
        body.appendChild(actions);
        row.appendChild(body);
        list.appendChild(row);
      }
      container.appendChild(list);
    }
  } else if (activeTab === 'volumes') {
    let filteredV = volumes.filter((v) => !q || v.name.toLowerCase().includes(q));
    if (filteredV.length === 0) {
      mountEmpty(container, { title: 'No Volumes', body: 'No volumes available.' });
    } else {
      const list = document.createElement('div');
      list.className = 'docker-list';
      for (const vol of filteredV) {
        const row = document.createElement('div');
        row.className = 'docker-row';

        const body = document.createElement('div');
        body.className = 'docker-row-body';

        const dot = document.createElement('span');
        dot.className = 'docker-dot';
        dot.dataset.state = vol.used ? 'used' : 'neutral';

        const main = document.createElement('div');
        main.className = 'docker-main';

        const name = document.createElement('div');
        name.className = 'docker-name';
        name.textContent = vol.name;

        const meta = document.createElement('div');
        meta.className = 'docker-meta';
        meta.textContent = `Driver: ${vol.driver} • Mount: ${vol.mountpoint}`;

        main.appendChild(name);
        main.appendChild(meta);
        body.appendChild(dot);
        body.appendChild(main);
        row.appendChild(body);
        list.appendChild(row);
      }
      container.appendChild(list);
    }
  } else if (activeTab === 'networks') {
    let filteredN = networks.filter((n) => !q || n.name.toLowerCase().includes(q) || n.driver.toLowerCase().includes(q));
    if (filteredN.length === 0) {
      mountEmpty(container, { title: 'No Networks', body: 'No networks available.' });
    } else {
      const list = document.createElement('div');
      list.className = 'docker-list';
      for (const net of filteredN) {
        const row = document.createElement('div');
        row.className = 'docker-row';

        const body = document.createElement('div');
        body.className = 'docker-row-body';

        const dot = document.createElement('span');
        dot.className = 'docker-dot';
        dot.dataset.state = net.used ? 'used' : 'neutral';

        const main = document.createElement('div');
        main.className = 'docker-main';

        const name = document.createElement('div');
        name.className = 'docker-name';
        name.textContent = net.name;

        const meta = document.createElement('div');
        meta.className = 'docker-meta';
        meta.textContent = `Driver: ${net.driver} • Scope: ${net.scope}`;

        main.appendChild(name);
        main.appendChild(meta);
        body.appendChild(dot);
        body.appendChild(main);
        row.appendChild(body);
        list.appendChild(row);
      }
      container.appendChild(list);
    }
  } else if (activeTab === 'system') {
    const danglingCount = images.filter((img) => img.repository === '<none>' || img.tag === '<none>' || !img.used).length;
    container.appendChild(renderSystemView(systemDf, (type) => void pruneCategory(type), pruneItemBusyType, danglingCount));
  }

  return container;
};

const paint = (): void => {
  try {
    if (!booted) {
      buildAppSkeleton();
      booted = true;
    }

    if (subtitleEl) {
      const runningCount = containers.filter(isRunning).length;
      subtitleEl.textContent = `${containers.length} containers (${runningCount} running), ${images.length} images`;
    }

    if (headerBannerContainer) {
      headerBannerContainer.innerHTML = '';
      if (showPullInput) {
        const pullCard = document.createElement('form');
        pullCard.className = 'docker-section';
        pullCard.style.padding = '6px 8px';
        pullCard.style.display = 'flex';
        pullCard.style.flexDirection = 'row';
        pullCard.style.flexWrap = 'nowrap';
        pullCard.style.alignItems = 'center';
        pullCard.style.gap = '6px';
        pullCard.style.marginTop = '4px';
        pullCard.style.width = '100%';

        const pullInput = document.createElement('input');
        pullInput.type = 'text';
        pullInput.className = 'docker-search';
        pullInput.placeholder = 'Image reference (e.g. nginx:latest)';
        pullInput.style.height = '32px';
        pullInput.style.flex = '1 1 auto';
        pullInput.style.minWidth = '0';
        pullInput.value = pullImageRef;
        pullInput.addEventListener('input', () => {
          pullImageRef = pullInput.value;
        });

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.flexDirection = 'row';
        btnGroup.style.alignItems = 'center';
        btnGroup.style.gap = '4px';
        btnGroup.style.flex = '0 0 auto';

        pullCard.appendChild(pullInput);

        mountButton(btnGroup, {
          label: 'Pull',
          variant: 'default',
          size: 'xs',
          onClick: () => {
            const val = pullInput.value.trim();
            if (val) {
              showPullInput = false;
              pullImageRef = '';
              paint();
              void executePullImage(val);
            }
          },
        });

        mountButton(btnGroup, {
          label: 'Cancel',
          variant: 'ghost',
          size: 'xs',
          onClick: () => {
            showPullInput = false;
            pullImageRef = '';
            paint();
          },
        });

        pullCard.appendChild(btnGroup);

        pullCard.addEventListener('submit', (e) => {
          e.preventDefault();
          const val = pullInput.value.trim();
          if (val) {
            showPullInput = false;
            pullImageRef = '';
            paint();
            void executePullImage(val);
          }
        });

        headerBannerContainer.appendChild(pullCard);
        setTimeout(() => pullInput.focus(), 20);
      } else if (showPruneConfirm) {
        const pruneCard = document.createElement('div');
        pruneCard.className = 'docker-section';
        pruneCard.style.padding = '6px 8px';
        pruneCard.style.display = 'flex';
        pruneCard.style.flexDirection = 'row';
        pruneCard.style.flexWrap = 'nowrap';
        pruneCard.style.alignItems = 'center';
        pruneCard.style.gap = '6px';
        pruneCard.style.marginTop = '4px';
        pruneCard.style.width = '100%';

        const msg = document.createElement('span');
        msg.style.fontSize = '0.75rem';
        msg.style.flex = '1 1 auto';
        msg.style.minWidth = '0';
        msg.style.overflow = 'hidden';
        msg.style.textOverflow = 'ellipsis';
        msg.style.whiteSpace = 'nowrap';
        msg.textContent = 'Remove unused containers, networks & images?';

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.flexDirection = 'row';
        btnGroup.style.alignItems = 'center';
        btnGroup.style.gap = '4px';
        btnGroup.style.flex = '0 0 auto';

        pruneCard.appendChild(msg);

        mountButton(btnGroup, {
          label: 'Prune',
          variant: 'destructive',
          size: 'xs',
          onClick: () => {
            showPruneConfirm = false;
            paint();
            void systemPrune();
          },
        });

        mountButton(btnGroup, {
          label: 'Cancel',
          variant: 'ghost',
          size: 'xs',
          onClick: () => {
            showPruneConfirm = false;
            paint();
          },
        });

        pruneCard.appendChild(btnGroup);
        headerBannerContainer.appendChild(pruneCard);
      }
    }

    if (!bodyEl) return;

    if (view === 'exec' && execContainer) {
      bodyEl.innerHTML = '';
      bodyEl.appendChild(
        renderExecView(
          execContainer,
          execOutput,
          execExitCode,
          execBusy,
          (cmd) => void runExecCommand(cmd),
          closeExec,
          async () => {
            if (!execContainer) return;
            const name = execContainer.names.replace(/^\//, '') || execContainer.id;
            const cmd = `docker exec -it ${name} sh`;
            try {
              await host.writeClipboard(cmd);
              void host.toast({ kind: 'success', message: `Copied "${cmd}" to clipboard` });
            } catch {
              try {
                await navigator.clipboard.writeText(cmd);
                void host.toast({ kind: 'success', message: `Copied "${cmd}" to clipboard` });
              } catch (err) {
                report(err);
              }
            }
          },
        ),
      );
    } else if (view === 'logs' && logsContainer) {
      const existing = bodyEl.firstElementChild as HTMLElement | null;
      if (existing && existing.classList.contains('docker-logs') && existing.dataset.containerId === logsContainer.id) {
        updateLogsContent(
          existing,
          logsView,
          logsSearchQuery,
          logsBusy,
          logsIsAtBottom ? -1 : logsScrollTop,
        );
      } else {
        bodyEl.innerHTML = '';
        bodyEl.appendChild(
          renderLogsView(
            logsContainer,
            logsView,
            logsBusy,
            logsLive,
            logsTail,
            logsSearchQuery,
            logsWordWrap,
            closeLogs,
            (newTail) => {
              logsTail = newTail;
              if (logsContainer) void loadLogs(logsContainer.id);
            },
            () => {
              logsLive = !logsLive;
              if (logsLive) startLogsLive();
              else stopLogsLive();
              paint();
            },
            (q) => {
              logsSearchQuery = q;
              paint();
            },
            () => {
              logsWordWrap = !logsWordWrap;
              paint();
            },
            () => {
              void copyLogsText();
            },
            () => {
              void askLogsInChat();
            },
            logsIsAtBottom ? -1 : logsScrollTop,
            (st, ab) => {
              logsScrollTop = st;
              logsIsAtBottom = ab;
            },
          ),
        );
      }
    } else if (view === 'fs' && fsContainer) {
      bodyEl.innerHTML = '';
      bodyEl.appendChild(
        renderFsView(
          fsContainer,
          fsPath,
          fsListing,
          fsFile,
          fsBusy,
          showHidden,
          closeFs,
          (newPath) => {
            if (fsContainer) void loadFs(fsContainer.id, newPath);
          },
          () => {
            showHidden = !showHidden;
            paint();
          },
        ),
      );
    } else if (view === 'inspect' && inspectContainerRow) {
      bodyEl.innerHTML = '';
      bodyEl.appendChild(
        renderInspectView(
          inspectContainerRow,
          inspectView,
          inspectBusy,
          closeInspect,
          (url) => void host.openUrl(url).catch(() => {
            window.open(url, '_blank', 'noopener,noreferrer');
          }),
          () => openExec(inspectContainerRow!),
        ),
      );
    } else {
      bodyEl.innerHTML = '';
      bodyEl.appendChild(renderCatalogView());
    }
  } catch (err) {
    console.error('Docker panel paint error:', err);
    if (bodyEl) {
      bodyEl.innerHTML = `<div style="padding: 12px; color: #e11d48;">Render error: ${err instanceof Error ? err.message : String(err)}</div>`;
    }
  }
};

host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement);
  void loadCatalog();
});

setInterval(() => {
  if (view === 'catalog') {
    void loadCatalog();
  }
}, 5000);
