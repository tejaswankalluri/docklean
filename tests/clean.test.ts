import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as docker from "../src/docker";
import { cleanResources } from "../src/clean";
import { createPruneResponse } from "./helpers";

vi.mock("../src/docker", async () => {
  const actual = await vi.importActual<typeof docker>("../src/docker");
  return {
    ...actual,
    dockerPrune: vi.fn(async () => "Total reclaimed space: 1.2 GB")
  };
});

describe("cleanResources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns reclaimed bytes and removed counts", async () => {
    const result = await cleanResources({
      resources: ["images"],
      dryRun: false,
      includeAllImages: true,
      expectedCounts: { containers: 0, images: 2, volumes: 0, networks: 0, cache: 0 }
    });

    expect(result.reclaimedBytes).toBe(1.2 * 1000 * 1000 * 1000);
    expect(result.removed.images).toBe(2);
  });

  describe("dry-run mode", () => {
    it("returns zero removed and reclaimed when dryRun is true", async () => {
      const mockPrune = docker.dockerPrune as any;

      const result = await cleanResources({
        resources: ["containers", "images"],
        dryRun: true,
        includeAllImages: false,
        expectedCounts: {
          containers: 5,
          images: 10,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      expect(result.removed.containers).toBe(0);
      expect(result.removed.images).toBe(0);
      expect(result.reclaimedBytes).toBe(0);
      expect(mockPrune).not.toHaveBeenCalled();
    });

    it("dry-run does not execute docker prune commands", async () => {
      const mockPrune = docker.dockerPrune as any;

      await cleanResources({
        resources: ["volumes", "networks", "cache"],
        dryRun: true,
        includeAllImages: false,
        expectedCounts: {
          containers: 0,
          images: 0,
          volumes: 2,
          networks: 1,
          cache: 0
        }
      });

      expect(mockPrune).not.toHaveBeenCalled();
    });
  });

  describe("container cleanup", () => {
    it("cleans stopped containers", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockResolvedValue(
        createPruneResponse("containers", 3, "150 MB")
      );

      const result = await cleanResources({
        resources: ["containers"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 3,
          images: 0,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

       expect(result.removed.containers).toBe(3);
       expect(result.reclaimedBytes).toBe(150 * 1000 * 1000);
       expect(mockPrune).toHaveBeenCalledWith("containers", undefined, false);
    });

    it("handles container cleanup failures", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockRejectedValue(new Error("Permission denied"));

      const result = await cleanResources({
        resources: ["containers"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 2,
          images: 0,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      expect(result.removed.containers).toBe(0);
      expect(result.failures.containers).toContain("Permission denied");
    });

    it("uses expected count when parsing fails", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockResolvedValue("Invalid output format");

      const result = await cleanResources({
        resources: ["containers"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 5,
          images: 0,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      expect(result.removed.containers).toBe(5);
    });
  });

  describe("image cleanup", () => {
    it("cleans dangling images without -a flag", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockResolvedValue(createPruneResponse("images", 5, "250 MB"));

      const result = await cleanResources({
        resources: ["images"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 0,
          images: 5,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

       expect(result.removed.images).toBe(5);
       expect(mockPrune).toHaveBeenCalledWith("images", undefined, false);
    });

    it("cleans all images with -a flag when includeAllImages is true", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockResolvedValue(createPruneResponse("images", 10, "500 MB"));

      const result = await cleanResources({
        resources: ["images"],
        dryRun: false,
        includeAllImages: true,
        expectedCounts: {
          containers: 0,
          images: 10,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

       expect(result.removed.images).toBe(10);
       expect(mockPrune).toHaveBeenCalledWith("images", undefined, true);
    });

    it("handles image cleanup failures", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockRejectedValue(new Error("Docker error"));

      const result = await cleanResources({
        resources: ["images"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 0,
          images: 3,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      expect(result.failures.images).toContain("Docker error");
    });
  });

  describe("volume cleanup", () => {
    it("cleans unused volumes", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockResolvedValue(createPruneResponse("volumes", 2, "50 MB"));

      const result = await cleanResources({
        resources: ["volumes"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 0,
          images: 0,
          volumes: 2,
          networks: 0,
          cache: 0
        }
      });

       expect(result.removed.volumes).toBe(2);
       expect(mockPrune).toHaveBeenCalledWith("volumes", undefined, false);
    });

    it("handles volume cleanup failures", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockRejectedValue(new Error("Volume in use"));

      const result = await cleanResources({
        resources: ["volumes"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 0,
          images: 0,
          volumes: 1,
          networks: 0,
          cache: 0
        }
      });

      expect(result.failures.volumes.length).toBeGreaterThan(0);
    });
  });

  describe("network cleanup", () => {
    it("cleans unused networks", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockResolvedValue(createPruneResponse("networks", 1, "0 B"));

      const result = await cleanResources({
        resources: ["networks"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 0,
          images: 0,
          volumes: 0,
          networks: 1,
          cache: 0
        }
      });

      expect(result.removed.networks).toBe(1);
    });

    it("handles network cleanup failures", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockRejectedValue(new Error("Network error"));

      const result = await cleanResources({
        resources: ["networks"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 0,
          images: 0,
          volumes: 0,
          networks: 1,
          cache: 0
        }
      });

      expect(result.failures.networks.length).toBeGreaterThan(0);
    });
  });

  describe("cache cleanup", () => {
    it("cleans builder cache", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockResolvedValue("Total reclaimed space: 1.5 GB\n");

      const result = await cleanResources({
        resources: ["cache"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 0,
          images: 0,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      expect(result.reclaimedBytes).toBe(Math.round(1.5 * 1000 * 1000 * 1000));
    });

    it("handles cache cleanup failures", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockRejectedValue(new Error("buildx not available"));

      const result = await cleanResources({
        resources: ["cache"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 0,
          images: 0,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      expect(result.failures.cache.length).toBeGreaterThan(0);
    });
  });

  describe("multiple resource cleanup", () => {
    it("cleans multiple resource types together", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune
        .mockResolvedValueOnce(createPruneResponse("containers", 2, "100 MB"))
        .mockResolvedValueOnce(createPruneResponse("images", 3, "200 MB"))
        .mockResolvedValueOnce(createPruneResponse("volumes", 1, "50 MB"));

      const result = await cleanResources({
        resources: ["containers", "images", "volumes"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 2,
          images: 3,
          volumes: 1,
          networks: 0,
          cache: 0
        }
      });

      expect(result.removed.containers).toBe(2);
      expect(result.removed.images).toBe(3);
      expect(result.removed.volumes).toBe(1);
      expect(result.reclaimedBytes).toBe(350 * 1000 * 1000);
      expect(mockPrune).toHaveBeenCalledTimes(3);
    });

    it("continues cleaning after partial failures", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune
        .mockResolvedValueOnce(createPruneResponse("containers", 2, "100 MB"))
        .mockRejectedValueOnce(new Error("Images error"))
        .mockResolvedValueOnce(createPruneResponse("volumes", 1, "50 MB"));

      const result = await cleanResources({
        resources: ["containers", "images", "volumes"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 2,
          images: 3,
          volumes: 1,
          networks: 0,
          cache: 0
        }
      });

      expect(result.removed.containers).toBe(2);
      expect(result.failures.images.length).toBeGreaterThan(0);
      expect(result.removed.volumes).toBe(1);
    });
  });

  describe("older-than filter", () => {
    it("passes filterUntil to dockerPrune", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockResolvedValue(createPruneResponse("containers", 1, "50 MB"));

      const olderThanMs = 7 * 24 * 60 * 60 * 1000;
      await cleanResources({
        resources: ["containers"],
        olderThanMs,
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 1,
          images: 0,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      const callArgs = mockPrune.mock.calls[0];
      expect(callArgs[1]).toBeDefined();
    });

    it("handles undefined olderThanMs", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockResolvedValue(createPruneResponse("containers", 1, "50 MB"));

      const result = await cleanResources({
        resources: ["containers"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 1,
          images: 0,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      expect(result.removed.containers).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("handles empty resource list", async () => {
      const mockPrune = docker.dockerPrune as any;

      const result = await cleanResources({
        resources: [],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 0,
          images: 0,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      expect(mockPrune).not.toHaveBeenCalled();
      expect(result.reclaimedBytes).toBe(0);
    });

    it("handles malformed docker output", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockResolvedValue("Unexpected output format");

      const result = await cleanResources({
        resources: ["containers"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 5,
          images: 0,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      expect(result.removed.containers).toBe(5);
      expect(result.reclaimedBytes).toBe(0);
    });

    it("handles error as Error object", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockRejectedValue(new Error("Test error"));

      const result = await cleanResources({
        resources: ["containers"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 1,
          images: 0,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      expect(result.failures.containers).toContain("Test error");
    });

    it("handles error as string", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockRejectedValue("String error");

      const result = await cleanResources({
        resources: ["containers"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 1,
          images: 0,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      expect(result.failures.containers).toContain("String error");
    });

    it("handles zero removed count", async () => {
      const mockPrune = docker.dockerPrune as any;
      mockPrune.mockResolvedValue("No items to delete\n");

      const result = await cleanResources({
        resources: ["containers"],
        dryRun: false,
        includeAllImages: false,
        expectedCounts: {
          containers: 3,
          images: 0,
          volumes: 0,
          networks: 0,
          cache: 0
        }
      });

      expect(result.removed.containers).toBe(3);
    });
  });
});
