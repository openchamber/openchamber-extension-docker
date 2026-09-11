import { execFile } from 'node:child_process';
import http from 'node:http';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT || process.env.OPENCHAMBER_AGENT_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN || process.env.OPENCHAMBER_AGENT_TOKEN;

const FS_LIST_MAX = 500;
const FS_FILE_MAX = 100_000;
const LOG_TAIL_DEFAULT = 200;
const LOG_TAIL_MAX = 2_000;
const LOG_BYTES_MAX = 512_000;

if (!Number.isInteger(port) || port <= 0 || !token) {
  console.error('OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required');
  process.exit(1);
}

const unauthorized = (res) => {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'unauthorized' }));
};

const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  req.on('error', reject);
});

const docker = async (args, { maxBuffer = 2 * 1024 * 1024, timeout = 15_000 } = {}) => {
  const { stdout } = await execFileAsync('docker', args, { maxBuffer, timeout, encoding: 'utf8' });
  return stdout;
};

const dockerBuffer = async (args, { maxBuffer = 2 * 1024 * 1024, timeout = 15_000 } = {}) => {
  const { stdout } = await execFileAsync('docker', args, {
    maxBuffer,
    timeout,
    encoding: 'buffer',
  });
  return stdout;
};

const parseJsonLines = (stdout) => {
  const lines = stdout.trim().split('\n').filter(Boolean);
  return lines.map((line) => JSON.parse(line));
};

const chunk = (items, size) => {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
};

const shortId = (id) => String(id || '').slice(0, 12);

/** Absolute container paths only. Rejects `..` and empty segments that escape. */
const normalizeContainerPath = (raw) => {
  const value = String(raw ?? '/').trim() || '/';
  if (!value.startsWith('/') || value.includes('\0')) {
    return null;
  }
  const parts = [];
  for (const segment of value.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }
    if (segment === '..') {
      return null;
    }
    parts.push(segment);
  }
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
};

const joinContainerPath = (base, name) => {
  if (base === '/') {
    return `/${name}`;
  }
  return `${base}/${name}`;
};

const parentContainerPath = (pathValue) => {
  if (pathValue === '/') {
    return '/';
  }
  const parts = pathValue.split('/').filter(Boolean);
  parts.pop();
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
};

const publishedPorts = (info) => {
  const byKey = new Map();
  const portMap = info.NetworkSettings?.Ports;
  if (!portMap || typeof portMap !== 'object') {
    return [];
  }
  for (const [key, bindings] of Object.entries(portMap)) {
    const [containerPort, protocol = 'tcp'] = String(key).split('/');
    if (!containerPort || !Array.isArray(bindings)) {
      continue;
    }
    for (const binding of bindings) {
      if (!binding || typeof binding !== 'object') {
        continue;
      }
      const hostPort = String(binding.HostPort || '').trim();
      if (!hostPort) {
        continue;
      }
      const hostIp = String(binding.HostIp || '0.0.0.0').trim() || '0.0.0.0';
      // Docker often publishes the same port on 0.0.0.0 and :: — one chip is enough.
      const dedupeKey = `${hostPort}|${containerPort}|${protocol}`;
      const openHost = hostIp === '0.0.0.0' || hostIp === '::' || hostIp === ''
        ? '127.0.0.1'
        : hostIp;
      const next = {
        hostIp,
        hostPort,
        containerPort,
        protocol,
        url: protocol === 'tcp' ? `http://${openHost}:${hostPort}` : null,
      };
      const prev = byKey.get(dedupeKey);
      if (!prev) {
        byKey.set(dedupeKey, next);
        continue;
      }
      // Prefer IPv4 / wildcard over IPv6-only for the open URL.
      const prevIsV6 = prev.hostIp === '::' || prev.hostIp.includes(':');
      const nextIsV4 = hostIp === '0.0.0.0' || /^\d+\.\d+\.\d+\.\d+$/.test(hostIp);
      if (prevIsV6 && nextIsV4) {
        byKey.set(dedupeKey, next);
      }
    }
  }
  return [...byKey.values()].sort((left, right) => Number(left.hostPort) - Number(right.hostPort));
};

