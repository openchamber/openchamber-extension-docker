import { mountButton } from '@openchamber/sdk/ui';
import type { ContainerRow } from '../types.ts';

export const renderExecView = (
  container: ContainerRow,
  output: string | null,
  exitCode: number | null,
  busy: boolean,
  onRunCommand: (command: string) => void,
  onBack: () => void,
  onCopyTerminalCmd?: () => void,
): HTMLElement => {
  const root = document.createElement('div');
  root.className = 'docker-exec';

  // Header toolbar
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
  title.style.flex = '1 1 auto';
  title.textContent = `Exec — ${container.names.replace(/^\//, '')}`;
  toolbar.appendChild(title);

  if (onCopyTerminalCmd) {
    mountButton(toolbar, {
      label: 'Copy docker exec',
      variant: 'secondary',
      size: 'xs',
      onClick: onCopyTerminalCmd,
    });
  }

  root.appendChild(toolbar);

  // Quick preset commands
  const presets = document.createElement('div');
  presets.className = 'docker-exec-presets';

  const presetList = [
    { label: 'ps aux', cmd: 'ps aux' },
    { label: 'env', cmd: 'env' },
    { label: 'df -h', cmd: 'df -h' },
    { label: 'free -m', cmd: 'free -m 2>/dev/null || cat /proc/meminfo | head -n 5' },
    { label: 'uname -a', cmd: 'uname -a' },
  ];

  for (const p of presetList) {
    const btn = document.createElement('button');
    btn.className = 'docker-exec-preset';
    btn.textContent = p.label;
    btn.disabled = busy;
    btn.addEventListener('click', () => onRunCommand(p.cmd));
    presets.appendChild(btn);
  }

  root.appendChild(presets);

  // Output view
  const outPre = document.createElement('pre');
  outPre.className = 'docker-exec-output';
  if (output === null) {
    outPre.textContent = 'Enter a command below to execute inside the container.';
    outPre.style.opacity = '0.6';
  } else {
    outPre.style.opacity = '1';
    let codeBadge = '';
    if (exitCode !== null) {
      codeBadge = exitCode === 0 ? '[Exit 0]\n\n' : `[Exit ${exitCode}]\n\n`;
    }
    outPre.textContent = `${codeBadge}${output}`;
  }
  root.appendChild(outPre);

  // Command input form
  const form = document.createElement('form');
  form.className = 'docker-exec-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'docker-exec-input';
  input.placeholder = 'e.g. ls -la /app';
  input.disabled = busy;

  form.appendChild(input);

  mountButton(form, {
    label: busy ? 'Running...' : 'Run',
    variant: 'default',
    size: 'sm',
    disabled: busy,
    onClick: () => {
      const val = input.value.trim();
      if (val) onRunCommand(val);
    },
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (val && !busy) {
      onRunCommand(val);
    }
  });

  root.appendChild(form);

  return root;
};
