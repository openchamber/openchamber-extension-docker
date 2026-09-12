import type { MainTabId, SystemDfItem } from '../types.ts';
import { mountButton } from '@openchamber/sdk/ui';

const parsePercentage = (percStr: string | null | undefined): number => {
  if (!percStr) return 0;
  const num = parseFloat(String(percStr).replace('%', '').trim());
  return isNaN(num) ? 0 : Math.min(100, Math.max(0, num));
};

const getLevel = (percentage: number): 'normal' | 'warn' | 'danger' => {
  if (percentage >= 85) return 'danger';
  if (percentage >= 65) return 'warn';
  return 'normal';
};

export const renderTabs = (
  activeTab: MainTabId,
  counts: { containers: number; compose: number; images: number; volumes: number; networks: number; system?: number },
  onSelectTab: (tab: MainTabId) => void,
  initialScrollLeft = 0,
  onScroll?: (scrollLeft: number) => void,
): HTMLElement => {
  const container = document.createElement('div');
  container.className = 'docker-tabs';

  if (initialScrollLeft > 0) {
    container.scrollLeft = initialScrollLeft;
    setTimeout(() => {
      container.scrollLeft = initialScrollLeft;
    }, 0);
  }

  if (onScroll) {
    container.addEventListener('scroll', () => {
      onScroll(container.scrollLeft);
    }, { passive: true });
  }

  const tabs: Array<{ id: MainTabId; label: string; count?: number }> = [
    { id: 'containers', label: 'Containers', count: counts.containers },
    { id: 'compose', label: 'Compose', count: counts.compose },
    { id: 'images', label: 'Images', count: counts.images },
    { id: 'volumes', label: 'Volumes', count: counts.volumes },
    { id: 'networks', label: 'Networks', count: counts.networks },
    { id: 'system', label: 'System Usage' },
  ];

  for (const tab of tabs) {
    const btn = document.createElement('button');
    btn.className = 'docker-tab';
    btn.dataset.active = tab.id === activeTab ? 'true' : 'false';

    const labelSpan = document.createElement('span');
    labelSpan.textContent = tab.label;

    btn.appendChild(labelSpan);

    if (tab.count !== undefined) {
      const countSpan = document.createElement('span');
      countSpan.className = 'docker-tab-count';
      countSpan.textContent = String(tab.count);
      btn.appendChild(countSpan);
    }

    btn.addEventListener('click', () => {
      if (onScroll) onScroll(container.scrollLeft);
      onSelectTab(tab.id);
    });
    container.appendChild(btn);
  }

  return container;
};

export const renderStatsGroup = (stats: { cpu?: string; mem?: string; memPerc?: string } | null | undefined): HTMLElement => {
  const group = document.createElement('div');
  group.className = 'docker-stats-group';
  if (!stats) return group;

  const cpuText = (stats.cpu || '0%').trim();
  const rawMem = stats.mem || '0B';
  const memText = rawMem.replace(/\s*\/\s*/g, '/').trim();

  const statsSpan = document.createElement('span');
  statsSpan.className = 'docker-stats-text';
  statsSpan.textContent = `CPU ${cpuText} · RAM ${memText}`;

  group.appendChild(statsSpan);
  return group;
};

