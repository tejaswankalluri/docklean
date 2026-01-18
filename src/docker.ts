import { execFile } from "child_process";
import { promisify } from "util";
import { DockerCheck, ExitCode, ResourceType } from "./types";

const execFileAsync = promisify(execFile);

interface ExecResult {
  stdout: string;
  stderr: string;
}

const DOCKER = "docker";

export async function execDocker(args: string[]): Promise<ExecResult> {
  return execFileAsync(DOCKER, args, { maxBuffer: 10 * 1024 * 1024 });
}

export async function checkDocker(): Promise<DockerCheck> {
  try {
    await execDocker(["--version"]);
  } catch {
    return { ok: false, code: 1, message: "Docker CLI not found." };
  }

  try {
    await execDocker(["info"]);
  } catch {
    return { ok: false, code: 2, message: "Docker daemon is not running." };
  }

  return { ok: true, code: 0, message: "Docker is available." };
}

export function parseDockerJsonLines<T extends Record<string, string>>(output: string): T[] {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export async function dockerSystemDf(): Promise<Record<string, string>[]> {
  const { stdout } = await execDocker(["system", "df", "--format", "{{json .}}"]);
  return parseDockerJsonLines(stdout);
}

export async function dockerPsAll(): Promise<Record<string, string>[]> {
  const { stdout } = await execDocker(["ps", "-a", "--format", "{{json .}}"]);
  return parseDockerJsonLines(stdout);
}

export async function dockerImages(): Promise<Record<string, string>[]> {
  const { stdout } = await execDocker(["images", "--digests", "--format", "{{json .}}"]);
  return parseDockerJsonLines(stdout);
}

export async function dockerVolumes(danglingOnly: boolean): Promise<Record<string, string>[]> {
  const args = ["volume", "ls", "--format", "{{json .}}"];
  if (danglingOnly) {
    args.push("--filter", "dangling=true");
  }
  const { stdout } = await execDocker(args);
  return parseDockerJsonLines(stdout);
}

export async function dockerNetworks(danglingOnly: boolean): Promise<Record<string, string>[]> {
  const args = ["network", "ls", "--format", "{{json .}}"];
  if (danglingOnly) {
    args.push("--filter", "dangling=true");
  }
  const { stdout } = await execDocker(args);
  return parseDockerJsonLines(stdout);
}

export function buildPruneArgs(
  type: ResourceType,
  filterUntil?: string,
  includeAllImages?: boolean
): string[] {
  const args: string[] = ["docker"];
  switch (type) {
    case "containers":
      args.push("container", "prune", "-f");
      break;
    case "images":
      args.push("image", "prune", "-f");
      if (includeAllImages) {
        args.push("-a");
      }
      break;
    case "volumes":
      args.push("volume", "prune", "-f", "-a");
      break;
    case "networks":
      args.push("network", "prune", "-f");
      break;
    case "cache":
      args.push("builder", "prune", "-f");
      break;
  }
  if (filterUntil) {
    args.push("--filter", `until=${filterUntil}`);
  }
  return args;
}

export function buildCachePruneArgs(filterUntil?: string): string[] {
  const args: string[] = ["docker", "builder", "prune", "-f"];
  if (filterUntil) {
    args.push("--filter", `until=${filterUntil}`);
  }
  return args;
}

export async function dockerBuilderPruneDryRun(filterUntil?: string): Promise<string> {
  const args = ["buildx", "prune", "--dry-run"];
  if (filterUntil) {
    args.push("--filter", `until=${filterUntil}`);
  }
  try {
    const { stdout } = await execDocker(args);
    return stdout;
  } catch {
    const fallbackArgs = ["builder", "prune", "-f"];
    if (filterUntil) {
      fallbackArgs.push("--filter", `until=${filterUntil}`);
    }
    const { stdout } = await execDocker(fallbackArgs);
    return stdout;
  }
}

export async function dockerPrune(
  type: ResourceType,
  filterUntil?: string,
  includeAllImages?: boolean
): Promise<string> {
  const baseArgs: string[] = [];
  switch (type) {
    case "containers":
      baseArgs.push("container", "prune", "-f");
      break;
    case "images":
      baseArgs.push("image", "prune", "-f");
      if (includeAllImages) {
        baseArgs.push("-a");
      }
      break;
    case "volumes":
      baseArgs.push("volume", "prune", "-f", "-a");
      break;
    case "networks":
      baseArgs.push("network", "prune", "-f");
      break;
    case "cache":
      baseArgs.push("builder", "prune", "-f");
      break;
  }
  if (filterUntil) {
    baseArgs.push("--filter", `until=${filterUntil}`);
  }
  const { stdout } = await execDocker(baseArgs);
  return stdout;
}

export function parseDockerSize(size?: string): number {
  if (!size) return 0;
  const trimmed = size.trim();
  const match = trimmed.match(/([0-9.]+)\s*(B|kB|KB|MB|GB|TB)/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1000,
    mb: 1000 ** 2,
    gb: 1000 ** 3,
    tb: 1000 ** 4
  };
  return Math.round(value * (multipliers[unit] ?? 1));
}

export function formatBytes(bytes: number): string {
   if (bytes <= 0) return "0 B";
   const units = ["B", "KB", "MB", "GB", "TB"];
   let value = bytes;
   let unitIndex = 0;
   while (value >= 1000 && unitIndex < units.length - 1) {
     value /= 1000;
     unitIndex += 1;
   }
   // For KB and above, show one decimal place for values < 10
   if (unitIndex > 0 && value < 10) {
     return `${value.toFixed(1)} ${units[unitIndex]}`;
   }
   // For values >= 10, round to nearest whole number
   if (unitIndex > 0) {
     return `${Math.round(value)} ${units[unitIndex]}`;
   }
   return `${Math.round(value)} ${units[unitIndex]}`;
 }

export function filterUntilTimestamp(olderThanMs?: number): string | undefined {
  if (!olderThanMs) return undefined;
  const cutoff = Date.now() - olderThanMs;
  return new Date(cutoff).toISOString();
}

export function isSystemNetwork(name: string): boolean {
  return ["bridge", "host", "none"].includes(name);
}

export function toExitCode(code?: number): ExitCode {
  if (!code || code === 0) return 0;
  return 4;
}

export async function dockerRemoveContainers(containerIds: string[]): Promise<string> {
  if (containerIds.length === 0) return "";
  const { stdout } = await execDocker(["container", "rm", "-f", ...containerIds]);
  return stdout;
}

export async function dockerRemoveImages(imageIds: string[]): Promise<string> {
  if (imageIds.length === 0) return "";
  const { stdout } = await execDocker(["image", "rm", "-f", ...imageIds]);
  return stdout;
}

export async function dockerRemoveVolumes(volumeNames: string[]): Promise<string> {
  if (volumeNames.length === 0) return "";
  const { stdout } = await execDocker(["volume", "rm", "-f", ...volumeNames]);
  return stdout;
}

export async function dockerRemoveNetworks(networkIds: string[]): Promise<string> {
  if (networkIds.length === 0) return "";
  const { stdout } = await execDocker(["network", "rm", ...networkIds]);
  return stdout;
}