const composeFromLabels = (labels) => {
  if (!labels || typeof labels !== 'object') {
    return null;
  }
  const project = String(labels['com.docker.compose.project'] || '').trim();
  if (!project) {
    return null;
  }
  return {
    project,
    service: String(labels['com.docker.compose.service'] || '').trim(),
  };
};

const findInspect = (inspectByShort, id) => {
  const full = String(id || '');
  const short = shortId(full);
  return inspectByShort.get(short)
    || [...inspectByShort.values()].find((info) => info.Id === full || info.Id?.startsWith(short))
    || null;
};

const healthFromInspect = (info) => {
  const status = String(info?.State?.Health?.Status || '').trim().toLowerCase();
  return status || null;
};

const listContainers = async () => {
  const rows = parseJsonLines(await docker([
    'ps',
    '-a',
    '--format',
    '{{json .}}',
  ]));
  const ids = rows.map((row) => row.ID).filter(Boolean);
  const inspectByShort = new Map();
  for (const batch of chunk(ids, 40)) {
    if (batch.length === 0) {
      continue;
    }
    const infos = JSON.parse(await docker(['inspect', ...batch]));
    for (const info of infos) {
      inspectByShort.set(shortId(info.Id), info);
    }
  }

  const statsByShort = new Map();
  try {
    const statsRows = parseJsonLines(await docker(
      ['stats', '--no-stream', '--format', '{{json .}}'],
      { timeout: 20_000 },
    ));
    for (const row of statsRows) {
      const id = shortId(row.ID || row.Container);
      if (id) {
        statsByShort.set(id, {
          cpu: String(row.CPUPerc || '').trim(),
          mem: String(row.MemUsage || '').trim(),
          memPerc: String(row.MemPerc || '').trim(),
        });
      }
    }
  } catch {
    // stats can fail when the daemon is busy; list still works
  }

  return rows.map((row) => {
    const info = findInspect(inspectByShort, row.ID);
    const labels = info?.Config?.Labels ?? {};
    const stats = statsByShort.get(shortId(row.ID)) ?? null;
    return {
      id: row.ID,
      names: row.Names,
      image: row.Image,
      status: row.Status,
      state: row.State,
      health: info ? healthFromInspect(info) : null,
      ports: info ? publishedPorts(info) : [],
      compose: composeFromLabels(labels),
      stats,
    };
  });
};

const collectUsedImageKeys = async () => {
  const ids = (await docker(['ps', '-aq'])).trim().split('\n').filter(Boolean);
  const used = new Set();
  for (const batch of chunk(ids, 40)) {
    if (batch.length === 0) continue;
    const infos = JSON.parse(await docker(['inspect', ...batch]));
    for (const info of infos) {
      if (info.Image) used.add(String(info.Image));
      if (info.ImageID) used.add(String(info.ImageID));
      const cfg = info.Config?.Image;
      if (cfg) used.add(String(cfg));
    }
  }
  return used;
};

const collectUsedVolumeNames = async () => {
  const ids = (await docker(['ps', '-aq'])).trim().split('\n').filter(Boolean);
  const used = new Set();
  for (const batch of chunk(ids, 40)) {
    if (batch.length === 0) continue;
    const infos = JSON.parse(await docker(['inspect', ...batch]));
    for (const info of infos) {
      for (const mount of info.Mounts || []) {
        if (mount?.Type === 'volume' && mount.Name) {
          used.add(String(mount.Name));
        }
      }
    }
  }
  return used;
};

const collectUsedNetworkKeys = async () => {
  const ids = (await docker(['ps', '-aq'])).trim().split('\n').filter(Boolean);
  const used = new Set();
  for (const batch of chunk(ids, 40)) {
    if (batch.length === 0) continue;
    const infos = JSON.parse(await docker(['inspect', ...batch]));
    for (const info of infos) {
      const networks = info.NetworkSettings?.Networks;
      if (networks && typeof networks === 'object') {
        for (const [netName, netDetails] of Object.entries(networks)) {
          if (netName) used.add(netName);
          if (netDetails?.NetworkID) used.add(String(netDetails.NetworkID));
        }
      }
    }
  }
  return used;
};

