import { describe, expect, it, vi, afterEach } from "vitest";
import {
  parseDockerSize,
  formatBytes,
  parseDockerJsonLines,
  filterUntilTimestamp,
  buildPruneArgs,
  buildCachePruneArgs,
  isSystemNetwork,
  toExitCode
} from "../src/docker";

const sampleTimestamp = "2025-01-01T00:00:00.000Z";

describe("docker helpers", () => {
  it("builds prune args for images with -a", () => {
    expect(buildPruneArgs("images", sampleTimestamp, true)).toEqual([
      "docker",
      "image",
      "prune",
      "-f",
      "-a",
      "--filter",
      `until=${sampleTimestamp}`
    ]);
  });

  it("builds cache prune args", () => {
    expect(buildCachePruneArgs(sampleTimestamp)).toEqual([
      "docker",
      "builder",
      "prune",
      "-f",
      "--filter",
      `until=${sampleTimestamp}`
    ]);
  });

  it("parses sizes", () => {
    expect(parseDockerSize("10 MB")).toBe(10 * 1000 * 1000);
    expect(parseDockerSize("1.5 GB")).toBe(1.5 * 1000 * 1000 * 1000);
  });

  it("creates ISO filter timestamp", () => {
    const ts = filterUntilTimestamp(60 * 60 * 1000);
    expect(ts).toMatch(/T/);
  });
});

describe("parseDockerSize", () => {
  it("parses bytes correctly", () => {
    expect(parseDockerSize("1024 B")).toBe(1024);
  });

  it("parses kilobytes correctly", () => {
    expect(parseDockerSize("5 kB")).toBe(5000);
  });

  it("parses megabytes correctly", () => {
    expect(parseDockerSize("100 MB")).toBe(100 * 1000 * 1000);
  });

  it("parses gigabytes correctly", () => {
    expect(parseDockerSize("2 GB")).toBe(2 * 1000 * 1000 * 1000);
  });

  it("parses terabytes correctly", () => {
    expect(parseDockerSize("1 TB")).toBe(1000 * 1000 * 1000 * 1000);
  });

  it("handles case-insensitive units", () => {
    const result1 = parseDockerSize("100 mb");
    const result2 = parseDockerSize("100 MB");
    expect(result1).toBe(result2);
  });

  it("handles decimal values", () => {
    expect(parseDockerSize("1.5 GB")).toBe(
      Math.round(1.5 * 1000 * 1000 * 1000)
    );
  });

  it("handles whitespace variations", () => {
    expect(parseDockerSize("  100   MB  ")).toBe(100 * 1000 * 1000);
  });

  it("returns 0 for invalid format", () => {
    expect(parseDockerSize("invalid")).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseDockerSize("")).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(parseDockerSize(undefined)).toBe(0);
  });

  it("handles edge case: 0 bytes", () => {
    expect(parseDockerSize("0 B")).toBe(0);
  });

  it("rounds to nearest whole number", () => {
    expect(parseDockerSize("1.23456 MB")).toBe(
      Math.round(1.23456 * 1000 * 1000)
    );
  });

  it("handles KB alias for kB", () => {
    const result1 = parseDockerSize("100 KB");
    const result2 = parseDockerSize("100 kB");
    expect(result1).toBe(result2);
  });
});

describe("formatBytes", () => {
  it("formats bytes correctly", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

   it("formats kilobytes correctly", () => {
     expect(formatBytes(5000)).toBe("5.0 KB");
   });

  it("formats megabytes correctly", () => {
    expect(formatBytes(100 * 1000 * 1000)).toBe("100 MB");
  });

   it("formats gigabytes correctly", () => {
     expect(formatBytes(2 * 1000 * 1000 * 1000)).toBe("2.0 GB");
   });

   it("formats terabytes correctly", () => {
     expect(formatBytes(1000 * 1000 * 1000 * 1000)).toBe("1.0 TB");
   });

  it("returns '0 B' for zero", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("returns '0 B' for negative numbers", () => {
    expect(formatBytes(-100)).toBe("0 B");
  });

  it("handles decimal formatting for KB", () => {
    expect(formatBytes(1500)).toBe("1.5 KB");
  });

   it("handles whole number formatting for MB and above", () => {
     expect(formatBytes(1500000)).toBe("1.5 MB");
   });

  it("caps units at TB", () => {
    const hugeNumber = 1000 * 1000 * 1000 * 1000 * 1000;
    const result = formatBytes(hugeNumber);
    expect(result).toContain("TB");
  });

  it("handles small values", () => {
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(999)).toBe("999 B");
  });

   it("handles boundary values", () => {
     expect(formatBytes(999)).toBe("999 B");
     expect(formatBytes(1000)).toBe("1.0 KB");
   });
});

describe("parseDockerJsonLines", () => {
  it("parses single JSON line", () => {
    const input = '{"ID": "abc123", "Name": "container1"}';
    const result = parseDockerJsonLines(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ ID: "abc123", Name: "container1" });
  });

  it("parses multiple JSON lines", () => {
    const input = `{"ID": "abc123", "Name": "container1"}
{"ID": "def456", "Name": "container2"}`;
    const result = parseDockerJsonLines(input);
    expect(result).toHaveLength(2);
    expect(result[0].ID).toBe("abc123");
    expect(result[1].ID).toBe("def456");
  });

  it("handles empty input", () => {
    const result = parseDockerJsonLines("");
    expect(result).toHaveLength(0);
  });

  it("ignores blank lines", () => {
    const input = `{"ID": "abc123"}

{"ID": "def456"}`;
    const result = parseDockerJsonLines(input);
    expect(result).toHaveLength(2);
  });

  it("ignores lines with only whitespace", () => {
    const input = `{"ID": "abc123"}
   
{"ID": "def456"}`;
    const result = parseDockerJsonLines(input);
    expect(result).toHaveLength(2);
  });

  it("preserves all fields from JSON", () => {
    const input =
      '{"ID": "abc", "Name": "test", "Size": "100 MB", "Status": "exited"}';
    const result = parseDockerJsonLines(input);
    expect(result[0]).toHaveProperty("ID");
    expect(result[0]).toHaveProperty("Name");
    expect(result[0]).toHaveProperty("Size");
    expect(result[0]).toHaveProperty("Status");
  });
});