const parseBytes = (str: string | undefined | null): number => {
  if (!str) return 0;
  const match = str.match(/([0-9.]+)\s*([a-zA-Z]+)?/);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  if (isNaN(val)) return 0;
  const unit = (match[2] || '').toUpperCase();
  if (unit.startsWith('K') || unit === 'KB') return val * 1024;
  if (unit.startsWith('M') || unit === 'MB') return val * 1024 * 1024;
  if (unit.startsWith('G') || unit === 'GB') return val * 1024 * 1024 * 1024;
  if (unit.startsWith('T') || unit === 'TB') return val * 1024 * 1024 * 1024 * 1024;
  return val;
};

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(2) : val.toFixed(1)} ${units[i]}`;
};

export const renderSystemView = (
  items: SystemDfItem[],
  onPruneItem: (type: string) => void,
  pruneBusyType: string | null,
  danglingImagesCount = 0,
): HTMLElement => {
  const root = document.createElement('div');
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.gap = '8px';

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '24px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--oc-text-muted, rgba(255,255,255,0.5))';
    empty.textContent = 'No system usage data available.';
    root.appendChild(empty);
    return root;
  }

  // Totals calculation
  let totalSizeBytes = 0;
  let totalReclaimableBytes = 0;

  for (const item of items) {
    totalSizeBytes += parseBytes(item.Size);
    if (item.Reclaimable) {
      const recPart = item.Reclaimable.split('(')[0].trim();
      totalReclaimableBytes += parseBytes(recPart);
    }
  }

  // Summary Row Card
  const summaryCard = document.createElement('div');
  summaryCard.className = 'docker-section';
  summaryCard.style.padding = '10px 12px';

  const summaryHeader = document.createElement('div');
  summaryHeader.className = 'docker-title-row';

  const summaryLabel = document.createElement('span');
  summaryLabel.className = 'docker-section-label';
  summaryLabel.textContent = 'Total Docker Storage';

  const summaryBadge = document.createElement('span');
  summaryBadge.className = 'docker-section-count';
  summaryBadge.textContent = `${items.length} Categories`;

  summaryHeader.appendChild(summaryLabel);
  summaryHeader.appendChild(summaryBadge);
  summaryCard.appendChild(summaryHeader);

  const summaryBody = document.createElement('div');
  summaryBody.style.display = 'flex';
  summaryBody.style.alignItems = 'baseline';
  summaryBody.style.justifyContent = 'space-between';
  summaryBody.style.marginTop = '6px';

  const totalSizeSpan = document.createElement('span');
  totalSizeSpan.style.fontSize = '1.25rem';
  totalSizeSpan.style.fontWeight = '700';
  totalSizeSpan.textContent = formatBytes(totalSizeBytes);

  const totalRecSpan = document.createElement('span');
  totalRecSpan.style.fontSize = '0.75rem';
  totalRecSpan.style.color = 'var(--oc-text-muted, rgba(255,255,255,0.6))';
  totalRecSpan.textContent = `Est. Reclaimable: ${formatBytes(totalReclaimableBytes)}`;

  summaryBody.appendChild(totalSizeSpan);
  summaryBody.appendChild(totalRecSpan);
  summaryCard.appendChild(summaryBody);

  root.appendChild(summaryCard);

  // Category Cards List
  const list = document.createElement('div');
  list.className = 'docker-list';

  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'docker-section';
    card.style.padding = '10px 12px';

    const headerRow = document.createElement('div');
    headerRow.className = 'docker-title-row';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'docker-section-label';
    titleSpan.textContent = item.Type;

    const rightGroup = document.createElement('div');
    rightGroup.style.display = 'flex';
    rightGroup.style.alignItems = 'center';
    rightGroup.style.gap = '8px';

    const activeNum = parseInt(item.Active, 10) || 0;
    const totalNum = parseInt(item.TotalCount, 10) || 0;
    const unusedNum = Math.max(0, totalNum - activeNum);

    const countBadge = document.createElement('span');
    countBadge.className = 'docker-section-count';
    countBadge.textContent = `${item.Active} active / ${item.TotalCount} total`;

    const isBusy = pruneBusyType === item.Type;
    const cleanLabel = item.Type.replace(/^Local\s+/, '');
    const pruneBtnBox = document.createElement('div');
    mountButton(pruneBtnBox, {
      label: isBusy ? 'Pruning...' : `Prune ${cleanLabel}`,
      variant: 'secondary',
      size: 'xs',
      disabled: Boolean(pruneBusyType),
      onClick: () => onPruneItem(item.Type),
    });

    rightGroup.appendChild(countBadge);
    rightGroup.appendChild(pruneBtnBox);

    headerRow.appendChild(titleSpan);
    headerRow.appendChild(rightGroup);
    card.appendChild(headerRow);

    const bodyRow = document.createElement('div');
    bodyRow.style.display = 'flex';
    bodyRow.style.alignItems = 'baseline';
    bodyRow.style.justifyContent = 'space-between';
    bodyRow.style.marginTop = '6px';

    const sizeVal = document.createElement('span');
    sizeVal.style.fontSize = '1.125rem';
    sizeVal.style.fontWeight = '600';
    sizeVal.textContent = item.Size || '0B';

    const metaRight = document.createElement('div');
    metaRight.style.display = 'flex';
    metaRight.style.gap = '10px';
    metaRight.style.fontSize = '0.75rem';
    metaRight.style.color = 'var(--oc-text-muted, rgba(255,255,255,0.6))';

    if (item.Type.toLowerCase().includes('image') && danglingImagesCount > 0) {
      const dangSpan = document.createElement('span');
      dangSpan.textContent = `Dangling: ${danglingImagesCount}`;
      metaRight.appendChild(dangSpan);
    } else if (unusedNum > 0) {
      const unusedSpan = document.createElement('span');
      unusedSpan.textContent = `Unused: ${unusedNum}`;
      metaRight.appendChild(unusedSpan);
    }

    if (item.Reclaimable) {
      const recVal = document.createElement('span');
      recVal.textContent = `Est. Reclaimable: ${item.Reclaimable}`;
      metaRight.appendChild(recVal);
    }

    bodyRow.appendChild(sizeVal);
    bodyRow.appendChild(metaRight);

    card.appendChild(bodyRow);
    list.appendChild(card);
  }

  root.appendChild(list);
  return root;
};
