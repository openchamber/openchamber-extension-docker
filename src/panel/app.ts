// What every panel view gets: the host, the latest snapshot, navigation, and
// a way to start a job that reports back when it ends.
import type { HostClient } from '@openchamber/sdk';

import { el } from '../shared/dom.ts';
import { t } from '../shared/i18n.ts';
import type { Container, Job, Snapshot } from '../shared/types.ts';
import type { Diagnoses } from './diagnosis.ts';

export type Tab = 'logs' | 'files' | 'shell' | 'inspect';

export type App = {
  host: HostClient;
  snapshot: () => Snapshot | null;
  directory: () => string | null;
  /** Starts a job through the service; failures and slow results come back as toasts. */
  run: (start: () => Promise<Job>) => void;
  /** The running job on a target, from any frame. */
  jobFor: (kind: Job['kind'], target: string) => Job | undefined;
  openContainer: (id: string, tab?: Tab) => void;
  openStorage: () => void;
  goHome: () => void;
  diagnoses: Diagnoses;
  prefs: Prefs;
  container: (id: string) => Container | undefined;
  openUrl: (url: string) => void;
  copy: (text: string, what: string) => void;
};

export type Prefs = {
  get: <T>(key: string, fallback: T) => T;
  set: (key: string, value: unknown) => void;
};

/**
 * A text button that asks once before it acts: the first click turns it into
 * the question, the second acts. It settles back after a few seconds.
 */
export const armButton = (label: string, question: string, onConfirm: () => void, className = 'danger'): HTMLButtonElement => {
  const button = el('button', `tb ${className}`, label);
  button.type = 'button';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const disarm = (): void => {
    button.classList.remove('armed');
    button.textContent = t(label);
    delete button.dataset.armed;
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (button.disabled) return;
    if (!button.dataset.armed) {
      button.dataset.armed = '1';
      button.classList.add('armed');
      button.textContent = t(question);
      clearTimeout(timer);
      timer = setTimeout(disarm, 4_000);
      return;
    }
    clearTimeout(timer);
    disarm();
    onConfirm();
  });
  return button;
};

export const icon = {
  back: '‹',
  folder: '▸',
  file: '·',
  link: '↪',
};
