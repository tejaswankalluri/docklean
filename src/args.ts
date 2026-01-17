import { Command } from "commander";
import ms from "ms";
import { CliOptions } from "./types";

export interface ParsedArgs {
  options: CliOptions;
  olderThanMs?: number;
  selectedResources: Array<keyof Pick<CliOptions, "containers" | "images" | "volumes" | "networks" | "cache">>;
}

const resourceFlags = ["containers", "images", "volumes", "networks", "cache"] as const;
const mutableResourceFlags = [...resourceFlags];

export function parseArgs(argv: string[]): ParsedArgs {
  const program = new Command();

  program
    .name("docklean")
    .description("Safely find and clean unused Docker resources")
    .option("--containers", "Clean stopped/exited containers")
    .option("--images", "Clean dangling/unused images")
    .option("--volumes", "Clean unused volumes")
    .option("--networks", "Clean unused networks")
    .option("--cache", "Clean builder cache")
    .option("--dangling", "Clean dangling images, stopped containers, unused volumes")
    .option("--all", "Clean all unused resources")
    .option("--older-than <duration>", "Only clean resources older than m/h/d/w")
    .option("-f, --force", "Skip confirmation prompt")
    .option("-y, --yes", "Alias for --force")
    .option("--dry-run", "Print what would be removed")
    .option("--json", "Output machine-readable JSON")
    .option("--verbose", "Verbose output")
    .option("--quiet", "Minimal output")
    .option("--no-color", "Disable colored output")
    .version("0.1.0");

  program.parse(argv);
  const raw = program.opts();

  if (raw.quiet && raw.verbose) {
    throw new Error("Use either --quiet or --verbose, not both.");
  }

  const options: CliOptions = {
    containers: Boolean(raw.containers),
    images: Boolean(raw.images),
    volumes: Boolean(raw.volumes),
    networks: Boolean(raw.networks),
    cache: Boolean(raw.cache),
    dangling: Boolean(raw.dangling),
    all: Boolean(raw.all),
    force: Boolean(raw.force || raw.yes),
    dryRun: Boolean(raw.dryRun),
    olderThan: raw.olderThan,
    verbose: Boolean(raw.verbose),
    quiet: Boolean(raw.quiet),
    json: Boolean(raw.json),
    noColor: Boolean(raw.color === false)
  };

  if (options.olderThan !== undefined && options.olderThan === "") {
    throw new Error("Invalid --older-than value. Use m/h/d/w like 7d or 12h.");
  }

   const olderThanMs = options.olderThan ? ms(options.olderThan) : undefined;
   if (options.olderThan && typeof olderThanMs !== "number") {
     throw new Error("Invalid --older-than value. Use m/h/d/w like 7d or 12h.");
   }
   // Check for invalid time units like 's' (seconds)
   if (options.olderThan && /\d\s*s\s*$/i.test(options.olderThan)) {
     throw new Error("Invalid --older-than value. Use m/h/d/w like 7d or 12h.");
   }

  let selectedFlags = mutableResourceFlags.filter((flag) => options[flag]);
  if (options.all) {
    selectedFlags = mutableResourceFlags;
  }

  return {
    options,
    olderThanMs,
    selectedResources: selectedFlags
  };
}
