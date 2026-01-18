import {
  dockerBuilderPruneDryRun,
  dockerImages,
  dockerNetworks,
  dockerPsAll,
  dockerSystemDf,
  dockerVolumes,
  filterUntilTimestamp,
  formatBytes,
  isSystemNetwork,
  parseDockerSize
} from "./docker";
import { ResourceItem, ResourceSummary, ScanResult } from "./types";

interface ScanOptions {
  includeContainers: boolean;
  includeImages: boolean;
  includeVolumes: boolean;
  includeNetworks: boolean;
  includeCache: boolean;
  olderThanMs?: number;
  includeAllImages?: boolean;
  top?: number;
  limitSpaceBytes?: number;
}

function parseCreatedAt(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw;
}

function applyOlderThan(items: ResourceItem[], olderThanMs?: number): ResourceItem[] {
   if (!olderThanMs) return items;
   const cutoff = Date.now() - olderThanMs;
   return items.filter((item) => {
     if (!item.createdAt) return false;
     const created = Date.parse(item.createdAt);
     return Number.isNaN(created) ? false : created >= cutoff;
   });
 }

function sortBySize(items: ResourceItem[]): ResourceItem[] {
  return [...items].sort((a, b) => {
    const sizeA = parseDockerSize(a.size);
    const sizeB = parseDockerSize(b.size);
    return sizeB - sizeA; // Descending order (largest first)
  });
}

function selectTopN(items: ResourceItem[], n: number): ResourceItem[] {
  return items.slice(0, n);
}

function selectUntilSpaceLimit(items: ResourceItem[], limitBytes: number): ResourceItem[] {
  const selected: ResourceItem[] = [];
  let totalBytes = 0;
  
  for (const item of items) {
    selected.push(item);
    totalBytes += parseDockerSize(item.size);
    if (totalBytes >= limitBytes) break;
  }
  
  return selected;
}

export function applySizeFilters(
  items: ResourceItem[],
  top?: number,
  limitSpaceBytes?: number
): ResourceItem[] {
  if (!top && !limitSpaceBytes) {
    return items;
  }
  
  // Sort items by size (largest first)
  const sorted = sortBySize(items);
  
  // Apply top N filter
  if (top !== undefined) {
    return selectTopN(sorted, top);
  }
  
  // Apply space limit filter
  if (limitSpaceBytes !== undefined) {
    return selectUntilSpaceLimit(sorted, limitSpaceBytes);
  }
  
  return sorted;
}

export async function scanResources(options: ScanOptions): Promise<ScanResult> {
  const summaries: ResourceSummary[] = [];
  let totalReclaimableBytes = 0;

  if (options.includeContainers) {
    const rawContainers = await dockerPsAll();
    const containers: ResourceItem[] = rawContainers
      .filter((container) =>
        ["exited", "dead"].includes(container.State?.toLowerCase?.() ?? "")
      )
      .map((container) => ({
        id: container.ID || container.ContainerID || "",
        name: container.Names || container.Name || "",
        size: container.Size || "",
        createdAt: parseCreatedAt(container.CreatedAt),
        lastUsed: container.RunningFor || container.Status,
        raw: container
      }));

    let filtered = applyOlderThan(containers, options.olderThanMs);
    filtered = applySizeFilters(filtered, options.top, options.limitSpaceBytes);
    const reclaimableBytes = filtered.reduce((sum, item) => sum + parseDockerSize(item.size), 0);

    summaries.push({
      type: "containers",
      label: "Stopped containers",
      items: filtered,
      reclaimableBytes
    });
    totalReclaimableBytes += reclaimableBytes;
  }

  if (options.includeImages) {
    const rawImages = await dockerImages();
    const images: ResourceItem[] = rawImages
      .filter((image) => {
        if (options.includeAllImages) return true;
        return (image.Repository ?? "") === "<none>" || (image.Tag ?? "") === "<none>";
      })
      .map((image) => ({
        id: image.ID || "",
        name: `${image.Repository ?? ""}:${image.Tag ?? ""}`,
        size: image.Size || "",
        createdAt: parseCreatedAt(image.CreatedAt),
        lastUsed: image.CreatedSince,
        raw: image
      }));

    let filtered = applyOlderThan(images, options.olderThanMs);
    filtered = applySizeFilters(filtered, options.top, options.limitSpaceBytes);
    const reclaimableBytes = filtered.reduce((sum, item) => sum + parseDockerSize(item.size), 0);

    summaries.push({
      type: "images",
      label: options.includeAllImages ? "Unused images" : "Dangling images",
      items: filtered,
      reclaimableBytes
    });
    totalReclaimableBytes += reclaimableBytes;
  }

  if (options.includeVolumes) {
    const rawVolumes = await dockerVolumes(true);
    const volumes: ResourceItem[] = rawVolumes.map((volume) => ({
      id: volume.Name || volume.Driver || "",
      name: volume.Name || "",
      size: "",
      createdAt: parseCreatedAt(volume.CreatedAt),
      lastUsed: undefined,
      raw: volume
    }));

    const filtered = applyOlderThan(volumes, options.olderThanMs);

    summaries.push({
      type: "volumes",
      label: "Unused volumes",
      items: filtered,
      reclaimableBytes: 0
    });
  }

  if (options.includeNetworks) {
    const rawNetworks = await dockerNetworks(true);
    const networks: ResourceItem[] = rawNetworks
      .filter((network) => !isSystemNetwork(network.Name ?? ""))
      .map((network) => ({
        id: network.ID || "",
        name: network.Name || "",
        size: "",
        createdAt: parseCreatedAt(network.CreatedAt),
        lastUsed: undefined,
        raw: network
      }));

    const filtered = applyOlderThan(networks, options.olderThanMs);

    summaries.push({
      type: "networks",
      label: "Unused networks",
      items: filtered,
      reclaimableBytes: 0
    });
  }

  if (options.includeCache) {
    const filterUntil = filterUntilTimestamp(options.olderThanMs);
    const dryRunOutput = await dockerBuilderPruneDryRun(filterUntil);
    const match = dryRunOutput.match(/Total reclaimable:\s*([0-9.]+\s*[A-Za-z]+)/i);
    const reclaimableBytes = match ? parseDockerSize(match[1]) : 0;

    summaries.push({
      type: "cache",
      label: "Builder cache",
      items: [],
      reclaimableBytes
    });
    totalReclaimableBytes += reclaimableBytes;
  }

   if (totalReclaimableBytes === 0) {
     const df = await dockerSystemDf();
     if (df && Array.isArray(df)) {
       const reclaimable = df.find((row) => row.Reclaimable);
       if (reclaimable) {
         totalReclaimableBytes = parseDockerSize(reclaimable.Reclaimable);
       }
     }
   }

  return { summaries, totalReclaimableBytes };
}

export function summarizeScan(result: ScanResult): string {
  const total = result.totalReclaimableBytes;
  return `Estimated reclaimable: ${formatBytes(total)}`;
}
