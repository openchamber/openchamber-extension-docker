// One container: its state and actions on top, then Logs, Files, Shell and
// Inspect as tabs of the same screen.
import { postJob } from '../shared/client.ts';
import { el, setText, textButton } from '../shared/dom.ts';
import { t } from '../shared/i18n.ts';
import { isUp, label, portUrl, stateLine, toneOf } from '../shared/stacks.ts';
import type { Container } from '../shared/types.ts';
import { armButton, type App, type Tab } from './app.ts';
import { createFilesTab, createInspectTab, createShellTab, type TabView } from './inside.ts';
import { createLogsTab } from './logs.ts';

const TABS: { id: Tab; label: string }[] = [
  { id: 'logs', label: 'Logs' },
  { id: 'files', label: 'Files' },
  { id: 'shell', label: 'Shell' },
  { id: 'inspect', label: 'Inspect' },
];

export type ContainerView = {
  id: string;
  element: HTMLElement;
  update: (row: Container | undefined) => void;
  select: (tab: Tab) => void;
  dispose: () => void;
};

export const createContainerView = (app: App, initial: Container, tab: Tab): ContainerView => {
  let current = initial;
  let gone = false;
  const getContainer = (): Container => current;

  const back = textButton('‹', () => app.goHome(), 'back');
  back.title = t('All containers');
  const dot = el('span', 'dot');
  const title = el('div', 'title');
  const subtitle = el('div', 'subtitle');
  const actions = el('div', 'stack-actions');
  const head = el('div', 'head', '', [back, el('div', 'titles', '', [el('div', 'line1', '', [dot, title]), subtitle]), actions]);

  const segmented = el('div', 'segmented');
  segmented.setAttribute('role', 'tablist');
  const tabButtons = new Map<Tab, HTMLButtonElement>();
  for (const item of TABS) {
    const button = el('button', '', item.label);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => select(item.id));
    tabButtons.set(item.id, button);
    segmented.append(button);
  }

  const views: Record<Tab, TabView> = {
    logs: createLogsTab(app, getContainer),
    files: createFilesTab(app, getContainer),
    shell: createShellTab(app, getContainer),
    inspect: createInspectTab(app, getContainer),
  };
  const body = el('div', 'tab-body');
  const element = el('div', 'view fill', '', [head, segmented, body]);

  let active: Tab | null = null;
  const select = (next: Tab): void => {
    if (next === active) return;
    if (active) views[active].hide();
    active = next;
    for (const [id, button] of tabButtons) button.setAttribute('aria-pressed', String(id === next));
    body.replaceChildren(views[next].element);
    views[next].show();
  };

  let actionsKey = '';
  let state = initial.state;
  const paint = (): void => {
    const row = current;
    const job = app.jobFor('container', row.id);
    dot.dataset.tone = gone ? 'off' : toneOf(row);
    dot.classList.toggle('busy', Boolean(job));
    title.replaceChildren(document.createTextNode(label(row)));
    if (row.compose) title.append(el('span', 'muted', `  ${row.compose.project}`));
    const ports = row.ports.filter((port) => port.protocol === 'tcp').map((port) => `:${port.hostPort}`).join(' ');
    setText(subtitle, gone ? 'This container was removed.' : [row.image, job ? `${job.label}…` : stateLine(row), ports].filter(Boolean).join(' · '));
    const key = gone ? 'gone' : `${row.state}/${job?.id ?? ''}/${ports}`;
    if (key === actionsKey) return;
    actionsKey = key;
    actions.replaceChildren();
    if (gone || job) return;
    const act = (verb: string): void => app.run(() => postJob(app.host, `/containers/${row.id}/${verb}`));
    const web = row.ports.find((port) => port.protocol === 'tcp');
    if (web && row.state === 'running') actions.append(textButton('Open', () => app.openUrl(portUrl(web))));
    if (row.state === 'paused') actions.append(textButton('Resume', () => act('unpause'), 'primary'));
    if (isUp(row)) {
      if (row.state === 'running') actions.append(textButton('Restart', () => act('restart')));
      actions.append(armButton('Stop', `Stop ${label(row)}?`, () => act('stop')));
    } else {
      actions.append(textButton('Start', () => act('start'), 'primary'));
      actions.append(armButton('Remove', `Remove ${label(row)}?`, () => {
        act('remove');
        app.goHome();
      }));
    }
  };

  paint();
  select(tab);

  return {
    id: initial.id,
    element,
    select,
    update: (row) => {
      if (!row) {
        gone = true;
        paint();
        return;
      }
      const changedState = row.state !== state;
      current = row;
      state = row.state;
      paint();
      if (changedState) for (const view of Object.values(views)) view.refresh?.(row);
    },
    dispose: () => {
      for (const view of Object.values(views)) view.dispose();
    },
  };
};
