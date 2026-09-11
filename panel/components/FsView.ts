import { mountButton } from '@openchamber/sdk/ui';
import type { ContainerRow, FsListing, FsFile } from '../types.ts';
import { highlightCode, languageFromPath } from '../highlight.ts';

export const renderFsView = (
  container: ContainerRow,
  fsPath: string,
  fsListing: FsListing | null,
  fsFile: FsFile | null,
  fsBusy: boolean,
  showHidden: boolean,
  onBack: () => void,
  onNavigate: (path: string) => void,
  onToggleHidden: () => void,
): HTMLElement => {
  const root = document.createElement('div');
  root.className = 'docker-fs';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'docker-fs-toolbar';

  mountButton(toolbar, {
    label: 'Back',
    variant: 'secondary',
    size: 'xs',
    onClick: onBack,
  });

  const title = document.createElement('span');
  title.style.fontWeight = '600';
  title.style.fontSize = '0.8125rem';
  title.textContent = `Files — ${container.names.replace(/^\//, '')}`;
  toolbar.appendChild(title);

  mountButton(toolbar, {
    label: showHidden ? 'Hidden: ON' : 'Hidden: OFF',
    variant: showHidden ? 'default' : 'secondary',
    size: 'xs',
    onClick: onToggleHidden,
  });

  root.appendChild(toolbar);

  // Path bar
  const pathBar = document.createElement('div');
  pathBar.className = 'docker-fs-path';
  pathBar.textContent = fsPath;
  root.appendChild(pathBar);

  if (fsBusy) {
    const busyNote = document.createElement('div');
    busyNote.className = 'docker-fs-note';
    busyNote.textContent = 'Loading filesystem...';
    root.appendChild(busyNote);
    return root;
  }

  // Preview file if viewing file
  if (fsFile) {
    const filePre = document.createElement('pre');
    filePre.className = 'docker-fs-preview';
    if (fsFile.binary) {
      filePre.textContent = `[Binary file (${fsFile.size} bytes)]`;
    } else {
      const lang = languageFromPath(fsFile.path);
      const code = fsFile.content ?? '';
      filePre.innerHTML = highlightCode(code, lang);
    }
    root.appendChild(filePre);
    return root;
  }

  // Render Directory listing
  if (fsListing) {
    const list = document.createElement('div');
    list.className = 'docker-fs-list';

    // Parent directory row
    if (fsListing.path !== '/') {
      const upBtn = document.createElement('button');
      upBtn.className = 'docker-fs-entry';

      const kindSpan = document.createElement('span');
      kindSpan.className = 'docker-fs-kind';
      kindSpan.textContent = 'DIR';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'docker-fs-name';
      nameSpan.textContent = '..';

      upBtn.appendChild(kindSpan);
      upBtn.appendChild(nameSpan);
      upBtn.addEventListener('click', () => onNavigate(fsListing.parent));
      list.appendChild(upBtn);
    }

    const filteredEntries = fsListing.entries.filter((entry) => showHidden || !entry.hidden);

    if (filteredEntries.length === 0) {
      const emptyNote = document.createElement('div');
      emptyNote.className = 'docker-fs-note';
      emptyNote.textContent = 'Directory is empty.';
      list.appendChild(emptyNote);
    } else {
      for (const entry of filteredEntries) {
        const btn = document.createElement('button');
        btn.className = 'docker-fs-entry';
        if (entry.hidden) btn.dataset.hidden = 'true';

        const kindSpan = document.createElement('span');
        kindSpan.className = 'docker-fs-kind';
        kindSpan.textContent = entry.type === 'dir' ? 'DIR' : entry.type === 'file' ? 'FILE' : 'OTHER';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'docker-fs-name';
        nameSpan.textContent = entry.name;

        btn.appendChild(kindSpan);
        btn.appendChild(nameSpan);
        btn.addEventListener('click', () => onNavigate(entry.path));
        list.appendChild(btn);
      }
    }

    root.appendChild(list);
  }

  return root;
};
