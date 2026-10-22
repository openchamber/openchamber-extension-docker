// The first screen: the open project's stack, then other stacks folded, then
// containers on their own. Rows are kept by id and updated in place.
import { mountMenu, type MenuHandle, type MenuItem } from '@openchamber/sdk/ui';

import { el, reconcile, setText, textButton } from '../shared/dom.ts';
import { t } from '../shared/i18n.ts';
import { formatBytes, formatDisk, formatPercent, plural } from '../shared/format.ts';
import { groupContainers, isUp, label, needsAttention, notUpLine, portUrl, stateLine, toneOf, type Stack } from '../shared/stacks.ts';
import type { Container, Snapshot } from '../shared/types.ts';
import { armButton, type App } from './app.ts';
import { postJob } from '../shared/client.ts';

// ----- Container row -----

/** The Small Model writes names in `backticks`; they read as code, the way the chat shows them. */
const withCode = (text: string): Node[] => text.split(/`([^`\n]+)`/).map((part, index) => (index % 2 === 1 ? el('code', '', part) : document.createTextNode(part)));

type RowView = {
  element: HTMLElement;
  update: (row: Container) => void;
  dispose: () => void;
};

const containerMenu = (row: Container): MenuItem[] => {
  const items: MenuItem[] = [{ id: 'logs', label: t('Logs') }];
  if (row.state === 'running') items.push({ id: 'files', label: t('Files') }, { id: 'shell', label: t('Shell') });
  items.push({ id: 'inspect', label: t('Inspect') }, { separator: true });
  if (row.state === 'running') items.push({ id: 'restart', label: t('Restart') }, { id: 'pause', label: t('Pause') }, { id: 'stop', label: t('Stop') });
  else if (row.state === 'paused') items.push({ id: 'unpause', label: t('Resume') }, { id: 'stop', label: t('Stop') });
  else if (row.state === 'restarting') items.push({ id: 'stop', label: t('Stop') });
  else items.push({ id: 'start', label: t('Start') });
  items.push({ separator: true }, { id: 'remove', label: 'Remove…', destructive: true });
  return items;
};

const menuKey = (items: MenuItem[]): string => items.map((item) => ('separator' in item ? '-' : item.id)).join(',');

const createRow = (app: App, initial: Container): RowView => {
  let current = initial;
  const dot = el('span', 'dot');
  const name = el('span', 'name');
  const health = el('span', 'badge');
  const ports = el('span', 'ports');
  const detail = el('span', 'detail');
  const who = el('div', 'who', '', [el('div', 'line1', '', [name, health, ports]), detail]);
  const action = el('span', 'action');
  const cpu = el('span', 'cell num');
  const memory = el('span', 'cell num');
  const menuCell = el('span', 'menu-cell');
  const row = el('div', 'row', '', [dot, who, action, cpu, memory, menuCell]);
  row.tabIndex = 0;
  row.setAttribute('role', 'button');
  const diag = el('div', 'diag');
  const element = el('div', 'entry', '', [row, diag]);

  const open = (): void => app.openContainer(current.id, 'logs');
  row.addEventListener('click', open);
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });

  const act = (verb: string): void => {
    app.run(() => postJob(app.host, `/containers/${current.id}/${verb}`));
  };

  // Remove asks in place of the inline action, like every destructive click here.
  let removeArmed = false;
  let removeTimer: ReturnType<typeof setTimeout> | undefined;
  const armRemove = (): void => {
    removeArmed = true;
    clearTimeout(removeTimer);
    removeTimer = setTimeout(() => {
      removeArmed = false;
      update(current);
    }, 4_000);
    update(current);
  };

  let menu: MenuHandle | null = null;
  let menuItems = '';
  const onMenu = (id: string): void => {
    if (id === 'logs' || id === 'files' || id === 'shell' || id === 'inspect') app.openContainer(current.id, id);
    else if (id === 'remove') armRemove();
    else act(id);
  };
  // The menu's own clicks must not open the row.
  menuCell.addEventListener('click', (event) => event.stopPropagation());
  menuCell.addEventListener('keydown', (event) => event.stopPropagation());

  let actionKey = '';
  const update = (next: Container): void => {
    current = next;
    const job = app.jobFor('container', next.id);
    const diagnosis = app.diagnoses.get(next);
    dot.dataset.tone = toneOf(next);
    dot.classList.toggle('busy', Boolean(job));
    setText(name, label(next));
    name.title = next.name;
    health.hidden = !next.health || next.state !== 'running';
    if (next.health) {
      setText(health, next.health);
      health.className = `badge ${next.health === 'healthy' ? 'ok' : next.health === 'unhealthy' ? 'bad' : 'warn'}`;
    }
    const portKey = next.ports.map((port) => `${port.hostPort}/${port.protocol}`).join(',');
    if (ports.dataset.key !== portKey) {
      ports.dataset.key = portKey;
      ports.replaceChildren(...next.ports.slice(0, 3).map((port) => {
        const chip = el('button', port.protocol === 'tcp' ? 'port' : 'port plain', `:${port.hostPort}`);
        chip.type = 'button';
        chip.title = port.protocol === 'tcp' ? t(`Open ${portUrl(port)} (container port ${port.containerPort})`) : `${port.hostPort} → ${port.containerPort}/${port.protocol}`;
        chip.addEventListener('click', (event) => {
          event.stopPropagation();
          if (port.protocol === 'tcp') app.openUrl(portUrl(port));
        });
        return chip;
      }));
      if (next.ports.length > 3) ports.append(el('span', 'detail', `+${next.ports.length - 3}`));
    }
    const tone = toneOf(next);
    setText(detail, job ? `${job.label}…` : `${next.compose ? '' : `${next.image} · `}${stateLine(next)}`);
    detail.className = job ? 'detail busy' : tone === 'bad' ? 'detail bad' : 'detail';
    detail.title = `${next.image}\n${next.id.slice(0, 12)}`;

    // One inline action: Start for what isn't running, or the Remove question.
    const nextActionKey = removeArmed ? 'remove' : !isUp(next) && !job ? 'start' : '';
    if (nextActionKey !== actionKey) {
      actionKey = nextActionKey;
      action.replaceChildren();
      if (nextActionKey === 'remove') {
        const button = textButton(`Remove ${label(next)}?`, () => {
          removeArmed = false;
          act('remove');
        }, 'armed');
        action.append(button);
      } else if (nextActionKey === 'start') {
        action.append(textButton('Start', () => act('start'), 'primary'));
      }
    }
    const running = next.state === 'running';
    setText(cpu, running ? formatPercent(next.cpu) : '');
    cpu.classList.toggle('quiet', next.cpu === null || next.cpu < 1);
    setText(memory, running ? formatBytes(next.memory) : '');
    const items = containerMenu(next);
    const key = menuKey(items);
    if (!menu) {
      menu = mountMenu(menuCell, { label: '⋯', variant: 'ghost', size: 'xs', items, onSelect: onMenu });
      menuItems = key;
    } else if (key !== menuItems) {
      menu.update({ items });
      menuItems = key;
    }
    diag.hidden = !diagnosis;
    if (diagnosis) {
      diag.classList.toggle('pending', diagnosis.state === 'pending');
      const text = diagnosis.state === 'pending' ? 'Reading the logs…' : diagnosis.text;
      if (diag.dataset.text !== text) {
        diag.dataset.text = text;
        diag.replaceChildren(...withCode(text));
        if (diagnosis.state === 'done') diag.append(el('span', 'muted', 'From the last log lines, by the Small Model'));
      }
    }
  };
  update(initial);
  return {
    element,
    update,
    dispose: () => {
      clearTimeout(removeTimer);
      menu?.dispose();
    },
  };
};

const columns = (): HTMLElement => el('div', 'cols', '', [el('span'), el('span'), el('span'), el('span', 'cell', 'CPU'), el('span', 'cell', 'Memory'), el('span')]);

/** A list of container rows that keeps its row views between refreshes. */
const rowList = (app: App) => {
  const element = el('div', 'list');
  const views = new Map<string, RowView>();
  return {
    element,
    update: (rows: Container[]) => reconcile(element, views, rows, (row) => row.id, (row) => createRow(app, row), (view, row) => view.update(row), (view) => view.dispose()),
  };
};

// ----- Stacks -----

const stackTotals = (stack: Stack): { cpu: number | null; memory: number | null } => {
  const running = stack.containers.filter((row) => row.state === 'running');
  if (running.length === 0) return { cpu: null, memory: null };
  return {
    cpu: running.reduce((sum, row) => sum + (row.cpu ?? 0), 0),
    memory: running.reduce((sum, row) => sum + (row.memory ?? 0), 0),
  };
};

const stackSummary = (stack: Stack): string => {
  if (stack.containers.length === 0) return 'not up';
  if (stack.running === stack.containers.length) return `${stack.running} running`;
  if (stack.running === 0) return 'stopped';
  return `${stack.running}/${stack.containers.length} running`;
};

const stackRequest = (stack: Stack, action: string) => ({
  action,
  project: stack.project,
  workingDir: stack.workingDir,
  configFiles: stack.configFiles,
});

/** Stack verbs as text buttons; Down asks first. */
const stackActions = (app: App, stack: Stack, compose: boolean): HTMLElement => {
  const box = el('span', 'stack-actions');
  const job = app.jobFor('stack', stack.project);
  if (job) {
    box.append(el('span', 'detail busy', `${job.label}…`));
    return box;
  }
  const run = (action: string): void => app.run(() => postJob(app.host, '/stacks', stackRequest(stack, action)));
  if (stack.running === 0) {
    // Without Compose a stack can only be started if its containers exist.
    if (compose || stack.containers.length > 0) box.append(textButton('Up', () => run('up'), 'primary'));
  } else {
    box.append(textButton('Restart', () => run('restart')));
    box.append(compose
      ? armButton('Down', `Take ${stack.project} down?`, () => run('down'))
      : armButton('Stop', `Stop ${stack.project}?`, () => run('stop')));
  }
  return box;
};

type ProjectView = { element: HTMLElement; update: (stack: Stack, snapshot: Snapshot) => void };

const createProjectCard = (app: App): ProjectView => {
  const name = el('span', 'grow muted');
  const actions = el('span');
  const head = el('div', 'section-head', '', [el('span', 'label', 'This project'), name, actions]);
  const note = el('div', 'empty-note');
  const list = rowList(app);
  const cols = columns();
  const element = el('div', 'card', '', [head, cols, list.element, note]);
  let actionsKey = '';
  return {
    element,
    update: (stack, snapshot) => {
      const file = stack.configFiles[0]?.split('/').pop() ?? '';
      setText(name, [stack.project, file].filter(Boolean).join(' · '));
      name.title = stack.workingDir ?? '';
      const job = app.jobFor('stack', stack.project);
      const key = `${stack.running}/${stack.containers.length}/${job?.id ?? ''}/${snapshot.compose ?? ''}`;
      if (key !== actionsKey) {
        actionsKey = key;
        actions.replaceChildren(stackActions(app, stack, Boolean(snapshot.compose)));
      }
      const empty = stack.containers.length === 0;
      cols.hidden = empty;
      list.update(stack.containers);
      note.hidden = !empty;
      if (empty) {
        setText(note, notUpLine(stack, Boolean(snapshot.compose)));
      }
    },
  };
};

type GroupView = { element: HTMLElement; update: (stack: Stack, snapshot: Snapshot) => void };

const createStackGroup = (app: App, project: string, isOpen: (stack: Stack) => boolean, toggle: (stack: Stack) => void): GroupView => {
  let current: Stack | null = null;
  const name = el('b', '', project);
  const summary = el('span', 'muted');
  const actions = el('span', 'action');
  const cpu = el('span', 'cell num');
  const memory = el('span', 'cell num');
  const head = el('div', 'group-head', '', [el('span', 'gname', '', [name, summary]), actions, cpu, memory, el('span')]);
  head.tabIndex = 0;
  head.setAttribute('role', 'button');
  head.addEventListener('click', () => {
    if (current) toggle(current);
  });
  head.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (current) toggle(current);
    }
  });
  const list = rowList(app);
  const body = el('div', 'group-body', '', [list.element]);
  const element = el('div', 'group', '', [head, body]);
  let actionsKey = '';
  return {
    element,
    update: (stack, snapshot) => {
      current = stack;
      const open = isOpen(stack);
      element.classList.toggle('open', open);
      head.setAttribute('aria-expanded', String(open));
      setText(summary, stackSummary(stack));
      const totals = stackTotals(stack);
      setText(cpu, formatPercent(totals.cpu));
      setText(memory, totals.memory === null ? '' : formatBytes(totals.memory));
      const job = app.jobFor('stack', stack.project);
      const key = `${stack.running}/${stack.containers.length}/${job?.id ?? ''}/${snapshot.compose ?? ''}`;
      if (key !== actionsKey) {
        actionsKey = key;
        actions.replaceChildren(stackActions(app, stack, Boolean(snapshot.compose)));
      }
      if (open) list.update(stack.containers);
    },
  };
};

// ----- Home -----

export type HomeView = { element: HTMLElement; update: (snapshot: Snapshot) => void; setStorageSummary: (text: string) => void };

export const createHome = (app: App, banner: HTMLElement): HomeView => {
  const title = el('div', 'title');
  const subtitle = el('div', 'subtitle');
  const live = el('div', 'live', 'Live');
  const head = el('div', 'head', '', [el('div', 'titles', '', [title, subtitle]), live]);

  const projectBox = el('div', 'section');
  const projectViews = new Map<string, ProjectView>();

  const stacksList = el('div', 'list');
  const stacksSection = el('section', 'section', '', [el('div', 'section-head', '', [el('span', 'label', 'Other stacks')]), stacksList]);
  const groupViews = new Map<string, GroupView>();

  const standalone = rowList(app);
  const standaloneSection = el('section', 'section', '', [el('div', 'section-head', '', [el('span', 'label', 'Containers')]), columns(), standalone.element]);

  const nothing = el('div', 'empty-note', 'No containers yet. Start one with docker run or docker compose up and it shows up here.');

  const storageText = el('span', 'grow muted', 'Images, volumes, networks and disk space');
  const storageLink = el('button', 'storage-link', '', [el('span', 'label', 'Storage'), storageText, el('span', 'muted', '›')]);
  storageLink.type = 'button';
  storageLink.addEventListener('click', () => app.openStorage());

  const element = el('div', 'view', '', [head, banner, projectBox, stacksSection, standaloneSection, nothing, storageLink]);

  // A stack opens by itself while something in it needs a look; folding it
  // then holds until that problem is gone, so the next one opens it again.
  const openStacks = new Set<string>(app.prefs.get<string[]>('open-stacks', []));
  const foldedProblems = new Set<string>(app.prefs.get<string[]>('folded-problem-stacks', []));
  const hasProblem = (stack: Stack): boolean => stack.containers.some(needsAttention);
  const isStackOpen = (stack: Stack): boolean => openStacks.has(stack.project) || (hasProblem(stack) && !foldedProblems.has(stack.project));
  const savePrefs = (): void => {
    app.prefs.set('open-stacks', [...openStacks]);
    app.prefs.set('folded-problem-stacks', [...foldedProblems]);
  };
  let lastSnapshot: Snapshot | null = null;
  const toggleStack = (stack: Stack): void => {
    if (isStackOpen(stack)) {
      openStacks.delete(stack.project);
      if (hasProblem(stack)) foldedProblems.add(stack.project);
    } else {
      openStacks.add(stack.project);
      foldedProblems.delete(stack.project);
    }
    savePrefs();
    if (lastSnapshot) update(lastSnapshot);
  };

  const update = (snapshot: Snapshot): void => {
    lastSnapshot = snapshot;
    const { engine, containers } = snapshot;
    setText(title, engine.version ? `${engine.name} · Docker ${engine.version}` : engine.name);
    const running = containers.filter((row) => row.state === 'running');
    const cpu = running.reduce((sum, row) => sum + (row.cpu ?? 0), 0);
    const memory = running.reduce((sum, row) => sum + (row.memory ?? 0), 0);
    setText(subtitle, [
      engine.context && engine.context !== 'default' ? `context ${engine.context}` : '',
      `${plural(containers.length, 'container')}, ${running.length} running`,
      running.length > 0 && snapshot.statsLive ? `${formatPercent(cpu)} CPU · ${formatBytes(memory)}` : '',
    ].filter(Boolean).join(' · '));
    subtitle.title = engine.endpoint ?? '';
    live.classList.remove('stale');
    setText(live, 'Live');

    const groups = groupContainers(containers, snapshot.project);
    reconcile(projectBox, projectViews, groups.project, (stack) => stack.project, () => createProjectCard(app), (view, stack) => view.update(stack, snapshot));
    projectBox.hidden = groups.project.length === 0;

    reconcile(stacksList, groupViews, groups.stacks, (stack) => stack.project, (stack) => createStackGroup(app, stack.project, isStackOpen, toggleStack), (view, stack) => view.update(stack, snapshot));
    stacksSection.hidden = groups.stacks.length === 0;
    // A problem that's gone releases its fold.
    let released = false;
    for (const stack of groups.stacks) {
      if (!hasProblem(stack) && foldedProblems.delete(stack.project)) released = true;
    }
    if (released) savePrefs();

    standalone.update(groups.standalone);
    standaloneSection.hidden = groups.standalone.length === 0;
    nothing.hidden = containers.length > 0 || groups.project.length > 0;

    app.diagnoses.consider([...groups.project.flatMap((stack) => stack.containers), ...groups.standalone, ...groups.stacks.flatMap((stack) => stack.containers)]);
  };

  return {
    element,
    update,
    setStorageSummary: (text) => setText(storageText, text),
  };
};

export const storageSummary = (total: number, reclaimable: number): string => `${formatDisk(total)}${reclaimable > 0 ? ` · ${formatDisk(reclaimable)} reclaimable` : ''}`;
