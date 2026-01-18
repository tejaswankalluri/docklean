import { 
  dockerPrune, 
  dockerRemoveContainers,
  dockerRemoveImages,
  dockerRemoveVolumes,
  dockerRemoveNetworks,
  filterUntilTimestamp, 
  parseDockerSize 
} from "./docker";
import { CleanResult, ResourceType, SelectedResources } from "./types";

interface CleanOptions {
  resources: ResourceType[];
  olderThanMs?: number;
  dryRun: boolean;
  includeAllImages: boolean;
  expectedCounts: Record<ResourceType, number>;
  selectedIds?: SelectedResources;
  estimatedBytes?: Record<ResourceType, number>;
}

export async function cleanResources(options: CleanOptions): Promise<CleanResult> {
  const removed: Record<ResourceType, number> = {
    containers: 0,
    images: 0,
    volumes: 0,
    networks: 0,
    cache: 0
  };
  const failures: Record<ResourceType, string[]> = {
    containers: [],
    images: [],
    volumes: [],
    networks: [],
    cache: []
  };

  if (options.dryRun) {
    return { removed, failures, reclaimedBytes: 0 };
  }

  const filterUntil = filterUntilTimestamp(options.olderThanMs);
  let reclaimedBytes = 0;

  // When size filters are active, we have selectedIds and must delete by ID
  const useBulkPrune = !options.selectedIds;

   for (const type of options.resources) {
      try {
        let output = "";
        
        if (useBulkPrune) {
          // Use bulk prune for age-only filtering
          output = await dockerPrune(
            type,
            filterUntil,
            options.includeAllImages && type === "images"
          );
          removed[type] = parsePrunedCount(output) || options.expectedCounts[type];
          reclaimedBytes += parseReclaimedBytes(output);
        } else {
          // Use ID-based deletion for size filtering
          // Cache doesn't have individual items, so handle it separately
          if (type === "cache") {
            output = await dockerPrune(type, filterUntil, false);
            removed[type] = parsePrunedCount(output) || options.expectedCounts[type];
            reclaimedBytes += parseReclaimedBytes(output);
          } else {
            const ids = options.selectedIds![type];
            if (ids && ids.length > 0) {
              switch (type) {
                case "containers":
                  output = await dockerRemoveContainers(ids);
                  removed[type] = ids.length;
                  break;
                case "images":
                  output = await dockerRemoveImages(ids);
                  removed[type] = ids.length;
                  break;
                case "volumes":
                  output = await dockerRemoveVolumes(ids);
                  removed[type] = ids.length;
                  break;
                case "networks":
                  output = await dockerRemoveNetworks(ids);
                  removed[type] = ids.length;
                  break;
              }
              // For ID-based deletion, use the estimated bytes from scan phase
              // since docker rm doesn't report space
              if (options.estimatedBytes) {
                reclaimedBytes += options.estimatedBytes[type] || 0;
              }
            }
          }
        }
      } catch (error) {
        failures[type].push(error instanceof Error ? error.message : String(error));
      }
    }

  return { removed, failures, reclaimedBytes };
}

function parsePrunedCount(output: string): number {
  const countMatches = output.match(/Deleted (?:Containers|Images|Volumes|Networks):\s*([0-9]+)/gi);
  if (!countMatches) return 0;
  return countMatches.reduce((sum, line) => {
    const match = line.match(/([0-9]+)$/);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
}

function parseReclaimedBytes(output: string): number {
  const match = output.match(/Total reclaimed space:\s*([0-9.]+\s*[A-Za-z]+)/i);
  if (!match) return 0;
  return parseDockerSize(match[1]);
}
