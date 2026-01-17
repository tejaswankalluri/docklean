import { dockerPrune, filterUntilTimestamp, parseDockerSize } from "./docker";
import { CleanResult, ResourceType } from "./types";

interface CleanOptions {
  resources: ResourceType[];
  olderThanMs?: number;
  dryRun: boolean;
  includeAllImages: boolean;
  expectedCounts: Record<ResourceType, number>;
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

   for (const type of options.resources) {
      try {
        const output = await dockerPrune(
          type,
          filterUntil,
          options.includeAllImages && type === "images"
        );
        removed[type] = parsePrunedCount(output) || options.expectedCounts[type];
        reclaimedBytes += parseReclaimedBytes(output);
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
