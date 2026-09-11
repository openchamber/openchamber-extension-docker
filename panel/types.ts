export type PublishedPort = {
  hostIp: string;
  hostPort: string;
  containerPort: string;
  protocol: string;
  url: string | null;
};

export type ComposeInfo = {
  project: string;
  service: string;
};

export type ContainerStats = {
  cpu: string;
  mem: string;
  memPerc: string;
};

export type ContainerRow = {
  id: string;
  names: string;
  image: string;
  status: string;
  state: string;
  health: string | null;
  ports: PublishedPort[];
  compose: ComposeInfo | null;
  stats: ContainerStats | null;
};

export type ImageRow = {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
  used: boolean;
};

export type VolumeRow = {
  name: string;
  driver: string;
  scope: string;
  mountpoint: string;
  used: boolean;
};

export type NetworkRow = {
  id: string;
  name: string;
  driver: string;
  scope: string;
  used: boolean;
};

export type InspectView = {
  id: string;
  name: string;
  image: string;
  created: string;
  state: string;
  status: string;
  health: string | null;
  command: string;
  entrypoint: string;
  env: string[];
  mounts: Array<{
    type: string;
    name: string;
    source: string;
    destination: string;
    mode: string;
    rw: boolean;
  }>;
  networks: string[];
  ports: PublishedPort[];
  compose: ComposeInfo | null;
  restartPolicy: string;
};

export type FsEntry = {
  name: string;
  type: 'dir' | 'file' | 'other';
  path: string;
  hidden?: boolean;
};

export type FsListing = {
  path: string;
  kind: 'dir' | 'file' | 'other';
  parent: string;
  truncated?: boolean;
  entries: FsEntry[];
};

export type FsFile = {
  path: string;
  binary: boolean;
  truncated: boolean;
  size: number;
  content: string | null;
};

export type LogsView = {
  id: string;
  name: string;
  tail: number;
  truncated: boolean;
  text: string;
};

export type ExecResult = {
  output: string;
  exitCode: number;
};

export type SystemDfItem = {
  Type: string;
  TotalCount: string;
  Active: string;
  Size: string;
  Reclaimable: string;
};

export type MainTabId = 'containers' | 'compose' | 'images' | 'volumes' | 'networks' | 'system';
export type FilterId = 'all' | 'running' | 'stopped';
export type SortId = 'name' | 'status';
export type ViewMode = 'catalog' | 'fs' | 'logs' | 'inspect' | 'exec';
