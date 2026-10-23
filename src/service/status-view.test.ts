import { describe, expect, test } from 'bun:test';

import type { Container, Job, Snapshot } from '../shared/types.ts';
import { statusView } from './status-view.ts';

const NOW = Date.parse('2026-10-23T12:00:00Z');

const container = (overrides: Partial<Container>): Container => ({
  id: 'a'.repeat(64), name: 'web-1', image: 'nginx', state: 'running', health: null, startedAt: '2026-10-23T10:00:00Z',
  finishedAt: null, exitCode: null, oomKilled: false, restartCount: 0, cpu: null, memory: 64 * 1024 ** 2, memoryLimit: null,
  ports: [{ hostIp: '0.0.0.0', hostPort: 8080, containerPort: 80, protocol: 'tcp' }],
  compose: { project: 'shop', service: 'web', workingDir: '/repo', configFiles: ['/repo/compose.yaml'] },
  ...overrides,
} as Container);

const snapshot = (overrides: Partial<Snapshot> = {}): Snapshot => ({
  at: NOW,
  engine: { name: 'Colima', running: true, starting: false, cliMissing: false, start: { canRun: true } },
  compose: 'docker compose',
  containers: [container({})],
  project: { name: 'shop', directory: '/repo', composeFiles: ['/repo/compose.yaml'] },
  jobs: [],
  incidentSeq: 0,
  statsLive: true,
  ...overrides,
} as Snapshot);

describe('statusView', () => {
  test('the project stack with its ports and Restart and Down in the header', () => {
    const view = statusView(snapshot(), 'en', NOW);
    expect(view.rows).toEqual([{
      kind: 'line', id: `container-${'a'.repeat(12)}`, label: 'web', dot: 'success', value: '64 MB',
      content: { kind: 'chips', chips: [{ id: 'port-8080', label: ':8080', url: 'http://localhost:8080' }] },
    }]);
    expect(view.controls.map((control) => control.id)).toEqual(['restart', 'down']);
  });

  test('a stopped container says why, in the error tone when it crashed', () => {
    const view = statusView(snapshot({ containers: [container({ state: 'exited', exitCode: 1, finishedAt: '2026-10-23T11:58:00Z' })] }), 'en', NOW);
    expect(view.rows[0]).toMatchObject({ dot: 'error', content: { kind: 'text', tone: 'error' } });
    expect(view.rows[0]).not.toHaveProperty('value');
    expect(view.controls.map((control) => control.id)).toEqual(['up']);
  });

  test('a job in flight holds the header, and a failed one is said in the section', () => {
    const job = (state: Job['state']): Job => ({
      id: state, kind: 'stack', target: 'shop', action: 'restart', label: 'Restarting shop', state, startedAt: NOW, endedAt: null, output: 'no such image\n',
    });
    const busy = statusView(snapshot({ jobs: [job('running')] }), 'en', NOW);
    expect(busy.rows[0]).toEqual({ kind: 'note', id: 'job', text: 'Restarting shop…' });
    expect(busy.controls.every((control) => control.disabled)).toBe(true);
    const failed = statusView(snapshot({ jobs: [job('failed')] }), 'en', NOW);
    expect(failed.rows[0]).toEqual({ kind: 'note', id: 'job-failed', text: 'Restarting shop failed: no such image', tone: 'error' });
  });

  test('the engine being down offers to start it', () => {
    const view = statusView(snapshot({ engine: { name: 'Colima', running: false, starting: false, cliMissing: false, start: { canRun: true } } as Snapshot['engine'] }), 'en', NOW);
    expect(view.rows).toEqual([{ kind: 'note', id: 'engine', text: 'Colima isn\'t running.' }]);
    expect(view.controls).toEqual([{ kind: 'button', id: 'start-engine', label: 'Start Colima' }]);
  });
});