const listImages = async () => {
  const rows = parseJsonLines(await docker([
    'images',
    '--format',
    '{{json .}}',
  ]));
  const used = await collectUsedImageKeys();
  const usedList = [...used];
  return rows.map((row) => {
    const id = String(row.ID || '');
    const repo = String(row.Repository || '');
    const tag = String(row.Tag || '');
    const ref = repo && tag && repo !== '<none>' && tag !== '<none>' ? `${repo}:${tag}` : '';
    const isUsed = usedList.some((key) => {
      if (ref && key === ref) return true;
      if (!id || !key) return false;
      return key === id
        || key.startsWith(id)
        || id.startsWith(key)
        || key.includes(shortId(id))
        || id.includes(shortId(key));
    });
    return {
      id,
      repository: row.Repository,
      tag: row.Tag,
      size: row.Size,
      created: row.CreatedSince ?? row.CreatedAt ?? '',
      used: isUsed,
    };
  });
};

const listVolumes = async () => {
  const rows = parseJsonLines(await docker([
    'volume',
    'ls',
    '--format',
    '{{json .}}',
  ]));
  const used = await collectUsedVolumeNames();
  return rows.map((row) => ({
    name: row.Name,
    driver: row.Driver,
    scope: row.Scope ?? '',
    mountpoint: row.Mountpoint ?? '',
    used: used.has(String(row.Name || '')),
  }));
};

const listNetworks = async () => {
  const rows = parseJsonLines(await docker([
    'network',
    'ls',
    '--format',
    '{{json .}}',
  ]));
  const used = await collectUsedNetworkKeys();
  const usedList = [...used];
  return rows.map((row) => {
    const id = String(row.ID || '');
    const name = String(row.Name || '');
    const isUsed = used.has(name) || usedList.some((key) => {
      if (!id || !key) return false;
      return key === id || key.startsWith(id) || id.startsWith(key);
    });
    return {
      id: row.ID,
      name: row.Name,
      driver: row.Driver,
      scope: row.Scope ?? '',
      used: isUsed,
    };
  });
};

