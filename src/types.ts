export type ResourceType = "containers" | "images" | "volumes" | "networks" | "cache";

export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5;

export interface CliOptions {
  containers: boolean;
  images: boolean;
  volumes: boolean;
  networks: boolean;
  cache: boolean;
  dangling: boolean;
  all: boolean;
  force: boolean;
  dryRun: boolean;
  olderThan?: string;
  verbose: boolean;
  quiet: boolean;
  json: boolean;
  noColor: boolean;
}

export interface ResourceItem {
  id: string;
  name: string;
  size?: string;
  createdAt?: string;
  lastUsed?: string;
  raw?: Record<string, string>;
}

export interface ResourceSummary {
  type: ResourceType;
  label: string;
  items: ResourceItem[];
  reclaimableBytes?: number;
}

export interface ScanResult {
  summaries: ResourceSummary[];
  totalReclaimableBytes: number;
}

export interface CleanResult {
  removed: Record<ResourceType, number>;
  failures: Record<ResourceType, string[]>;
  reclaimedBytes: number;
}

export interface DockerCheck {
  ok: boolean;
  code: ExitCode;
  message: string;
}
