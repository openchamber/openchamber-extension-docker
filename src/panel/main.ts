// The rail panel. While it's on screen it polls the service every two
// seconds; hidden, it only asks for new crashes every fifteen, to put a
// number on the rail icon.
import { connectHost, isGuestAttachItem, type HostReadyContext } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

import { isDockerChipData } from '../shared/chip.ts';
import { FAILURE_TEXT, failureOf, fetchSnapshot, getJson, isOnScreen, messageOf, onShown, type Failure } from '../shared/client.ts';
import { el, localizeTree } from '../shared/dom.ts';
import { setLocale } from '../shared/format.ts';
import { BASE_STYLE, PANEL_STYLE } from '../shared/style.ts';
import type { Incident, Job, Snapshot } from '../shared/types.ts';
import type { App, Prefs, Tab } from './app.ts';
import { createContainerView, type ContainerView } from './container.ts';
import { Diagnoses } from './diagnosis.ts';
import { createEngineView } from './engine.ts';
import { createHome, storageSummary } from './home.ts';
import { doneMessage } from './jobs.ts';
import { createStorage, type StorageView } from './storage.ts';

const POLL_MS = 2_000;
const HIDDEN_POLL_MS = 15_000;

const host = connectHost();
const root = document.querySelector<HTMLElement>('#root');
if (!root) throw new Error('Missing #root');
const style = document.createElement('style');
style.textContent = BASE_STYLE + PANEL_STYLE;
document.head.append(style);

// ----- Preferences on this device -----

const prefValues = new Map<string, unknown>();
let deviceStorage = false;
const prefs: Prefs = {
  get: <T>(key: string, fallback: T): T => (prefValues.has(key) ? prefValues.get(key) as T : fallback),
  set: (key, value) => {
    prefValues.set(key, value);
    if (deviceStorage) void host.storage.set(`pref:${key}`, value as never, { scope: 'device' }).catch(() => undefined);
  },
};
const loadPrefs = async (): Promise<void> => {
  try {
    const keys = await host.storage.keys({ scope: 'device' });
    await Promise.all(keys.filter((key) => key.startsWith('pref:')).map(async (key) => {
      prefValues.set(key.slice(5), await host.storage.get(key, { scope: 'device' }));
    }));
  } catch {
    // Unreadable: defaults.
  }
};

// ----- State -----

let snapshot: Snapshot | null = null;
let directory: string | null = null;
let failure: Failure | null = null;
let view: { kind: 'home' } | { kind: 'container'; id: string } | { kind: 'storage' } = { kind: 'home' };
let containerView: ContainerView | null = null;
let storageView: StorageView | null = null;
/** Jobs this panel started, so it reports how they ended and other frames' jobs stay quiet. */
const ownJobs = new Set<string>();
const reportedJobs = new Set<string>();

const banner = el('div', 'banner');
banner.hidden = true;
const engineBanner = el('div', 'banner');
engineBanner.hidden = true;

const paintBanner = (): void => {
  const text = failure ? FAILURE_TEXT[failure] : '';
  for (const node of [banner, engineBanner]) {
    node.hidden = !text;
    node.textContent = text;
    node.classList.toggle('error', failure === 'service-failed');
  }
};

const app: App = {
  host,
  snapshot: () => snapshot,
  directory: () => directory,
  run: (start) => {
    void start().then((job) => {
      ownJobs.add(job.id);
      void poll();
    }, (error: unknown) => {
      void host.toast({ kind: 'error', message: messageOf(error), copy: true });
    });
  },
  jobFor: (kind, target) => snapshot?.jobs.find((job) => job.kind === kind && job.target === target && job.state === 'running'),
  openContainer: (id, tab) => openContainer(id, tab),
  openStorage: () => {
    view = { kind: 'storage' };
    storageView?.dispose();
    storageView = createStorage(app, (total, reclaimable) => home.setStorageSummary(storageSummary(total, reclaimable)));
    render();
  },
  goHome: () => {
    view = { kind: 'home' };
    render();
  },
  diagnoses: new Diagnoses(host, () => {
    if (snapshot && view.kind === 'home') home.update(snapshot);
  }),
  prefs,
  container: (id) => snapshot?.containers.find((row) => row.id === id || row.id.startsWith(id)),
  openUrl: (url) => {
    void host.openUrl(url).catch(() => undefined);
  },
  copy: (text, what) => {
    void host.writeClipboard(text).then(
      () => host.toast({ kind: 'success', message: what }),
      (error: unknown) => host.toast({ kind: 'error', message: messageOf(error) }),
    );
  },
};

