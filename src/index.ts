import ora from "ora";
import {
  buildCachePruneArgs,
  buildPruneArgs,
  filterUntilTimestamp,
  formatBytes,
  checkDocker
} from "./docker";
import { parseArgs } from "./args";
import { cleanResources } from "./clean";
import { scanResources } from "./scan";
import {
  confirmProceed,
  renderDetailTable,
  renderSummaryTable,
  setColorEnabled,
  statusInfo,
  statusSafe,
  statusWarn
} from "./ui";
import { ResourceType } from "./types";

function resolveResources(options: ReturnType<typeof parseArgs>["options"]): ResourceType[] {
  const selected: ResourceType[] = [];
  if (options.all) {
    return ["containers", "images", "volumes", "networks", "cache"];
  }
  if (options.dangling) {
    return ["containers", "images", "volumes"];
  }
  if (options.containers) selected.push("containers");
  if (options.images) selected.push("images");
  if (options.volumes) selected.push("volumes");
  if (options.networks) selected.push("networks");
  if (options.cache) selected.push("cache");
  if (selected.length === 0) {
    return ["containers", "images", "volumes", "networks", "cache"];
  }
  return selected;
}

function summarizeCounts(resources: ResourceType[], totalItems: number): string {
  const labels = resources.map((type) => type).join(", ");
  return `⚠️  ${totalItems} items across ${labels} will be removed`;
}

async function run(): Promise<number> {
  const { options, olderThanMs, limitSpaceBytes } = parseArgs(process.argv);
  setColorEnabled(!options.noColor);

  const dockerCheck = await checkDocker();
  if (!dockerCheck.ok) {
    console.error(statusWarn(dockerCheck.message));
    return dockerCheck.code;
  }

  const resources = resolveResources(options);
  const includeAllImages = options.all;
  const scanSpinner = options.quiet ? null : ora("Scanning Docker resources...").start();
  const scanResult = await scanResources({
    includeContainers: resources.includes("containers"),
    includeImages: resources.includes("images"),
    includeVolumes: resources.includes("volumes"),
    includeNetworks: resources.includes("networks"),
    includeCache: resources.includes("cache"),
    includeAllImages,
    olderThanMs,
    top: options.top,
    limitSpaceBytes
  });
  scanSpinner?.succeed("Scan complete");

  const totalItems = scanResult.summaries.reduce((sum, summary) => sum + summary.items.length, 0);
  const summaryText = `Estimated space: ${formatBytes(scanResult.totalReclaimableBytes)}`;

  if (options.json) {
    const payload = {
      summaries: scanResult.summaries,
      totalReclaimableBytes: scanResult.totalReclaimableBytes,
      totalItems
    };
    console.log(JSON.stringify(payload, null, 2));
    return totalItems === 0 ? 3 : 0;
  }

  if (!options.quiet) {
    console.log(renderSummaryTable(scanResult.summaries));
    scanResult.summaries.forEach((summary) => {
      if (summary.items.length > 0) {
        console.log(renderDetailTable(summary));
      }
    });
    console.log(statusInfo(summaryText));
    console.log(statusInfo(`Found ${totalItems} items`));
  }

  if (totalItems === 0 && scanResult.totalReclaimableBytes === 0) {
    console.log(statusSafe("Nothing to clean."));
    return 3;
  }

  const needsPrompt = !options.force && !options.dryRun && process.stdout.isTTY;
  if (needsPrompt) {
    const proceed = await confirmProceed(summaryText, summarizeCounts(resources, totalItems));
    if (!proceed) {
      console.log(statusSafe("No changes made."));
      return 3;
    }
  }

  if (!options.force && !process.stdout.isTTY && !options.dryRun) {
    console.log(statusWarn("Non-interactive shell detected. Use --force to proceed."));
    return 3;
  }

  if (options.dryRun) {
    console.log(statusInfo("Dry run mode: no resources will be removed."));
    resources.forEach((resource) => {
      const filterUntil = filterUntilTimestamp(olderThanMs);
      const args =
        resource === "cache"
          ? ["docker", "buildx", "prune", "--dry-run"]
          : buildPruneArgs(resource, filterUntil, includeAllImages && resource === "images");
      if (resource === "cache" && filterUntil) {
        args.push("--filter", `until=${filterUntil}`);
      }
      console.log(statusInfo(`Would run: ${args.join(" ")}`));
    });
    console.log(statusInfo(`Would free ${formatBytes(scanResult.totalReclaimableBytes)}`));
    return 0;
  }

  const cleanSpinner = options.quiet ? null : ora("Cleaning Docker resources...").start();
  const expectedCounts = scanResult.summaries.reduce((acc, summary) => {
    acc[summary.type] = summary.items.length;
    return acc;
  }, {
    containers: 0,
    images: 0,
    volumes: 0,
    networks: 0,
    cache: 0
  } as Record<ResourceType, number>);

  const cleanResult = await cleanResources({
    resources,
    olderThanMs,
    dryRun: options.dryRun,
    includeAllImages,
    expectedCounts
  });
  cleanSpinner?.succeed("Cleanup completed");

  let hasFailures = false;
  resources.forEach((resource) => {
    const failures = cleanResult.failures[resource];
    if (failures.length > 0) {
      hasFailures = true;
      console.error(statusWarn(`Failed to clean ${resource}: ${failures.join("; ")}`));
    } else {
      const removedCount = cleanResult.removed[resource];
      const label = removedCount ? `${removedCount} ${resource}` : resource;
      console.log(statusSafe(`Cleaned ${label}`));
    }
  });

  if (!options.quiet) {
    console.log(statusInfo(`Freed ${formatBytes(cleanResult.reclaimedBytes)}`));
  }

  return hasFailures ? 4 : 0;
}

run()
  .then((code) => {
    process.exit(code);
  })
  .catch((error) => {
    console.error(statusWarn(error instanceof Error ? error.message : String(error)));
    process.exit(4);
  });
