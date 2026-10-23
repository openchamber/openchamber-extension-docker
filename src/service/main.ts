// Runs under the app's own Node runtime on 127.0.0.1, reachable only through
// OpenChamber's proxy with the token it hands us. Reads answer at once;
// changes start a job (jobs.ts) and answer with it.
import http from 'node:http';

import {
  CONTAINER_ACTIONS,
  STACK_ACTIONS,
  containerAction,
  prune,
  pullImage,
  removeResource,
  stackAction,
  startEngine,
  type ContainerAction,
  type RemoveKind,
  type StackAction,
} from './actions.ts';
import { CommandError, isContainerRef } from './docker.ts';
import { AnswerError, execCommand, inspect, listDir, normalizeContainerPath, readFile, readLogs } from './inside.ts';
import { Monitor } from './monitor.ts';
import { normalizeTimestamp } from './parse.ts';
import { projectStack, statusView } from './status-view.ts';
import { readStorage } from './storage.ts';
import type { PruneKind } from '../shared/types.ts';

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? '';
if (!port || !token) {
  console.error('OPENCHAMBER_SERVICE_PORT and OPENCHAMBER_SERVICE_TOKEN are required');
  process.exit(1);
}

const BODY_MAX = 64 * 1024;
const monitor = new Monitor();

type Reply = { status: number; body: unknown };
type Request = { method: string; path: string[]; query: URLSearchParams; body: Record<string, unknown> };

const ok = (body: unknown): Reply => ({ status: 200, body });
const fail = (status: number, message: string): Reply => ({ status, body: { error: message } });

const readBody = (req: http.IncomingMessage): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => {
    raw += chunk;
    if (raw.length > BODY_MAX) {
      reject(new AnswerError(413, 'Request too large.'));
      req.destroy();
    }
  });
  req.on('end', () => {
    if (!raw) {
      resolve({});
      return;
    }
    try {
      const value: unknown = JSON.parse(raw);
      resolve(typeof value === 'object' && value !== null ? value as Record<string, unknown> : {});
    } catch {
      reject(new AnswerError(400, 'Expected a JSON body.'));
    }
  });
  req.on('error', reject);
});

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** A container the panel names must be one we listed; the id then goes to docker after `--`. */
const containerId = (raw: string | undefined): string => {
  const id = decodeURIComponent(raw ?? '');
  if (!isContainerRef(id)) throw new AnswerError(400, 'That is not a container id.');
  const row = monitor.container(id);
  if (!row) throw new AnswerError(404, 'This container is gone.');
  return row.id;
};

const needsEngine = async (wantStats = false): Promise<void> => {
  await monitor.touch(wantStats);
  const snapshot = await monitor.snapshot(null);
  if (!snapshot.engine.running) throw new AnswerError(503, `${snapshot.engine.name} isn't running.`);
};

