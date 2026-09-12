import { mountButton } from '@openchamber/sdk/ui';
import type { ContainerRow, InspectView } from '../types.ts';

export const renderInspectView = (
  container: ContainerRow,
  inspectData: InspectView | null,
  busy: boolean,
  onBack: () => void,
  onOpenUrl: (url: string) => void,
  onExec?: () => void,
): HTMLElement => {
  const root = document.createElement('div');
  root.className = 'docker-inspect-view';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = '12px';
  root.style.padding = '12px';
  root.style.height = '100%';
  root.style.overflowY = 'auto';

  // Header toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'docker-logs-toolbar';
  toolbar.style.display = 'flex';
  toolbar.style.alignItems = 'center';
  toolbar.style.gap = '8px';

  mountButton(toolbar, {
    label: 'Back',
    variant: 'secondary',
    size: 'xs',
    onClick: onBack,
  });

  const title = document.createElement('span');
  title.style.fontWeight = '600';
  title.style.fontSize = '0.875rem';
  title.style.flex = '1 1 auto';
  title.textContent = `Inspect — ${container.names.replace(/^\//, '')}`;
  toolbar.appendChild(title);

  if (onExec && container.state.toLowerCase() === 'running') {
    mountButton(toolbar, {
      label: 'Exec',
      variant: 'default',
      size: 'xs',
      onClick: onExec,
    });
  }

  root.appendChild(toolbar);

  if (busy && !inspectData) {
    const loading = document.createElement('div');
    loading.style.padding = '24px';
    loading.style.textAlign = 'center';
    loading.style.opacity = '0.6';
    loading.textContent = 'Loading container details...';
    root.appendChild(loading);
    return root;
  }

  const data = inspectData ?? {
    id: container.id,
    name: container.names,
    image: container.image,
    created: '',
    state: container.state,
    status: container.status,
    health: container.health,
    command: '',
    entrypoint: '',
    env: [],
    mounts: [],
    networks: [],
    ports: container.ports,
    compose: container.compose,
    restartPolicy: '',
  };

  const createCard = (cardTitle: string): { card: HTMLElement; body: HTMLElement } => {
    const card = document.createElement('div');
    card.className = 'docker-section';
    card.style.padding = '12px';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '8px';

    const h = document.createElement('h3');
    h.style.margin = '0';
    h.style.fontSize = '0.8125rem';
    h.style.fontWeight = '600';
    h.style.color = 'var(--oc-text-muted, #a1a1aa)';
    h.style.textTransform = 'uppercase';
    h.style.letterSpacing = '0.05em';
    h.textContent = cardTitle;
    card.appendChild(h);

    const body = document.createElement('div');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '6px';
    card.appendChild(body);

    return { card, body };
  };

  const createRow = (label: string, value: string | HTMLElement): HTMLElement => {
    const r = document.createElement('div');
    r.style.display = 'flex';
    r.style.alignItems = 'center';
    r.style.fontSize = '0.8125rem';
    r.style.gap = '8px';

    const l = document.createElement('span');
    l.style.width = '120px';
    l.style.flexShrink = '0';
    l.style.color = 'var(--oc-text-muted, #a1a1aa)';
    l.textContent = label;

    r.appendChild(l);

    if (typeof value === 'string') {
      const v = document.createElement('span');
      v.style.wordBreak = 'break-all';
      v.textContent = value || '—';
      r.appendChild(v);
    } else {
      r.appendChild(value);
    }

    return r;
  };

  // Section 1: Overview
  const { card: overviewCard, body: overviewBody } = createCard('Overview');
  overviewBody.appendChild(createRow('ID', data.id));
  overviewBody.appendChild(createRow('Name', data.name));
  overviewBody.appendChild(createRow('Image', data.image));
  overviewBody.appendChild(createRow('Status', `${data.status}${data.health ? ` (${data.health})` : ''}`));
  if (data.created) overviewBody.appendChild(createRow('Created', data.created));
  if (data.restartPolicy) overviewBody.appendChild(createRow('Restart Policy', data.restartPolicy));
  if (data.command) overviewBody.appendChild(createRow('Command', data.command));
  if (data.entrypoint) overviewBody.appendChild(createRow('Entrypoint', data.entrypoint));
  root.appendChild(overviewCard);

  // Section 2: Ports & Networks
  const { card: netCard, body: netBody } = createCard('Networking & Ports');
  if (data.ports.length > 0) {
    const portsContainer = document.createElement('div');
    portsContainer.style.display = 'flex';
    portsContainer.style.flexWrap = 'wrap';
    portsContainer.style.gap = '6px';

    for (const p of data.ports) {
      const link = document.createElement('a');
      link.className = 'docker-port-badge';
      const targetUrl = p.url || `http://localhost:${p.hostPort}`;
      link.href = targetUrl;
      link.target = '_blank';
      link.textContent = `${p.hostPort}:${p.containerPort}/${p.protocol}`;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenUrl(targetUrl);
      });
      portsContainer.appendChild(link);
    }
    netBody.appendChild(createRow('Ports', portsContainer));
  } else {
    netBody.appendChild(createRow('Ports', 'No exposed ports'));
  }

  netBody.appendChild(createRow('Networks', data.networks.length > 0 ? data.networks.join(', ') : 'None'));
  root.appendChild(netCard);

  // Section 3: Mounts / Volumes
  if (data.mounts.length > 0) {
    const { card: mountCard, body: mountBody } = createCard('Mounts & Volumes');
    for (const m of data.mounts) {
      const mountLine = document.createElement('div');
      mountLine.style.fontSize = '0.75rem';
      mountLine.style.fontFamily = 'monospace';
      mountLine.style.padding = '4px 8px';
      mountLine.style.background = 'var(--oc-bg-subtle, rgba(255,255,255,0.03))';
      mountLine.style.borderRadius = '4px';
      mountLine.textContent = `[${m.type.toUpperCase()}] ${m.source || m.name} ➔ ${m.destination} (${m.mode || (m.rw ? 'rw' : 'ro')})`;
      mountBody.appendChild(mountLine);
    }
    root.appendChild(mountCard);
  }

  // Section 4: Environment Variables
  if (data.env.length > 0) {
    const { card: envCard, body: envBody } = createCard(`Environment Variables (${data.env.length})`);
    const envBox = document.createElement('pre');
    envBox.style.margin = '0';
    envBox.style.padding = '8px';
    envBox.style.maxHeight = '180px';
    envBox.style.overflowY = 'auto';
    envBox.style.fontFamily = 'monospace';
    envBox.style.fontSize = '0.75rem';
    envBox.style.background = 'var(--oc-bg-subtle, rgba(0,0,0,0.2))';
    envBox.style.borderRadius = '4px';
    envBox.style.whiteSpace = 'pre-wrap';
    envBox.style.wordBreak = 'break-all';
    envBox.textContent = data.env.join('\n');
    envBody.appendChild(envBox);
    root.appendChild(envCard);
  }

  return root;
};