const home = createHome(app, banner);
const engineView = createEngineView(app, engineBanner, () => void poll());
const loading = el('div', 'view', '', [el('div', 'message', 'Connecting to Docker…')]);

/** A chip or a link asked for a container before the first snapshot arrived. */
let pendingOpen: { id: string; tab: Tab } | null = null;

const openContainer = (id: string, tab: Tab = 'logs'): void => {
  const row = app.container(id);
  if (!row) {
    pendingOpen = { id, tab };
    return;
  }
  pendingOpen = null;
  if (containerView && containerView.id === row.id) {
    containerView.select(tab);
  } else {
    containerView?.dispose();
    containerView = createContainerView(app, row, tab);
  }
  view = { kind: 'container', id: row.id };
  render();
};

const render = (): void => {
  let next: HTMLElement;
  if (!snapshot) next = loading;
  else if (!snapshot.engine.running) {
    engineView.update(snapshot);
    next = engineView.element;
  } else if (view.kind === 'container' && containerView) {
    containerView.update(app.container(view.id));
    next = containerView.element;
  } else if (view.kind === 'storage' && storageView) {
    next = storageView.element;
  } else {
    home.update(snapshot);
    next = home.element;
  }
  if (root.firstElementChild !== next) root.replaceChildren(next);
  localizeTree(root);
};

// ----- Jobs -----

/** Reports how this panel's jobs ended: failures with the command's output to copy, slow ones as done. */
const reportJobs = (jobs: Job[]): void => {
  let ended = false;
  for (const job of jobs) {
    if (job.state === 'running' || reportedJobs.has(job.id)) continue;
    reportedJobs.add(job.id);
    ended = true;
    if (!ownJobs.has(job.id)) continue;
    ownJobs.delete(job.id);
    if (job.state === 'failed') {
      const last = job.output.split('\n').map((line) => line.trim()).filter(Boolean).pop() ?? 'It failed.';
      void host.toast({ kind: 'error', message: `${job.label} failed: ${last}`, copy: job.output ? { text: job.output } : false, dismiss: true });
    } else {
      const text = doneMessage(job);
      if (text) void host.toast({ kind: 'success', message: text });
    }
  }
  if (ended && view.kind === 'storage') storageView?.refresh();
};

// ----- Badge: crashes while nobody was looking -----

let seenIncident = 0;
let badgeCount = 0;

const setBadge = (count: number): void => {
  if (count === badgeCount) return;
  badgeCount = count;
  void host.setBadge(count > 0 ? count : null).catch(() => undefined);
};

const checkIncidents = async (): Promise<void> => {
  try {
    const answer = await getJson<{ latest: number; incidents: Incident[] }>(host, '/incidents', { after: String(seenIncident) });
    setBadge(new Set(answer.incidents.map((incident) => incident.containerId)).size);
  } catch {
    // The badge waits for the next try.
  }
};

// ----- Polling -----

let inflight = false;
const poll = async (): Promise<void> => {
  if (inflight) return;
  if (!isOnScreen(root)) return;
  inflight = true;
  try {
    const next = await fetchSnapshot(host, directory, true);
    failure = null;
    const firstEngineUp = next.engine.running && !snapshot?.engine.running;
    snapshot = next;
    // On screen, every incident so far has been seen.
    seenIncident = next.incidentSeq;
    setBadge(0);
    reportJobs(next.jobs);
    if (firstEngineUp && view.kind === 'storage') storageView?.refresh();
    if (pendingOpen) openContainer(pendingOpen.id, pendingOpen.tab);
  } catch (error) {
    failure = failureOf(error);
  } finally {
    inflight = false;
  }
  paintBanner();
  render();
};

let started = false;
const start = (): void => {
  if (started) return;
  started = true;
  void poll();
  setInterval(() => void poll(), POLL_MS);
  setInterval(() => {
    if (!isOnScreen(root)) void checkIncidents();
  }, HIDDEN_POLL_MS);
  onShown(root, () => void poll());
};

host.onItem((item) => {
  if (item && isGuestAttachItem(item) && isDockerChipData(item.data)) openContainer(item.data.containerId, 'logs');
});

host.onLateGenerateResult((late) => app.diagnoses.acceptLate(late));

host.onDirectory((next) => {
  if (next === directory) return;
  directory = next;
  void poll();
});

host.onReady((context: HostReadyContext) => {
  applyHostReady(context, document.documentElement);
  setLocale(context.locale);
  localizeTree(document.body);
  directory = context.directory;
  if (started) return;
  render();
  void (async () => {
    if (context.features?.deviceStorage === true) {
      deviceStorage = true;
      await loadPrefs();
    }
    await app.diagnoses.load();
    start();
  })();
});
