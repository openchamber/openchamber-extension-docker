// Talking to the service, for every frame.
import { HostRequestError, type HostClient } from '@openchamber/sdk';

import type { Job, Snapshot } from './types.ts';
import { t } from './i18n.ts';

export type Failure = 'needs-approval' | 'paused' | 'service-failed' | 'unreachable';

export const FAILURE_TEXT: Record<Failure, string> = {
  'needs-approval': 'Allow the local service for Docker in Settings → Extensions.',
  paused: 'Docker is paused in Settings → Extensions.',
  'service-failed': 'The Docker service stopped. It starts again on the next refresh.',
  unreachable: 'Could not reach the Docker service.',
};

export const failureOf = (error: unknown): Failure => {
  if (!(error instanceof HostRequestError)) return 'unreachable';
  if (error.code === 'NO_SERVICE' || error.code === 'NOT_GRANTED') return 'needs-approval';
  if (error.code === 'DISABLED') return 'paused';
  if (error.code === 'SERVICE_FAILED') return 'service-failed';
  return 'unreachable';
};

/** The service answered, but with an error it worded for people. */
export class ServiceError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const call = async <T>(host: HostClient, method: 'GET' | 'POST', path: string, query?: Record<string, string>, body?: unknown): Promise<T> => {
  const result = await host.serviceRequest({
    method,
    path,
    query,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(result.body);
  } catch {
    // Not JSON: reported below.
  }
  if (result.status !== 200) {
    const message = typeof parsed === 'object' && parsed !== null && typeof (parsed as { error?: unknown }).error === 'string'
      ? (parsed as { error: string }).error
      : `The Docker service answered ${result.status}.`;
    throw new ServiceError(result.status, message);
  }
  if (parsed === null) throw new ServiceError(502, 'The Docker service answered with something unexpected.');
  return parsed as T;
};

export const getJson = <T>(host: HostClient, path: string, query?: Record<string, string>): Promise<T> => call<T>(host, 'GET', path, query);

export const postJob = async (host: HostClient, path: string, body: unknown = {}): Promise<Job> => (await call<{ job: Job }>(host, 'POST', path, undefined, body)).job;

export const postJson = <T>(host: HostClient, path: string, body: unknown): Promise<T> => call<T>(host, 'POST', path, undefined, body);

/** A message for a toast from whatever a call threw. */
export const messageOf = (error: unknown): string => {
  if (error instanceof ServiceError) return t(error.message);
  if (error instanceof HostRequestError) return t(FAILURE_TEXT[failureOf(error)]);
  return t(error instanceof Error ? error.message : 'Something went wrong.');
};

export const fetchSnapshot = (host: HostClient, directory: string | null, stats: boolean): Promise<Snapshot> => {
  const query: Record<string, string> = {};
  if (directory) query.directory = directory;
  if (stats) query.stats = '1';
  return getJson<Snapshot>(host, '/snapshot', query);
};

export const isOnScreen = (root: HTMLElement): boolean => !document.hidden && root.getBoundingClientRect().width > 0;

/** Calls back when the frame comes back on screen (another rail tab, a folded section). */
export const onShown = (root: HTMLElement, callback: () => void): void => {
  let shown = isOnScreen(root);
  const check = (): void => {
    const next = isOnScreen(root);
    if (next && !shown) callback();
    shown = next;
  };
  document.addEventListener('visibilitychange', check);
  new ResizeObserver(check).observe(document.documentElement);
};