describe("filterUntilTimestamp", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined when olderThanMs is not provided", () => {
    const result = filterUntilTimestamp();
    expect(result).toBeUndefined();
  });

  it("returns undefined when olderThanMs is 0", () => {
    const result = filterUntilTimestamp(0);
    expect(result).toBeUndefined();
  });

  it("returns ISO string for valid olderThanMs", () => {
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
    const result = filterUntilTimestamp(24 * 60 * 60 * 1000); // 1 day
    expect(result).toBe("2024-01-14T12:00:00.000Z");
  });

  it("calculates correct cutoff for 7 days", () => {
    vi.setSystemTime(new Date("2024-01-15T00:00:00Z"));
    const result = filterUntilTimestamp(7 * 24 * 60 * 60 * 1000);
    expect(result).toBe("2024-01-08T00:00:00.000Z");
  });

  it("returns ISO format string", () => {
    const result = filterUntilTimestamp(1000);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("buildPruneArgs", () => {
  it("builds prune args for containers", () => {
    const args = buildPruneArgs("containers");
    expect(args).toEqual(["docker", "container", "prune", "-f"]);
  });

  it("builds prune args for images", () => {
    const args = buildPruneArgs("images");
    expect(args).toEqual(["docker", "image", "prune", "-f"]);
  });

  it("builds prune args for volumes", () => {
    const args = buildPruneArgs("volumes");
    expect(args).toEqual(["docker", "volume", "prune", "-f", "-a"]);
  });

  it("builds prune args for networks", () => {
    const args = buildPruneArgs("networks");
    expect(args).toEqual(["docker", "network", "prune", "-f"]);
  });

  it("builds prune args for cache", () => {
    const args = buildPruneArgs("cache");
    expect(args).toEqual(["docker", "builder", "prune", "-f"]);
  });

  it("adds filter for until timestamp", () => {
    const args = buildPruneArgs("containers", "2024-01-08T00:00:00.000Z");
    expect(args).toContain("--filter");
    expect(args).toContain("until=2024-01-08T00:00:00.000Z");
  });

  it("adds -a flag for images when includeAllImages is true", () => {
    const args = buildPruneArgs("images", undefined, true);
    expect(args).toContain("-a");
  });

  it("does not add -a flag for images when includeAllImages is false", () => {
    const args = buildPruneArgs("images", undefined, false);
    expect(args).not.toContain("-a");
  });

  it("adds both filter and -a for images with filter and includeAllImages", () => {
    const args = buildPruneArgs("images", "2024-01-08T00:00:00.000Z", true);
    expect(args).toContain("-a");
    expect(args).toContain("--filter");
    expect(args).toContain("until=2024-01-08T00:00:00.000Z");
  });

  it("does not add filter when undefined", () => {
    const args = buildPruneArgs("volumes", undefined);
    expect(args).not.toContain("--filter");
  });
});

describe("buildCachePruneArgs", () => {
  it("builds cache prune args without filter", () => {
    const args = buildCachePruneArgs();
    expect(args).toEqual(["docker", "builder", "prune", "-f"]);
  });

  it("adds filter when provided", () => {
    const args = buildCachePruneArgs("2024-01-08T00:00:00.000Z");
    expect(args).toContain("--filter");
    expect(args).toContain("until=2024-01-08T00:00:00.000Z");
  });

  it("does not add filter when undefined", () => {
    const args = buildCachePruneArgs(undefined);
    expect(args).not.toContain("--filter");
  });
});

describe("isSystemNetwork", () => {
  it("identifies bridge as system network", () => {
    expect(isSystemNetwork("bridge")).toBe(true);
  });

  it("identifies host as system network", () => {
    expect(isSystemNetwork("host")).toBe(true);
  });

  it("identifies none as system network", () => {
    expect(isSystemNetwork("none")).toBe(true);
  });

  it("identifies custom networks as non-system", () => {
    expect(isSystemNetwork("my-network")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isSystemNetwork("Bridge")).toBe(false);
    expect(isSystemNetwork("HOST")).toBe(false);
  });

  it("handles empty string", () => {
    expect(isSystemNetwork("")).toBe(false);
  });
});

describe("toExitCode", () => {
  it("returns 0 for undefined code", () => {
    expect(toExitCode(undefined)).toBe(0);
  });

  it("returns 0 for code 0", () => {
    expect(toExitCode(0)).toBe(0);
  });

  it("returns 4 for non-zero code", () => {
    expect(toExitCode(1)).toBe(4);
    expect(toExitCode(2)).toBe(4);
    expect(toExitCode(127)).toBe(4);
  });

  it("returns 4 for negative codes", () => {
    expect(toExitCode(-1)).toBe(4);
  });
});
