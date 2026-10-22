// The Work Status section: the open project's stack at a glance, with Up,
// Restart and Down in the section header. The panel has the detail.
import { connectHost, type GuestStatusControl } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

import { FAILURE_TEXT, failureOf, fetchSnapshot, isOnScreen, messageOf, onShown, postJob } from '../shared/client.ts';
import { el, localizeTree } from '../shared/dom.ts';
import { t } from '../shared/i18n.ts';
import { formatBytes, setLocale } from '../shared/format.ts';
import { groupContainers, label, notUpLine, portUrl, stateLine, toneOf, type Stack } from '../shared/stacks.ts';
import { BASE_STYLE, STATUS_STYLE } from '../shared/style.ts';
import type { Job, PortBinding, Snapshot } from '../shared/types.ts';

const POLL_MS = 3_000;
const SHOWN = 6;

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing #root');
const style = document.createElement('style');
style.textContent = BASE_STYLE + STATUS_STYLE;
document.head.append(style);

let directory: string | null = null;
let snapshot: Snapshot | null = null;
let controlsSupported = false;
const ownJobs = new Set<string>();
const reported = new Set<string>();

const projectStack = (): Stack | null => (snapshot ? groupContainers(snapshot.containers, snapshot.project).project[0] ?? null : null);

const stackBody = (stack: Stack, action: string) => ({ action, project: stack.project, workingDir: stack.workingDir, configFiles: stack.configFiles });

const runJob = (start: () => Promise<Job>): void => {
  void start().then((job) => {
    ownJobs.add(job.id);
    void poll();
  }, (error: unknown) => {
    void host.toast({ kind: 'error', message: messageOf(error), copy: true });
  });
};

// ----- Header controls -----

let controlsKey = '';
const publishControls = (): void => {
  if (!controlsSupported) return;
  const controls: GuestStatusControl[] = [];
  if (snapshot && !snapshot.engine.running && snapshot.engine.start?.canRun && !snapshot.engine.starting) {
    controls.push({ kind: 'button', id: 'start-engine', label: t(`Start ${snapshot.engine.name}`) });
  }
  const stack = snapshot?.engine.running ? projectStack() : null;
  const busy = stack ? snapshot?.jobs.some((job) => job.kind === 'stack' && job.target === stack.project && job.state === 'running') : false;
  if (stack && snapshot) {
    const compose = Boolean(snapshot.compose);
    if (stack.running === 0) {
      if (compose || stack.containers.length > 0) controls.push({ kind: 'button', id: 'up', label: t('Up'), disabled: busy });
    } else {
      controls.push({ kind: 'button', id: 'restart', label: t('Restart'), disabled: busy });
      controls.push({ kind: 'button', id: compose ? 'down' : 'stop', label: compose ? t('Down') : t('Stop'), disabled: busy });
    }
  }
  const key = JSON.stringify(controls);
  if (key === controlsKey) return;
  controlsKey = key;
  void host.setStatusControls(controls).catch(() => {
    controlsSupported = false;
  });
};

host.onStatusControl((event) => {
  if (event.id === 'start-engine') {
    runJob(() => postJob(host, '/engine/start'));
    return;
  }
  const stack = projectStack();
  if (stack) runJob(() => postJob(host, '/stacks', stackBody(stack, event.id)));
});

// ----- Body -----

const line = (tone: string, name: string, detail: HTMLElement | string, value: string, bad = false): HTMLElement => {
  const dot = el('span', 'dot');
  dot.dataset.tone = tone;
  const detailNode = typeof detail === 'string' ? el('span', bad ? 'sdetail bad' : 'sdetail', detail) : detail;
  return el('div', 'sline', '', [dot, el('span', 'sname', name), detailNode, el('span', 'value num', value)]);
};

/** A port opens in the browser, like the panel's. */
const portChip = (port: PortBinding): HTMLElement => {
  const chip = el('button', 'port', `:${port.hostPort}`);
  chip.type = 'button';
  chip.title = t(`Open ${portUrl(port)}`);
  chip.addEventListener('click', () => {
    void host.openUrl(portUrl(port)).catch(() => undefined);
  });
  return chip;
};

const note = (text: string, error = false): HTMLElement => el('div', error ? 'note error' : 'note', text);

const render = (): void => {
  if (!snapshot) return;
  const { engine } = snapshot;
  const nodes: HTMLElement[] = [];
  if (!engine.running) {
    nodes.push(note(engine.starting ? `Starting ${engine.name}…` : engine.cliMissing ? 'Docker isn\'t installed.' : `${engine.name} isn't running.`));
  } else {
    const stack = projectStack();
    const job = stack ? snapshot.jobs.find((row) => row.kind === 'stack' && row.target === stack.project && row.state === 'running') : undefined;
    if (!stack) {
      nodes.push(note('No Compose file or containers for this project.'));
    } else if (stack.containers.length === 0) {
      // A Compose file that isn't running is a fact about the project, not a problem.
      nodes.push(note(job ? `${job.label}…` : notUpLine(stack, Boolean(snapshot.compose))));
    } else {
      if (job) nodes.push(note(`${job.label}…`));
      for (const row of stack.containers.slice(0, SHOWN)) {
        const tone = toneOf(row);
        const running = row.state === 'running';
        const ports = row.ports.filter((port) => port.protocol === 'tcp').slice(0, 3);
        const detail = running && ports.length > 0
          ? el('span', 'sdetail', '', ports.map(portChip))
          : stateLine(row);
        nodes.push(line(tone, label(row), detail, running ? formatBytes(row.memory) : '', tone === 'bad'));
      }
      if (stack.containers.length > SHOWN) nodes.push(el('div', 'more', `+${stack.containers.length - SHOWN} more in the Docker panel`));
    }
  }
  root.replaceChildren(...nodes);
  localizeTree(root);
  publishControls();
};

const reportJobs = (jobs: Job[]): void => {
  for (const job of jobs) {
    if (job.state === 'running' || reported.has(job.id)) continue;
    reported.add(job.id);
    if (!ownJobs.delete(job.id)) continue;
    if (job.state === 'failed') {
      const last = job.output.split('\n').map((text) => text.trim()).filter(Boolean).pop() ?? 'It failed.';
      void host.toast({ kind: 'error', message: `${job.label} failed: ${last}`, copy: job.output ? { text: job.output } : false, dismiss: true });
    }
  }
};

let inflight = false;
const poll = async (): Promise<void> => {
  if (inflight || !isOnScreen(root)) return;
  inflight = true;
  try {
    snapshot = await fetchSnapshot(host, directory, true);
    reportJobs(snapshot.jobs);
    render();
  } catch (error) {
    root.replaceChildren(note(FAILURE_TEXT[failureOf(error)], true));
  } finally {
    inflight = false;
  }
};

// The host sizes the frame to the content, up to its limit.
let reportedHeight = -1;
new ResizeObserver(() => {
  const height = Math.ceil(root.getBoundingClientRect().height);
  if (height === reportedHeight) return;
  reportedHeight = height;
  void host.setHeight(height).catch(() => undefined);
}).observe(root);

host.onDirectory((next) => {
  if (next === directory) return;
  directory = next;
  // A project change clears header controls; they're published again with the next snapshot.
  controlsKey = '';
  void poll();
});

let started = false;
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  setLocale(context.locale);
  localizeTree(document.body);
  controlsSupported = context.features?.statusControls === true;
  directory = context.directory;
  if (started) return;
  started = true;
  root.replaceChildren(note('Reading…'));
  void poll();
  setInterval(() => void poll(), POLL_MS);
  onShown(root, () => void poll());
});
