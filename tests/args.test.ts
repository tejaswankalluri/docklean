import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/args";

const baseArgv = ["node", "docklean"];

describe("parseArgs", () => {
  it("defaults to no flags", () => {
    const { options } = parseArgs(baseArgv);
    expect(options.containers).toBe(false);
    expect(options.images).toBe(false);
    expect(options.volumes).toBe(false);
    expect(options.networks).toBe(false);
    expect(options.cache).toBe(false);
    expect(options.force).toBe(false);
  });

  it("parses resource flags", () => {
    const { options } = parseArgs([...baseArgv, "--images", "--volumes"]);
    expect(options.images).toBe(true);
    expect(options.volumes).toBe(true);
    expect(options.containers).toBe(false);
  });

  it("parses older-than duration", () => {
    const { olderThanMs } = parseArgs([...baseArgv, "--older-than", "7d"]);
    expect(olderThanMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("rejects invalid older-than", () => {
    expect(() => parseArgs([...baseArgv, "--older-than", "7x"]))
      .toThrowError(/Invalid --older-than value/);
  });

  it("rejects quiet and verbose together", () => {
    expect(() => parseArgs([...baseArgv, "--quiet", "--verbose"]))
      .toThrowError(/either --quiet or --verbose/);
  });

  describe("dry-run flag", () => {
    it("parses --dry-run flag", () => {
      const { options } = parseArgs([...baseArgv, "--dry-run"]);
      expect(options.dryRun).toBe(true);
    });

    it("defaults dryRun to false", () => {
      const { options } = parseArgs(baseArgv);
      expect(options.dryRun).toBe(false);
    });

    it("can combine dry-run with other flags", () => {
      const { options } = parseArgs([...baseArgv, "--dry-run", "--images", "--volumes"]);
      expect(options.dryRun).toBe(true);
      expect(options.images).toBe(true);
      expect(options.volumes).toBe(true);
    });

    it("can combine dry-run with older-than", () => {
      const { options, olderThanMs } = parseArgs([
        ...baseArgv,
        "--dry-run",
        "--older-than",
        "24h"
      ]);
      expect(options.dryRun).toBe(true);
      expect(olderThanMs).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe("older-than parsing edge cases", () => {
    it("parses minutes", () => {
      const { olderThanMs } = parseArgs([...baseArgv, "--older-than", "30m"]);
      expect(olderThanMs).toBe(30 * 60 * 1000);
    });

    it("parses hours", () => {
      const { olderThanMs } = parseArgs([...baseArgv, "--older-than", "12h"]);
      expect(olderThanMs).toBe(12 * 60 * 60 * 1000);
    });

    it("parses days", () => {
      const { olderThanMs } = parseArgs([...baseArgv, "--older-than", "7d"]);
      expect(olderThanMs).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("parses weeks", () => {
      const { olderThanMs } = parseArgs([...baseArgv, "--older-than", "2w"]);
      expect(olderThanMs).toBe(2 * 7 * 24 * 60 * 60 * 1000);
    });

    it("rejects invalid time unit", () => {
      expect(() => parseArgs([...baseArgv, "--older-than", "5s"]))
        .toThrowError(/Invalid --older-than value/);
    });

    it("rejects empty older-than value", () => {
      expect(() => parseArgs([...baseArgv, "--older-than", ""]))
        .toThrowError(/Invalid --older-than value/);
    });

    it("rejects non-numeric older-than", () => {
      expect(() => parseArgs([...baseArgv, "--older-than", "abcd"]))
        .toThrowError(/Invalid --older-than value/);
    });
  });

  describe("force and yes flags", () => {
    it("parses --force flag", () => {
      const { options } = parseArgs([...baseArgv, "--force"]);
      expect(options.force).toBe(true);
    });

    it("parses --yes as alias for --force", () => {
      const { options } = parseArgs([...baseArgv, "--yes"]);
      expect(options.force).toBe(true);
    });

    it("parses -f as short for --force", () => {
      const { options } = parseArgs([...baseArgv, "-f"]);
      expect(options.force).toBe(true);
    });

    it("-y and --force both set force flag", () => {
      const { options: opts1 } = parseArgs([...baseArgv, "-y"]);
      const { options: opts2 } = parseArgs([...baseArgv, "-f"]);
      expect(opts1.force).toBe(true);
      expect(opts2.force).toBe(true);
    });
  });

  describe("resource selection flags", () => {
    it("parses --all flag", () => {
      const { options, selectedResources } = parseArgs([...baseArgv, "--all"]);
      expect(options.all).toBe(true);
      expect(selectedResources).toContain("containers");
      expect(selectedResources).toContain("images");
    });

    it("parses --dangling flag", () => {
      const { options, selectedResources } = parseArgs([...baseArgv, "--dangling"]);
      expect(options.dangling).toBe(true);
      expect(selectedResources).not.toContain("networks");
      expect(selectedResources).not.toContain("cache");
    });

    it("returns selected resources when flags provided", () => {
      const { selectedResources } = parseArgs([
        ...baseArgv,
        "--containers",
        "--images"
      ]);
      expect(selectedResources).toEqual(["containers", "images"]);
    });

    it("returns empty selectedResources when no resource flags provided", () => {
      const { selectedResources } = parseArgs([...baseArgv]);
      expect(selectedResources).toEqual([]);
    });

    it("handles multiple resource selections", () => {
      const { selectedResources } = parseArgs([
        ...baseArgv,
        "--containers",
        "--images",
        "--volumes",
        "--networks",
        "--cache"
      ]);
      expect(selectedResources).toHaveLength(5);
      expect(selectedResources).toContain("containers");
      expect(selectedResources).toContain("images");
      expect(selectedResources).toContain("volumes");
      expect(selectedResources).toContain("networks");
      expect(selectedResources).toContain("cache");
    });
  });

  describe("output formatting flags", () => {
    it("parses --json flag", () => {
      const { options } = parseArgs([...baseArgv, "--json"]);
      expect(options.json).toBe(true);
    });

    it("parses --verbose flag", () => {
      const { options } = parseArgs([...baseArgv, "--verbose"]);
      expect(options.verbose).toBe(true);
    });

    it("parses --quiet flag", () => {
      const { options } = parseArgs([...baseArgv, "--quiet"]);
      expect(options.quiet).toBe(true);
    });

    it("parses --no-color flag", () => {
      const { options } = parseArgs([...baseArgv, "--no-color"]);
      expect(options.noColor).toBe(true);
    });

    it("rejects verbose and quiet together", () => {
      expect(() =>
        parseArgs([...baseArgv, "--verbose", "--quiet"])
      ).toThrowError(/either --quiet or --verbose/);
    });
  });

  describe("combined complex scenarios", () => {
    it("parses multiple flags together", () => {
      const { options, olderThanMs, selectedResources } = parseArgs([
        ...baseArgv,
        "--dry-run",
        "--force",
        "--older-than",
        "7d",
        "--images",
        "--volumes",
        "--json"
      ]);
      expect(options.dryRun).toBe(true);
      expect(options.force).toBe(true);
      expect(options.json).toBe(true);
      expect(olderThanMs).toBe(7 * 24 * 60 * 60 * 1000);
      expect(selectedResources).toEqual(["images", "volumes"]);
    });

    it("parses dangling with older-than", () => {
      const { options, olderThanMs } = parseArgs([
        ...baseArgv,
        "--dangling",
        "--older-than",
        "30d"
      ]);
      expect(options.dangling).toBe(true);
      expect(olderThanMs).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it("dry-run does not affect resource selection", () => {
      const result1 = parseArgs([...baseArgv, "--dry-run", "--all"]);
      const result2 = parseArgs([...baseArgv, "--all"]);
      expect(result1.selectedResources).toEqual(result2.selectedResources);
    });
  });
});