const route = async ({ method, path, query, body }: Request): Promise<Reply> => {
  const [first, second, third, fourth] = path;

  if (method === 'GET' && first === 'snapshot') {
    await monitor.touch(query.get('stats') === '1');
    return ok(await monitor.snapshot(query.get('directory') || null));
  }

  // The Work Status section OpenChamber draws itself (status-view.ts).
  if (first === 'status' && !second) {
    const directory = query.get('directory') || null;
    if (method === 'GET') {
      // On screen, like a visible frame: stats stream while it is read.
      await monitor.touch(true);
      return ok(statusView(await monitor.snapshot(directory), query.get('locale') ?? 'en'));
    }
    if (method === 'POST') {
      // OpenChamber shows `message` from a refused control in its error toast.
      const refuse = (status: number, message: string): Reply => ({ status, body: { message } });
      try {
        const id = str(body.id);
        if (id === 'start-engine') {
          await monitor.touch(false);
          const snapshot = await monitor.snapshot(null);
          if (snapshot.engine.running) return refuse(409, `${snapshot.engine.name} is already running.`);
          return ok({ job: startEngine(monitor, snapshot.engine.name) });
        }
        if (!(STACK_ACTIONS as readonly string[]).includes(id)) return refuse(400, 'Unknown control.');
        await needsEngine();
        const stack = projectStack(await monitor.snapshot(directory));
        if (!stack) return refuse(404, 'This project has no Compose stack.');
        return ok({
          job: await stackAction(monitor, { action: id as StackAction, project: stack.project, workingDir: stack.workingDir, configFiles: stack.configFiles }),
        });
      } catch (error) {
        if (error instanceof AnswerError) return refuse(error.status, error.message);
        if (error instanceof CommandError) return refuse(502, error.message);
        throw error;
      }
    }
  }

  if (method === 'GET' && first === 'incidents') {
    await monitor.touch(false, true);
    const after = Number(query.get('after') ?? 0);
    return ok({ latest: monitor.incidents.latest, incidents: monitor.incidents.since(Number.isFinite(after) ? after : 0) });
  }

  if (method === 'POST' && first === 'engine' && second === 'start') {
    await monitor.touch(false);
    const snapshot = await monitor.snapshot(null);
    if (snapshot.engine.running) return fail(409, `${snapshot.engine.name} is already running.`);
    return ok({ job: startEngine(monitor, snapshot.engine.name) });
  }

  if (first === 'containers' && second) {
    await needsEngine();
    const id = containerId(second);
    if (method === 'GET' && third === 'logs') {
      const since = query.get('since');
      const normalized = since ? normalizeTimestamp(since) : null;
      if (since && !normalized) return fail(400, 'Bad since timestamp.');
      return ok(await readLogs(id, Number(query.get('tail') ?? 500), normalized));
    }
    if (method === 'GET' && third === 'inspect') return ok(await inspect(id));
    if (method === 'GET' && third === 'fs') {
      const target = normalizeContainerPath(query.get('path') ?? '/');
      if (!target) return fail(400, 'Paths start with / and stay inside the container.');
      return ok(fourth === 'file' ? await readFile(id, target) : await listDir(id, target));
    }
    if (method === 'POST' && third === 'exec') {
      const command = str(body.command).trim();
      if (!command) return fail(400, 'Type a command.');
      if (command.length > 8_000) return fail(400, 'That command is too long.');
      const cwd = normalizeContainerPath(str(body.cwd) || '/') ?? '/';
      return ok(await execCommand(id, command, cwd));
    }
    if (method === 'POST' && third && (CONTAINER_ACTIONS as readonly string[]).includes(third)) {
      return ok({ job: containerAction(monitor, id, third as ContainerAction) });
    }
  }

  if (method === 'POST' && first === 'stacks') {
    await needsEngine();
    const action = str(body.action);
    if (!(STACK_ACTIONS as readonly string[]).includes(action)) return fail(400, 'Unknown stack action.');
    return ok({
      job: await stackAction(monitor, {
        action: action as StackAction,
        project: str(body.project),
        workingDir: str(body.workingDir) || null,
        configFiles: Array.isArray(body.configFiles) ? body.configFiles.map(str).filter(Boolean).slice(0, 16) : [],
      }),
    });
  }

  if (method === 'GET' && first === 'storage') {
    await needsEngine();
    return ok(await readStorage((await monitor.snapshot(null)).containers));
  }

  if (method === 'POST' && first === 'storage' && second === 'prune') {
    await needsEngine();
    const kind = str(body.kind) as PruneKind;
    if (!['images', 'build-cache', 'volumes', 'containers'].includes(kind)) return fail(400, 'Unknown cleanup.');
    return ok({ job: prune(monitor, kind) });
  }

  if (method === 'POST' && first === 'images' && second === 'pull') {
    await needsEngine();
    return ok({ job: pullImage(monitor, str(body.ref)) });
  }

  if (method === 'POST' && (first === 'image' || first === 'volume' || first === 'network') && second === 'remove') {
    await needsEngine();
    return ok({ job: removeResource(first as RemoveKind, str(body.ref), str(body.name) || str(body.ref)) });
  }

  return fail(404, 'Not found.');
};

const server = http.createServer((req, res) => {
  const send = ({ status, body }: Reply): void => {
    if (res.headersSent) return;
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== `Bearer ${token}`) {
    send(fail(401, 'unauthorized'));
    return;
  }
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/health') {
    send(ok({ ok: true }));
    return;
  }
  const method = req.method ?? 'GET';
  void (async () => {
    try {
      const body = method === 'POST' ? await readBody(req) : {};
      const path = url.pathname.split('/').filter(Boolean);
      send(await route({ method, path, query: url.searchParams, body }));
    } catch (error) {
      if (error instanceof AnswerError) send(fail(error.status, error.message));
      else if (error instanceof CommandError) send(fail(502, error.message));
      else send(fail(500, error instanceof Error ? error.message : 'Something went wrong.'));
    }
  })();
});

const shutdown = (): void => {
  monitor.shutdown();
  server.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(port, '127.0.0.1');
