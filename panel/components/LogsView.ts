import { mountButton } from '@openchamber/sdk/ui';
import type { ContainerRow, LogsView } from '../types.ts';
import { highlightCode } from '../highlight.ts';

export const updateLogsContent = (
  root: HTMLElement,
  logs: LogsView | null,
  searchQuery: string,
  busy: boolean,
  initialScrollTop = -1,
): void => {
  const outPre = root.querySelector<HTMLPreElement>('.docker-logs-preview');
  if (!outPre) return;
  if (!logs) {
    outPre.textContent = busy ? 'Loading logs...' : 'No logs available.';
    return;
  }
  const q = searchQuery.trim().toLowerCase();
  let filteredText = logs.text;
  if (q) {
    const lines = logs.text.split('\n');
    filteredText = lines.filter((line) => line.toLowerCase().includes(q)).join('\n');
  }
  const html = highlightCode(filteredText || '(No matching log lines)', 'log');
  outPre.innerHTML = html;

  requestAnimationFrame(() => {
    if (initialScrollTop < 0) {
      outPre.scrollTop = outPre.scrollHeight;
    } else {
      outPre.scrollTop = initialScrollTop;
    }
  });
};

export const renderLogsView = (
  container: ContainerRow,
  logs: LogsView | null,
  busy: boolean,
  live: boolean,
  tail: number,
  searchQuery: string,
  wordWrap: boolean,
  onBack: () => void,
  onTailChange: (newTail: number) => void,
  onToggleLive: () => void,
  onSearchChange: (query: string) => void,
  onToggleWrap: () => void,
  onCopy: () => void,
  onAskChat: () => void,
  initialScrollTop = -1,
  onScroll?: (scrollTop: number, isAtBottom: boolean) => void,
): HTMLElement => {
  const root = document.createElement('div');
  root.className = 'docker-logs';
  root.dataset.containerId = container.id;

  // Toolbar row 1: Back, Title, Controls
  const toolbar = document.createElement('div');
  toolbar.className = 'docker-logs-toolbar';

  mountButton(toolbar, {
    label: 'Back',
    variant: 'secondary',
    size: 'xs',
    onClick: onBack,
  });

  const title = document.createElement('span');
  title.style.fontWeight = '600';
  title.style.fontSize = '0.8125rem';
  title.textContent = `Logs — ${container.names.replace(/^\//, '')}`;
  toolbar.appendChild(title);

  // Tail select
  const tailSelect = document.createElement('select');
  tailSelect.className = 'docker-search';
  tailSelect.style.height = '28px';
  tailSelect.style.padding = '0 6px';
  tailSelect.style.fontSize = '0.75rem';

  const tails = [50, 100, 200, 500, 1000, 2000];
  for (const t of tails) {
    const opt = document.createElement('option');
    opt.value = String(t);
    opt.textContent = `${t} lines`;
    if (t === tail) opt.selected = true;
    tailSelect.appendChild(opt);
  }
  tailSelect.addEventListener('change', () => {
    onTailChange(Number(tailSelect.value));
  });
  toolbar.appendChild(tailSelect);

  // Live toggle
  mountButton(toolbar, {
    label: live ? 'Live: ON' : 'Live: OFF',
    variant: live ? 'default' : 'secondary',
    size: 'xs',
    onClick: onToggleLive,
  });

  // Copy button
  mountButton(toolbar, {
    label: 'Copy',
    variant: 'secondary',
    size: 'xs',
    onClick: onCopy,
  });

  // Ask in chat button
  mountButton(toolbar, {
    label: 'Ask in chat',
    variant: 'default',
    size: 'xs',
    onClick: onAskChat,
  });

  root.appendChild(toolbar);

  // Toolbar row 2: Search input and Wrap toggle
  const subBar = document.createElement('div');
  subBar.className = 'docker-logs-toolbar';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'docker-search';
  searchInput.style.height = '28px';
  searchInput.style.fontSize = '0.75rem';
  searchInput.placeholder = 'Filter log lines...';
  searchInput.value = searchQuery;
  subBar.appendChild(searchInput);

  mountButton(subBar, {
    label: wordWrap ? 'Wrap: ON' : 'Wrap: OFF',
    variant: wordWrap ? 'default' : 'secondary',
    size: 'xs',
    onClick: onToggleWrap,
  });

  root.appendChild(subBar);

  // Logs display
  const outPre = document.createElement('pre');
  outPre.className = 'docker-fs-preview docker-logs-preview';
  outPre.style.whiteSpace = wordWrap ? 'pre-wrap' : 'pre';

  searchInput.addEventListener('input', () => {
    onSearchChange(searchInput.value);
    updateLogsContent(root, logs, searchInput.value, busy, initialScrollTop);
  });

  outPre.addEventListener('scroll', () => {
    if (onScroll) {
      const isAtBottom = (outPre.scrollHeight - outPre.scrollTop - outPre.clientHeight) < 40;
      onScroll(outPre.scrollTop, isAtBottom);
    }
  }, { passive: true });

  root.appendChild(outPre);

  updateLogsContent(root, logs, searchQuery, busy, initialScrollTop);

  return root;
};