const publicInspect = (info) => {
  const name = String(info.Name || '').replace(/^\//, '');
  const networks = info.NetworkSettings?.Networks && typeof info.NetworkSettings.Networks === 'object'
    ? Object.keys(info.NetworkSettings.Networks)
    : [];
  const mounts = Array.isArray(info.Mounts)
    ? info.Mounts.map((mount) => ({
      type: String(mount.Type || ''),
      name: String(mount.Name || ''),
      source: String(mount.Source || ''),
      destination: String(mount.Destination || ''),
      mode: String(mount.Mode || ''),
      rw: Boolean(mount.RW),
    }))
    : [];
  return {
    id: info.Id,
    name,
    image: info.Config?.Image || '',
    created: info.Created || '',
    state: info.State?.Status || '',
    status: info.State?.Status || '',
    health: healthFromInspect(info),
    command: Array.isArray(info.Config?.Cmd) ? info.Config.Cmd.join(' ') : String(info.Config?.Cmd || ''),
    entrypoint: Array.isArray(info.Config?.Entrypoint)
      ? info.Config.Entrypoint.join(' ')
      : String(info.Config?.Entrypoint || ''),
    env: Array.isArray(info.Config?.Env) ? info.Config.Env.map(String) : [],
    mounts,
    networks,
    ports: publishedPorts(info),
    compose: composeFromLabels(info.Config?.Labels ?? {}),
    restartPolicy: info.HostConfig?.RestartPolicy?.Name || '',
  };
};

const getContainerInspect = async (id) => {
  const info = await inspectContainer(id);
  if (!info) {
    return { ok: false, status: 404, error: 'not-found', message: 'Container not found.' };
  }
  return { ok: true, inspect: publicInspect(info) };
};

const inspectContainer = async (id) => {
  const infos = JSON.parse(await docker(['inspect', id]));
  return infos[0] ?? null;
};

const containerRunning = (info) => Boolean(info?.State?.Running);

/**
 * List one directory inside a running container.
 * Uses find so dotfiles always appear (ls -A is missing on some images).
 */
const listContainerFs = async (id, pathValue) => {
  const info = await inspectContainer(id);
  if (!info) {
    return { ok: false, status: 404, error: 'not-found', message: 'Container not found.' };
  }
  if (!containerRunning(info)) {
    return {
      ok: false,
      status: 409,
      error: 'not-running',
      message: 'Start the container before browsing its filesystem.',
    };
  }

  const script = [
    'path="$1"',
    'max="$2"',
    'if [ ! -e "$path" ]; then echo "__OC_MISSING__"; exit 0; fi',
    'if [ -f "$path" ]; then echo "__OC_FILE__"; exit 0; fi',
    'if [ ! -d "$path" ]; then echo "__OC_OTHER__"; exit 0; fi',
    'list_entries() {',
    '  if command -v find >/dev/null 2>&1; then',
    '    find "$path" -mindepth 1 -maxdepth 1 2>/dev/null',
    '  else',
    '    ls -A "$path" 2>/dev/null | while IFS= read -r name; do',
    '      if [ "$path" = "/" ]; then echo "/$name"; else echo "$path/$name"; fi',
    '    done',
    '  fi',
    '}',
    'count=0',
    'list_entries | while IFS= read -r child; do',
    '  [ -n "$child" ] || continue',
    '  count=$((count + 1))',
    '  if [ "$count" -gt "$max" ]; then echo "__OC_TRUNC__"; break; fi',
    '  name="${child##*/}"',
    '  [ -n "$name" ] || continue',
    '  if [ -d "$child" ]; then printf "dir\\t%s\\n" "$name"',
    '  elif [ -f "$child" ]; then printf "file\\t%s\\n" "$name"',
    '  else printf "other\\t%s\\n" "$name"; fi',
    'done',
  ].join('\n');

  let stdout = '';
  try {
    stdout = await docker(
      ['exec', id, 'sh', '-c', script, 'sh', pathValue, String(FS_LIST_MAX)],
      { maxBuffer: 1 * 1024 * 1024, timeout: 12_000 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list path.';
    return { ok: false, status: 502, error: 'docker-failed', message };
  }

  const lines = stdout.replace(/\r/g, '').split('\n').filter((line) => line.length > 0);
  if (lines[0] === '__OC_MISSING__') {
    return { ok: false, status: 404, error: 'path-not-found', message: 'Path not found in the container.' };
  }
  if (lines[0] === '__OC_FILE__') {
    return {
      ok: true,
      path: pathValue,
      kind: 'file',
      parent: parentContainerPath(pathValue),
      entries: [],
    };
  }
  if (lines[0] === '__OC_OTHER__') {
    return {
      ok: true,
      path: pathValue,
      kind: 'other',
      parent: parentContainerPath(pathValue),
      entries: [],
    };
  }

  const truncated = lines.includes('__OC_TRUNC__');
  const entries = [];
  for (const line of lines) {
    if (line === '__OC_TRUNC__') {
      continue;
    }
    const tab = line.indexOf('\t');
    if (tab <= 0) {
      continue;
    }
    const kindRaw = line.slice(0, tab);
    const name = line.slice(tab + 1);
    if (!name || name === '.' || name === '..') {
      continue;
    }
    const type = kindRaw === 'dir' || kindRaw === 'file' ? kindRaw : 'other';
    entries.push({
      name,
      type,
      path: joinContainerPath(pathValue, name),
      hidden: name.startsWith('.'),
    });
  }

  entries.sort((left, right) => {
    if (left.type !== right.type) {
      if (left.type === 'dir') return -1;
      if (right.type === 'dir') return 1;
    }
    return left.name.localeCompare(right.name);
  });

  return {
    ok: true,
    path: pathValue,
    kind: 'dir',
    parent: parentContainerPath(pathValue),
    truncated,
    entries,
  };
};

const readContainerFile = async (id, pathValue) => {
  const info = await inspectContainer(id);
  if (!info) {
    return { ok: false, status: 404, error: 'not-found', message: 'Container not found.' };
  }
  if (!containerRunning(info)) {
    return {
      ok: false,
      status: 409,
      error: 'not-running',
      message: 'Start the container before reading files.',
    };
  }

  const script = [
    'path="$1"',
    'max="$2"',
    'if [ ! -f "$path" ]; then',
    '  if [ ! -e "$path" ]; then printf "%s" "__OC_MISSING__"; exit 0; fi',
    '  printf "%s" "__OC_NOT_FILE__"; exit 0',
    'fi',
    'head -c "$max" "$path" 2>/dev/null',
  ].join('\n');

  let buffer;
  try {
    buffer = await dockerBuffer(
      ['exec', id, 'sh', '-c', script, 'sh', pathValue, String(FS_FILE_MAX + 1)],
      { maxBuffer: FS_FILE_MAX + 64 * 1024, timeout: 12_000 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read file.';
    return { ok: false, status: 502, error: 'docker-failed', message };
  }

  const marker = buffer.subarray(0, 32).toString('utf8');
  if (marker.startsWith('__OC_MISSING__')) {
    return { ok: false, status: 404, error: 'path-not-found', message: 'Path not found in the container.' };
  }
  if (marker.startsWith('__OC_NOT_FILE__')) {
    return { ok: false, status: 400, error: 'not-a-file', message: 'Path is not a regular file.' };
  }

  if (buffer.includes(0)) {
    return {
      ok: true,
      path: pathValue,
      binary: true,
      truncated: buffer.length > FS_FILE_MAX,
      size: Math.min(buffer.length, FS_FILE_MAX),
      content: null,
    };
  }

  const truncated = buffer.length > FS_FILE_MAX;
  const content = buffer.subarray(0, FS_FILE_MAX).toString('utf8');
  return {
    ok: true,
    path: pathValue,
    binary: false,
    truncated,
    size: content.length,
    content,
  };
};

const mergeAndSortLogs = (stdout = '', stderr = '') => {
  const lines = `${stdout}\n${stderr}`.split('\n').filter((l) => l.trim().length > 0);
  const tsRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

  lines.sort((a, b) => {
    const matchA = a.match(tsRegex);
    const matchB = b.match(tsRegex);
    if (matchA && matchB) {
      return matchA[0].localeCompare(matchB[0]);
    }
    if (matchA) return -1;
    if (matchB) return 1;
    return 0;
  });

  return lines.join('\n');
};

/** docker logs writes container stderr to process stderr — merge both. */
const readContainerLogs = async (id, tailRaw) => {
  const info = await inspectContainer(id);
  if (!info) {
    return { ok: false, status: 404, error: 'not-found', message: 'Container not found.' };
  }
  const parsed = Number(tailRaw);
  const tail = Number.isFinite(parsed)
    ? Math.min(Math.max(Math.trunc(parsed), 1), LOG_TAIL_MAX)
    : LOG_TAIL_DEFAULT;

  try {
    const { stdout, stderr } = await execFileAsync(
      'docker',
      ['logs', '--timestamps', '--tail', String(tail), id],
      {
        encoding: 'utf8',
        maxBuffer: LOG_BYTES_MAX,
        timeout: 20_000,
      },
    );
    const text = mergeAndSortLogs(stdout, stderr);
    const truncated = Buffer.byteLength(text, 'utf8') >= LOG_BYTES_MAX;
    return {
      ok: true,
      id: shortId(info.Id),
      name: String(info.Name || '').replace(/^\//, '') || shortId(info.Id),
      tail,
      truncated,
      text,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read logs.';
    return { ok: false, status: 502, error: 'docker-failed', message };
  }
};

const execInContainer = async (id, command) => {
  const cleanCmd = String(command || '').trim();
  if (!cleanCmd) {
    return { ok: false, status: 400, error: 'bad-cmd', message: 'Command is empty.' };
  }
  try {
    const { stdout, stderr } = await execFileAsync('docker', ['exec', id, 'sh', '-c', cleanCmd], {
      maxBuffer: 2 * 1024 * 1024,
      timeout: 30_000,
      encoding: 'utf8',
    });
    const text = `${stdout || ''}${stderr || ''}`;
    return { ok: true, output: text.trim() || '(No output)', exitCode: 0 };
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr ? `\n${err.stderr}` : '') || err.message;
    return { ok: true, output: output.trim() || 'Command failed', exitCode: err.code || 1 };
  }
};

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${token}`) {
    unauthorized(res);
    return;
  }

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  if (req.method === 'GET' && url.pathname === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/containers') {
      sendJson(res, 200, { containers: await listContainers() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/images') {
      sendJson(res, 200, { images: await listImages() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/volumes') {
      sendJson(res, 200, { volumes: await listVolumes() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/networks') {
      sendJson(res, 200, { networks: await listNetworks() });
      return;
    }

    const inspectMatch = url.pathname.match(/^\/containers\/([^/]+)\/inspect$/);
    if (req.method === 'GET' && inspectMatch) {
      const result = await getContainerInspect(decodeURIComponent(inspectMatch[1]));
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, message: result.message });
        return;
      }
      sendJson(res, 200, result.inspect);
      return;
    }

    const execMatch = url.pathname.match(/^\/containers\/([^/]+)\/exec$/);
    if (req.method === 'POST' && execMatch) {
      const id = decodeURIComponent(execMatch[1]);
      const raw = await readBody(req);
      let command = '';
      try {
        const parsed = JSON.parse(raw || '{}');
        command = String(parsed.command || '').trim();
      } catch {
        sendJson(res, 400, { error: 'bad-body', message: 'Expected JSON { command: string }.' });
        return;
      }
      const execResult = await execInContainer(id, command);
      if (!execResult.ok) {
        sendJson(res, execResult.status, { error: execResult.error, message: execResult.message });
        return;
      }
      sendJson(res, 200, execResult);
      return;
    }

    const fsMatch = url.pathname.match(/^\/containers\/([^/]+)\/fs$/);
    if (req.method === 'GET' && fsMatch) {
      const id = decodeURIComponent(fsMatch[1]);
      const pathValue = normalizeContainerPath(url.searchParams.get('path') || '/');
      if (!pathValue) {
        sendJson(res, 400, { error: 'bad-path', message: 'Path must be absolute and stay inside the container.' });
        return;
      }
      const listed = await listContainerFs(id, pathValue);
      if (!listed.ok) {
        sendJson(res, listed.status, { error: listed.error, message: listed.message });
        return;
      }
      sendJson(res, 200, listed);
      return;
    }

    const fileMatch = url.pathname.match(/^\/containers\/([^/]+)\/fs\/file$/);
    if (req.method === 'GET' && fileMatch) {
      const id = decodeURIComponent(fileMatch[1]);
      const pathValue = normalizeContainerPath(url.searchParams.get('path') || '');
      if (!pathValue || pathValue === '/') {
        sendJson(res, 400, { error: 'bad-path', message: 'File path must be absolute.' });
        return;
      }
      const read = await readContainerFile(id, pathValue);
      if (!read.ok) {
        sendJson(res, read.status, { error: read.error, message: read.message });
        return;
      }
      sendJson(res, 200, read);
      return;
    }

    const logsMatch = url.pathname.match(/^\/containers\/([^/]+)\/logs$/);
    if (req.method === 'GET' && logsMatch) {
      const id = decodeURIComponent(logsMatch[1]);
      const logs = await readContainerLogs(id, url.searchParams.get('tail'));
      if (!logs.ok) {
        sendJson(res, logs.status, { error: logs.error, message: logs.message });
        return;
      }
      sendJson(res, 200, logs);
      return;
    }

    const stopMatch = url.pathname.match(/^\/containers\/([^/]+)\/stop$/);
    if (req.method === 'POST' && stopMatch) {
      await docker(['stop', decodeURIComponent(stopMatch[1])]);
      sendJson(res, 200, { ok: true });
      return;
    }

    const startMatch = url.pathname.match(/^\/containers\/([^/]+)\/start$/);
    if (req.method === 'POST' && startMatch) {
      await docker(['start', decodeURIComponent(startMatch[1])]);
      sendJson(res, 200, { ok: true });
      return;
    }

    const restartMatch = url.pathname.match(/^\/containers\/([^/]+)\/restart$/);
    if (req.method === 'POST' && restartMatch) {
      await docker(['restart', decodeURIComponent(restartMatch[1])]);
      sendJson(res, 200, { ok: true });
      return;
    }

    const removeContainerMatch = url.pathname.match(/^\/containers\/([^/]+)\/remove$/);
    if (req.method === 'POST' && removeContainerMatch) {
      const id = decodeURIComponent(removeContainerMatch[1]);
      const withVolumes = url.searchParams.get('volumes') === '1';
      const args = withVolumes ? ['rm', '-f', '-v', id] : ['rm', '-f', id];
      await docker(args, { timeout: 60_000 });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/containers/stop-many') {
      const raw = await readBody(req);
      let ids = [];
      try {
        const parsed = JSON.parse(raw || '{}');
        ids = Array.isArray(parsed.ids) ? parsed.ids.map(String).filter(Boolean).slice(0, 50) : [];
      } catch {
        sendJson(res, 400, { error: 'bad-body', message: 'Expected JSON { ids: string[] }.' });
        return;
      }
      if (ids.length === 0) {
        sendJson(res, 400, { error: 'bad-body', message: 'ids required.' });
        return;
      }
      await docker(['stop', ...ids], { timeout: 120_000 });
      sendJson(res, 200, { ok: true, count: ids.length });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/containers/run') {
      const raw = await readBody(req);
      let image = '';
      let name = '';
      let ports = '';
      try {
        const parsed = JSON.parse(raw || '{}');
        image = String(parsed.image || '').trim();
        name = String(parsed.name || '').trim();
        ports = String(parsed.ports || '').trim();
      } catch {
        sendJson(res, 400, { error: 'bad-body', message: 'Expected JSON { image, name?, ports? }.' });
        return;
      }
      if (!image) {
        sendJson(res, 400, { error: 'bad-image', message: 'Image reference is required.' });
        return;
      }

      const args = ['run', '-d'];
      if (name) {
        args.push('--name', name);
      }
      if (ports) {
        for (const p of ports.split(',').map((s) => s.trim()).filter(Boolean)) {
          args.push('-p', p);
        }
      }
      args.push(image);

      const stdout = await docker(args, { timeout: 60_000 });
      sendJson(res, 200, { ok: true, id: stdout.trim(), image });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/system/df') {
      try {
        const stdout = await docker(['system', 'df', '--format', '{{json .}}']);
        const items = parseJsonLines(stdout);
        sendJson(res, 200, { df: items });
      } catch (err) {
        sendJson(res, 500, { error: 'SYSTEM_DF_FAILED', message: String(err) });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/system/prune') {
      const stdout = await docker(['system', 'prune', '-a', '-f'], { timeout: 120_000 });
      sendJson(res, 200, { ok: true, output: stdout.trim() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/images/pull') {
      const raw = await readBody(req);
      let ref = '';
      try {
        const parsed = JSON.parse(raw || '{}');
        ref = String(parsed.ref || '').trim();
      } catch {
        sendJson(res, 400, { error: 'bad-body', message: 'Expected JSON { ref }.' });
        return;
      }
      if (!ref || ref.length > 256 || /\s/.test(ref)) {
        sendJson(res, 400, { error: 'bad-ref', message: 'Image ref looks invalid.' });
        return;
      }
      await docker(['pull', ref], { maxBuffer: 8 * 1024 * 1024, timeout: 300_000 });
      sendJson(res, 200, { ok: true, ref });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/containers/prune') {
      const stdout = await docker(['container', 'prune', '-f'], { timeout: 120_000 });
      sendJson(res, 200, { ok: true, output: stdout.trim() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/images/prune') {
      const stdout = await docker(['image', 'prune', '-a', '-f'], { timeout: 120_000 });
      sendJson(res, 200, { ok: true, output: stdout.trim() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/volumes/prune') {
      const stdout = await docker(['volume', 'prune', '-f'], { timeout: 120_000 });
      sendJson(res, 200, { ok: true, output: stdout.trim() });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/builder/prune') {
      const stdout = await docker(['builder', 'prune', '-a', '-f'], { timeout: 120_000 });
      sendJson(res, 200, { ok: true, output: stdout.trim() });
      return;
    }

    const removeImageMatch = url.pathname.match(/^\/images\/([^/]+)\/remove$/);
    if (req.method === 'POST' && removeImageMatch) {
      await docker(['rmi', decodeURIComponent(removeImageMatch[1])]);
      sendJson(res, 200, { ok: true });
      return;
    }

    const removeVolumeMatch = url.pathname.match(/^\/volumes\/([^/]+)\/remove$/);
    if (req.method === 'POST' && removeVolumeMatch) {
      await docker(['volume', 'rm', decodeURIComponent(removeVolumeMatch[1])]);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: 'not-found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Docker command failed';
    sendJson(res, 502, { error: 'docker-failed', message });
  } finally {
    void readBody(req).catch(() => {});
  }
});

server.listen(port, '127.0.0.1', () => {
  // ready via GET /health
});
