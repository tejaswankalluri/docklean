import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { scanResources, summarizeScan } from "../src/scan";
import {
  dockerPsAll,
  dockerImages,
  dockerVolumes,
  dockerNetworks,
  dockerBuilderPruneDryRun
} from "../src/docker";
import {
  SAMPLE_CONTAINERS,
  SAMPLE_IMAGES,
  SAMPLE_VOLUMES,
  SAMPLE_NETWORKS,
  toJsonLines,
  createBuilderPruneDryRunResponse
} from "./helpers";

vi.mock("../src/docker", () => ({
  dockerPsAll: vi.fn(),
  dockerImages: vi.fn(),
  dockerVolumes: vi.fn(),
  dockerNetworks: vi.fn(),
  dockerSystemDf: vi.fn(),
  dockerBuilderPruneDryRun: vi.fn(),
  filterUntilTimestamp: vi.fn((ms) => {
    if (!ms) return undefined;
    const cutoff = Date.now() - ms;
    return new Date(cutoff).toISOString();
  }),
  formatBytes: vi.fn((bytes) => {
    if (bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1000 && unitIndex < units.length - 1) {
      value /= 1000;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }),
  parseDockerSize: vi.fn((size) => {
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
  }),
  isSystemNetwork: vi.fn((name) => {
    return ["bridge", "host", "none"].includes(name);
  })
}));

describe("scanResources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("container filtering", () => {
    it("scans stopped containers", async () => {
      const mockPsAll = dockerPsAll as any;
      mockPsAll.mockResolvedValue(SAMPLE_CONTAINERS);

      const result = await scanResources({
        includeContainers: true,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false
      });

      expect(result.summaries).toHaveLength(1);
      expect(result.summaries[0].type).toBe("containers");
      // Should filter out running containers
      expect(result.summaries[0].items.length).toBe(2);
    });

    it("skips containers when not included", async () => {
      const mockPsAll = dockerPsAll as any;
      mockPsAll.mockResolvedValue(SAMPLE_CONTAINERS);

      const result = await scanResources({
        includeContainers: false,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false
      });

      expect(result.summaries).toHaveLength(0);
      expect(mockPsAll).not.toHaveBeenCalled();
    });

    it("applies older-than filter to containers", async () => {
       const mockPsAll = dockerPsAll as any;
       mockPsAll.mockResolvedValue(SAMPLE_CONTAINERS);

       // Filter for 14 days old (should exclude 2-day-old container)
       const result = await scanResources({
         includeContainers: true,
         includeImages: false,
         includeVolumes: false,
         includeNetworks: false,
         includeCache: false,
         olderThanMs: 14 * 24 * 60 * 60 * 1000
       });

       expect(result.summaries[0].items.length).toBe(1);
       expect(result.summaries[0].items[0].name).toBe("recent-container");
     });

    it("calculates reclaimable bytes for containers", async () => {
      const mockPsAll = dockerPsAll as any;
      mockPsAll.mockResolvedValue([
        {
          ID: "abc123",
          Names: "container1",
          State: "exited",
          Size: "100 MB",
          CreatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "def456",
          Names: "container2",
          State: "exited",
          Size: "200 MB",
          CreatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      const result = await scanResources({
        includeContainers: true,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false
      });

      expect(result.summaries[0].reclaimableBytes).toBe(
        300 * 1000 * 1000
      );
    });

    it("filters out only exited and dead containers", async () => {
      const mockPsAll = dockerPsAll as any;
      mockPsAll.mockResolvedValue([
        { ID: "1", Names: "running", State: "running", Size: "0" },
        { ID: "2", Names: "exited", State: "exited", Size: "100 MB" },
        { ID: "3", Names: "dead", State: "dead", Size: "50 MB" },
        { ID: "4", Names: "paused", State: "paused", Size: "75 MB" }
      ]);

      const result = await scanResources({
        includeContainers: true,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false
      });

      expect(result.summaries[0].items).toHaveLength(2);
    });
  });

  describe("image filtering", () => {
    it("scans dangling images by default", async () => {
      const mockImages = dockerImages as any;
      mockImages.mockResolvedValue(SAMPLE_IMAGES);

      const result = await scanResources({
        includeContainers: false,
        includeImages: true,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        includeAllImages: false
      });

      expect(result.summaries[0].type).toBe("images");
      // Should only include dangling images (Repository or Tag is <none>)
      expect(result.summaries[0].items.length).toBe(2);
    });

    it("scans all images when includeAllImages is true", async () => {
      const mockImages = dockerImages as any;
      mockImages.mockResolvedValue(SAMPLE_IMAGES);

      const result = await scanResources({
        includeContainers: false,
        includeImages: true,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        includeAllImages: true
      });

      expect(result.summaries[0].items.length).toBe(3);
    });

    it("applies older-than filter to images", async () => {
       const mockImages = dockerImages as any;
       mockImages.mockResolvedValue(SAMPLE_IMAGES);

       const result = await scanResources({
         includeContainers: false,
         includeImages: true,
         includeVolumes: false,
         includeNetworks: false,
         includeCache: false,
         includeAllImages: false,
         olderThanMs: 30 * 24 * 60 * 60 * 1000
       });

       // Only the very old dangling image should remain
       expect(result.summaries[0].items.length).toBe(0);
     });

    it("returns correct label for dangling images", async () => {
      const mockImages = dockerImages as any;
      mockImages.mockResolvedValue(SAMPLE_IMAGES);

      const result = await scanResources({
        includeContainers: false,
        includeImages: true,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        includeAllImages: false
      });

      expect(result.summaries[0].label).toBe("Dangling images");
    });

    it("returns correct label for all images", async () => {
      const mockImages = dockerImages as any;
      mockImages.mockResolvedValue(SAMPLE_IMAGES);

      const result = await scanResources({
        includeContainers: false,
        includeImages: true,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        includeAllImages: true
      });

      expect(result.summaries[0].label).toBe("Unused images");
    });
  });

  describe("volume filtering", () => {
    it("scans volumes", async () => {
      const mockVolumes = dockerVolumes as any;
      mockVolumes.mockResolvedValue(SAMPLE_VOLUMES);

      const result = await scanResources({
        includeContainers: false,
        includeImages: false,
        includeVolumes: true,
        includeNetworks: false,
        includeCache: false
      });

      expect(result.summaries[0].type).toBe("volumes");
      expect(result.summaries[0].items.length).toBe(2);
    });

    it("applies older-than filter to volumes", async () => {
       const mockVolumes = dockerVolumes as any;
       mockVolumes.mockResolvedValue(SAMPLE_VOLUMES);

       const result = await scanResources({
         includeContainers: false,
         includeImages: false,
         includeVolumes: true,
         includeNetworks: false,
         includeCache: false,
         olderThanMs: 30 * 24 * 60 * 60 * 1000
       });

       expect(result.summaries[0].items.length).toBe(1);
       expect(result.summaries[0].items[0].name).toBe("recent-volume");
     });

    it("volumes have no reclaimable bytes", async () => {
      const mockVolumes = dockerVolumes as any;
      mockVolumes.mockResolvedValue(SAMPLE_VOLUMES);

      const result = await scanResources({
        includeContainers: false,
        includeImages: false,
        includeVolumes: true,
        includeNetworks: false,
        includeCache: false
      });

      expect(result.summaries[0].reclaimableBytes).toBe(0);
    });
  });

  describe("network filtering", () => {
    it("scans networks", async () => {
      const mockNetworks = dockerNetworks as any;
      mockNetworks.mockResolvedValue(SAMPLE_NETWORKS);

      const result = await scanResources({
        includeContainers: false,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: true,
        includeCache: false
      });

      expect(result.summaries[0].type).toBe("networks");
      expect(result.summaries[0].items.length).toBe(1);
    });

    it("filters out system networks", async () => {
      const mockNetworks = dockerNetworks as any;
      mockNetworks.mockResolvedValue([
        { ID: "1", Name: "bridge", CreatedAt: new Date().toISOString() },
        { ID: "2", Name: "custom", CreatedAt: new Date().toISOString() },
        { ID: "3", Name: "host", CreatedAt: new Date().toISOString() },
        { ID: "4", Name: "none", CreatedAt: new Date().toISOString() }
      ]);

      const result = await scanResources({
        includeContainers: false,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: true,
        includeCache: false
      });

      expect(result.summaries[0].items.length).toBe(1);
      expect(result.summaries[0].items[0].name).toBe("custom");
    });

    it("applies older-than filter to networks", async () => {
       const mockNetworks = dockerNetworks as any;
       mockNetworks.mockResolvedValue(SAMPLE_NETWORKS);
 
       const result = await scanResources({
         includeContainers: false,
         includeImages: false,
         includeVolumes: false,
         includeNetworks: true,
         includeCache: false,
         olderThanMs: 60 * 24 * 60 * 60 * 1000
       });
 
       expect(result.summaries[0].items.length).toBe(1);
     });

    it("networks have no reclaimable bytes", async () => {
      const mockNetworks = dockerNetworks as any;
      mockNetworks.mockResolvedValue(SAMPLE_NETWORKS);

      const result = await scanResources({
        includeContainers: false,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: true,
        includeCache: false
      });

      expect(result.summaries[0].reclaimableBytes).toBe(0);
    });
  });

  describe("cache scanning", () => {
    it("scans builder cache", async () => {
      const mockBuilderPrune = dockerBuilderPruneDryRun as any;
      mockBuilderPrune.mockResolvedValue(
        createBuilderPruneDryRunResponse("2 GB")
      );

      const result = await scanResources({
        includeContainers: false,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: true
      });

      expect(result.summaries[0].type).toBe("cache");
      expect(result.summaries[0].items).toHaveLength(0);
      expect(result.summaries[0].reclaimableBytes).toBe(2 * 1000 * 1000 * 1000);
    });

    it("applies older-than filter to cache", async () => {
      const mockBuilderPrune = dockerBuilderPruneDryRun as any;
      mockBuilderPrune.mockResolvedValue(
        createBuilderPruneDryRunResponse("1.5 GB")
      );

      const result = await scanResources({
        includeContainers: false,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: true,
        olderThanMs: 7 * 24 * 60 * 60 * 1000
      });

      expect(result.summaries[0].type).toBe("cache");
      expect(result.summaries[0].reclaimableBytes).toBeGreaterThan(0);
    });
  });

  describe("multiple resource scanning", () => {
    it("scans multiple resources together", async () => {
      const mockPsAll = dockerPsAll as any;
      const mockImages = dockerImages as any;
      const mockVolumes = dockerVolumes as any;

      mockPsAll.mockResolvedValue(SAMPLE_CONTAINERS);
      mockImages.mockResolvedValue(SAMPLE_IMAGES);
      mockVolumes.mockResolvedValue(SAMPLE_VOLUMES);

      const result = await scanResources({
        includeContainers: true,
        includeImages: true,
        includeVolumes: true,
        includeNetworks: false,
        includeCache: false,
        includeAllImages: false
      });

      expect(result.summaries).toHaveLength(3);
      expect(result.summaries.map((s) => s.type)).toEqual([
        "containers",
        "images",
        "volumes"
      ]);
    });

    it("calculates total reclaimable bytes", async () => {
      const mockPsAll = dockerPsAll as any;
      const mockImages = dockerImages as any;

      mockPsAll.mockResolvedValue([
        {
          ID: "1",
          Names: "c1",
          State: "exited",
          Size: "100 MB",
          CreatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);
      mockImages.mockResolvedValue([
        {
          ID: "1",
          Repository: "<none>",
          Tag: "<none>",
          Size: "200 MB",
          CreatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      const result = await scanResources({
        includeContainers: true,
        includeImages: true,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        includeAllImages: false
      });

      expect(result.totalReclaimableBytes).toBe(300 * 1000 * 1000);
    });
  });

  describe("edge cases", () => {
    it("handles missing size data", async () => {
      const mockPsAll = dockerPsAll as any;
      mockPsAll.mockResolvedValue([
        {
          ID: "abc",
          Names: "container",
          State: "exited",
          Size: undefined,
          CreatedAt: new Date().toISOString()
        }
      ]);

      const result = await scanResources({
        includeContainers: true,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false
      });

      expect(result.summaries[0].items).toHaveLength(1);
      expect(result.summaries[0].reclaimableBytes).toBe(0);
    });

    it("handles missing createdAt data", async () => {
      const mockPsAll = dockerPsAll as any;
      mockPsAll.mockResolvedValue([
        {
          ID: "abc",
          Names: "container",
          State: "exited",
          Size: "100 MB",
          CreatedAt: undefined
        }
      ]);

      const result = await scanResources({
        includeContainers: true,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        olderThanMs: 7 * 24 * 60 * 60 * 1000
      });

      expect(result.summaries[0].items).toHaveLength(0);
    });

    it("handles empty scan results", async () => {
      const mockPsAll = dockerPsAll as any;
      const mockImages = dockerImages as any;

      mockPsAll.mockResolvedValue([]);
      mockImages.mockResolvedValue([]);

      const result = await scanResources({
        includeContainers: true,
        includeImages: true,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        includeAllImages: false
      });

      expect(result.summaries).toHaveLength(2);
      expect(result.totalReclaimableBytes).toBe(0);
    });
  });
});

describe("summarizeScan", () => {
  it("formats summary text", () => {
    const result = {
      summaries: [],
      totalReclaimableBytes: 1000000000
    };
    const summary = summarizeScan(result);
    expect(summary).toContain("Estimated reclaimable:");
    expect(summary).toContain("GB");
  });

  it("handles zero reclaimable bytes", () => {
    const result = {
      summaries: [],
      totalReclaimableBytes: 0
    };
    const summary = summarizeScan(result);
    expect(summary).toContain("0 B");
  });
});

describe("size filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("top N filter", () => {
    it("selects top N largest containers", async () => {
      const mockPsAll = dockerPsAll as any;
      mockPsAll.mockResolvedValue([
        {
          ID: "1",
          Names: "large",
          State: "exited",
          Size: "500 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "2",
          Names: "medium",
          State: "exited",
          Size: "300 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "3",
          Names: "small",
          State: "exited",
          Size: "100 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      const result = await scanResources({
        includeContainers: true,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        top: 2
      });

      expect(result.summaries[0].items).toHaveLength(2);
      expect(result.summaries[0].items[0].name).toBe("large");
      expect(result.summaries[0].items[1].name).toBe("medium");
    });

    it("selects top N largest images", async () => {
      const mockImages = dockerImages as any;
      mockImages.mockResolvedValue([
        {
          ID: "1",
          Repository: "<none>",
          Tag: "<none>",
          Size: "1 GB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "2",
          Repository: "<none>",
          Tag: "<none>",
          Size: "500 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "3",
          Repository: "<none>",
          Tag: "<none>",
          Size: "200 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "4",
          Repository: "<none>",
          Tag: "<none>",
          Size: "100 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      const result = await scanResources({
        includeContainers: false,
        includeImages: true,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        includeAllImages: false,
        top: 3
      });

      expect(result.summaries[0].items).toHaveLength(3);
      expect(result.summaries[0].items[0].size).toBe("1 GB");
      expect(result.summaries[0].items[1].size).toBe("500 MB");
      expect(result.summaries[0].items[2].size).toBe("200 MB");
    });

    it("returns all items when top N is greater than available items", async () => {
      const mockPsAll = dockerPsAll as any;
      mockPsAll.mockResolvedValue([
        {
          ID: "1",
          Names: "container1",
          State: "exited",
          Size: "100 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "2",
          Names: "container2",
          State: "exited",
          Size: "50 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      const result = await scanResources({
        includeContainers: true,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        top: 10
      });

      expect(result.summaries[0].items).toHaveLength(2);
    });
  });

  describe("limit-space filter", () => {
    it("selects containers until space limit is reached", async () => {
      const mockPsAll = dockerPsAll as any;
      mockPsAll.mockResolvedValue([
        {
          ID: "1",
          Names: "large",
          State: "exited",
          Size: "500 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "2",
          Names: "medium",
          State: "exited",
          Size: "300 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "3",
          Names: "small",
          State: "exited",
          Size: "100 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      // Limit to 600 MB - should select large (500) + medium (300) = 800 MB
      // but since we need to reach 600, it should select large (500) first, 
      // then medium would exceed, so select medium anyway to reach the goal
      const result = await scanResources({
        includeContainers: true,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        limitSpaceBytes: 600 * 1000 * 1000
      });

      expect(result.summaries[0].items).toHaveLength(2);
      expect(result.summaries[0].items[0].name).toBe("large");
      expect(result.summaries[0].items[1].name).toBe("medium");
    });

    it("selects images until space limit is reached", async () => {
      const mockImages = dockerImages as any;
      mockImages.mockResolvedValue([
        {
          ID: "1",
          Repository: "<none>",
          Tag: "<none>",
          Size: "1 GB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "2",
          Repository: "<none>",
          Tag: "<none>",
          Size: "500 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "3",
          Repository: "<none>",
          Tag: "<none>",
          Size: "200 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      const result = await scanResources({
        includeContainers: false,
        includeImages: true,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        includeAllImages: false,
        limitSpaceBytes: 1.2 * 1000 * 1000 * 1000
      });

      expect(result.summaries[0].items).toHaveLength(2);
      expect(result.summaries[0].reclaimableBytes).toBe(1.5 * 1000 * 1000 * 1000);
    });

    it("selects single item when it exceeds limit", async () => {
      const mockPsAll = dockerPsAll as any;
      mockPsAll.mockResolvedValue([
        {
          ID: "1",
          Names: "huge",
          State: "exited",
          Size: "5 GB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "2",
          Names: "small",
          State: "exited",
          Size: "100 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      const result = await scanResources({
        includeContainers: true,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        limitSpaceBytes: 1 * 1000 * 1000 * 1000 // 1 GB limit
      });

      // Should select at least the first (largest) item
      expect(result.summaries[0].items).toHaveLength(1);
      expect(result.summaries[0].items[0].name).toBe("huge");
    });
  });

  describe("sorting by size", () => {
    it("sorts containers by size in descending order", async () => {
      const mockPsAll = dockerPsAll as any;
      mockPsAll.mockResolvedValue([
        {
          ID: "1",
          Names: "small",
          State: "exited",
          Size: "100 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "2",
          Names: "large",
          State: "exited",
          Size: "500 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "3",
          Names: "medium",
          State: "exited",
          Size: "300 MB",
          CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      const result = await scanResources({
        includeContainers: true,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        top: 10 // Get all but sorted
      });

      expect(result.summaries[0].items).toHaveLength(3);
      expect(result.summaries[0].items[0].name).toBe("large");
      expect(result.summaries[0].items[1].name).toBe("medium");
      expect(result.summaries[0].items[2].name).toBe("small");
    });
  });

  describe("combined with older-than filter", () => {
    it("applies older-than filter before size filter", async () => {
      const mockPsAll = dockerPsAll as any;
      mockPsAll.mockResolvedValue([
        {
          ID: "1",
          Names: "old-large",
          State: "exited",
          Size: "500 MB",
          CreatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "2",
          Names: "recent-huge",
          State: "exited",
          Size: "1 GB",
          CreatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          ID: "3",
          Names: "old-small",
          State: "exited",
          Size: "100 MB",
          CreatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]);

      const result = await scanResources({
        includeContainers: true,
        includeImages: false,
        includeVolumes: false,
        includeNetworks: false,
        includeCache: false,
        olderThanMs: 14 * 24 * 60 * 60 * 1000, // 14 days
        top: 1
      });

      // Should filter for items NOT older than 14 days first (keeps recent-huge only)
      // Then select top 1 from remaining (which is recent-huge)
      expect(result.summaries[0].items).toHaveLength(1);
      expect(result.summaries[0].items[0].name).toBe("recent-huge");
    });
  });
});
