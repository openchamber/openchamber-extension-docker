// The Work Status section OpenChamber draws itself from `GET /status`, with
// no frame (`contributes.statusSection.source`): the open project's stack,
// and Up, Restart and Down in the header. Hosts that predate it load
// status/index.html instead, which shows the same thing. The types mirror
// `GuestStatusView` in @openchamber/sdk; the SDK this package builds against
// predates it.
import { formatBytes, setLocale } from '../shared/format.ts';
import { groupContainers, label, notUpLine, portUrl, stateLine, toneOf, type Stack, type Tone as StackTone } from '../shared/stacks.ts';
import type { Job, Snapshot } from '../shared/types.ts';

type Tone = 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'error' | 'info';

type Row =
  | {
    kind: 'line';
    id: string;
    label: string;
    dot?: Tone;
    content?:
      | { kind: 'chips'; chips: { id: string; label: string; url?: string }[] }
      | { kind: 'text'; text: string; tone?: Tone };
    value?: string;
  }
  | { kind: 'note'; id: string; text: string; tone?: 'muted' | 'info' | 'warning' | 'error' };

type Control = { kind: 'button'; id: string; label: string; disabled?: boolean };

export type StatusView = { rows: Row[]; controls: Control[] };

/** Containers listed; the rest are counted. */
const SHOWN = 6;
const PORTS_SHOWN = 3;

const TONE: Record<StackTone, Tone> = { ok: 'success', warn: 'warning', bad: 'error', off: 'muted' };

/** The open project's stack: its Compose file's, or the one its containers belong to. */
export const projectStack = (snapshot: Snapshot): Stack | null => groupContainers(snapshot.containers, snapshot.project).project[0] ?? null;

const stackJob = (snapshot: Snapshot, stack: Stack, state: Job['state']): Job | undefined => (
  snapshot.jobs.find((job) => job.kind === 'stack' && job.target === stack.project && job.state === state)
);

/** Header buttons; their ids are what `POST /status` takes. */
const controlsFor = (snapshot: Snapshot, stack: Stack | null): Control[] => {
  const { engine } = snapshot;
  if (!engine.running) {
    return engine.start?.canRun && !engine.starting ? [{ kind: 'button', id: 'start-engine', label: `Start ${engine.name}` }] : [];
  }
  if (!stack) return [];
  const busy = Boolean(stackJob(snapshot, stack, 'running'));
  const compose = Boolean(snapshot.compose);
  if (stack.running === 0) {
    return compose || stack.containers.length > 0 ? [{ kind: 'button', id: 'up', label: 'Up', disabled: busy }] : [];
  }
  return [
    { kind: 'button', id: 'restart', label: 'Restart', disabled: busy },
    { kind: 'button', id: compose ? 'down' : 'stop', label: compose ? 'Down' : 'Stop', disabled: busy },
  ];
};

/**
 * A stack job that failed is said in the section, since the frame's toast has
 * no place here: the job list keeps finished jobs for two minutes.
 */
const failureNote = (snapshot: Snapshot, stack: Stack): Row | null => {
  const failed = stackJob(snapshot, stack, 'failed');
  if (!failed) return null;
  const last = failed.output.split('\n').map((text) => text.trim()).filter(Boolean).pop() ?? 'It failed.';
  return { kind: 'note', id: 'job-failed', text: `${failed.label} failed: ${last}`, tone: 'error' };
};

export const statusView = (snapshot: Snapshot, locale: string, now = Date.now()): StatusView => {
  setLocale(locale);
  const { engine } = snapshot;
  if (!engine.running) {
    const text = engine.starting ? `Starting ${engine.name}…` : engine.cliMissing ? 'Docker isn\'t installed.' : `${engine.name} isn't running.`;
    return { rows: [{ kind: 'note', id: 'engine', text }], controls: controlsFor(snapshot, null) };
  }
  const stack = projectStack(snapshot);
  if (!stack) {
    return { rows: [{ kind: 'note', id: 'empty', text: 'No Compose file or containers for this project.' }], controls: [] };
  }
  const rows: Row[] = [];
  const running = stackJob(snapshot, stack, 'running');
  if (running) rows.push({ kind: 'note', id: 'job', text: `${running.label}…` });
  const failed = failureNote(snapshot, stack);
  if (failed) rows.push(failed);
  if (stack.containers.length === 0) {
    // A Compose file that isn't running is a fact about the project, not a problem.
    if (!running) rows.push({ kind: 'note', id: 'not-up', text: notUpLine(stack, Boolean(snapshot.compose)) });
    return { rows, controls: controlsFor(snapshot, stack) };
  }
  for (const row of stack.containers.slice(0, SHOWN)) {
    const isRunning = row.state === 'running';
    const ports = row.ports.filter((port) => port.protocol === 'tcp').slice(0, PORTS_SHOWN);
    const tone = toneOf(row);
    rows.push({
      kind: 'line',
      id: `container-${row.id.slice(0, 12)}`,
      label: label(row),
      dot: TONE[tone],
      content: isRunning && ports.length > 0
        ? { kind: 'chips', chips: ports.map((port) => ({ id: `port-${port.hostPort}`, label: `:${port.hostPort}`, url: portUrl(port) })) }
        : { kind: 'text', text: stateLine(row, now), tone: tone === 'bad' ? 'error' : 'muted' },
      ...(isRunning ? { value: formatBytes(row.memory) } : {}),
    });
  }
  if (stack.containers.length > SHOWN) {
    rows.push({ kind: 'note', id: 'more', text: `+${stack.containers.length - SHOWN} more in the Docker panel` });
  }
  return { rows, controls: controlsFor(snapshot, stack) };
};
