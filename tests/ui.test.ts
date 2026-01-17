import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { confirm, isCancel, outro } from "@clack/prompts";
import {
  setColorEnabled,
  renderSummaryTable,
  renderDetailTable,
  statusInfo,
  statusWarn,
  statusDelete,
  statusSafe,
  confirmProceed
} from "../src/ui";
import { ResourceSummary } from "../src/types";

vi.mock("@clack/prompts", () => ({
  confirm: vi.fn(),
  isCancel: vi.fn((value) => value === Symbol.for("cancel")),
  outro: vi.fn()
}));

describe("UI functions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("setColorEnabled", () => {
    it("enables colors when true", () => {
      setColorEnabled(true);
      // Color level 3 is the maximum
      // We can't directly test chalk.level without mocking chalk
      // But we can ensure the function doesn't throw
      expect(() => setColorEnabled(true)).not.toThrow();
    });

    it("disables colors when false", () => {
      setColorEnabled(false);
      // Level 0 disables colors
      expect(() => setColorEnabled(false)).not.toThrow();
    });
  });

  describe("renderSummaryTable", () => {
    it("renders summary table with headers", () => {
      const summaries: ResourceSummary[] = [
        {
          type: "containers",
          label: "Stopped containers",
          items: [{ id: "1", name: "old-container" }],
          reclaimableBytes: 150000000
        }
      ];

      const result = renderSummaryTable(summaries);

      expect(result).toContain("Type");
      expect(result).toContain("Count");
      expect(result).toContain("Estimated Size");
    });

    it("renders correct counts in summary table", () => {
      const summaries: ResourceSummary[] = [
        {
          type: "containers",
          label: "Stopped containers",
          items: [
            { id: "1", name: "container1" },
            { id: "2", name: "container2" },
            { id: "3", name: "container3" }
          ],
          reclaimableBytes: 300000000
        }
      ];

      const result = renderSummaryTable(summaries);

      expect(result).toContain("3");
    });

    it("renders correct sizes in summary table", () => {
      const summaries: ResourceSummary[] = [
        {
          type: "images",
          label: "Dangling images",
          items: [{ id: "sha256:abc", name: "<none>:<none>" }],
          reclaimableBytes: 500 * 1000 * 1000
        }
      ];

      const result = renderSummaryTable(summaries);

      expect(result).toContain("MB");
    });

    it("renders dash for zero reclaimable bytes", () => {
      const summaries: ResourceSummary[] = [
        {
          type: "volumes",
          label: "Unused volumes",
          items: [{ id: "vol1", name: "volume-name" }],
          reclaimableBytes: 0
        }
      ];

      const result = renderSummaryTable(summaries);

      expect(result).toContain("-");
    });

    it("renders multiple summaries", () => {
      const summaries: ResourceSummary[] = [
        {
          type: "containers",
          label: "Stopped containers",
          items: [{ id: "1", name: "c1" }],
          reclaimableBytes: 100000000
        },
        {
          type: "images",
          label: "Dangling images",
          items: [{ id: "2", name: "i1" }],
          reclaimableBytes: 200000000
        },
        {
          type: "volumes",
          label: "Unused volumes",
          items: [{ id: "3", name: "v1" }],
          reclaimableBytes: 0
        }
      ];

      const result = renderSummaryTable(summaries);

      expect(result).toContain("Stopped containers");
      expect(result).toContain("Dangling images");
      expect(result).toContain("Unused volumes");
    });

    it("handles empty summaries", () => {
      const result = renderSummaryTable([]);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("renderDetailTable", () => {
    it("renders detail table with headers", () => {
      const summary: ResourceSummary = {
        type: "containers",
        label: "Stopped containers",
        items: [
          {
            id: "abc123",
            name: "old-container",
            size: "150 MB",
            createdAt: "2024-01-15T00:00:00Z",
            lastUsed: "30 days ago"
          }
        ],
        reclaimableBytes: 150000000
      };

      const result = renderDetailTable(summary);

      expect(result).toContain("ID");
      expect(result).toContain("Name");
      expect(result).toContain("Size");
      expect(result).toContain("Created At");
      expect(result).toContain("Last Used");
    });

    it("renders item data in detail table", () => {
      const summary: ResourceSummary = {
        type: "containers",
        label: "Stopped containers",
        items: [
          {
            id: "abc123",
            name: "test-container",
            size: "250 MB",
            createdAt: "2024-01-15T00:00:00Z",
            lastUsed: "7 days ago"
          }
        ],
        reclaimableBytes: 250000000
      };

      const result = renderDetailTable(summary);

      expect(result).toContain("abc123");
      expect(result).toContain("test-container");
      expect(result).toContain("250 MB");
    });

    it("renders multiple items in detail table", () => {
      const summary: ResourceSummary = {
        type: "images",
        label: "Dangling images",
        items: [
          {
            id: "sha256:111",
            name: "<none>:<none>",
            size: "100 MB",
            createdAt: "2024-01-15T00:00:00Z",
            lastUsed: "Created 30 days ago"
          },
          {
            id: "sha256:222",
            name: "<none>:<none>",
            size: "200 MB",
            createdAt: "2024-01-10T00:00:00Z",
            lastUsed: "Created 35 days ago"
          }
        ],
        reclaimableBytes: 300000000
      };

      const result = renderDetailTable(summary);

      expect(result).toContain("sha256:111");
      expect(result).toContain("sha256:222");
      expect(result).toContain("100 MB");
      expect(result).toContain("200 MB");
    });

    it("handles missing optional fields", () => {
      const summary: ResourceSummary = {
        type: "volumes",
        label: "Unused volumes",
        items: [
          {
            id: "vol1",
            name: "volume-name"
          }
        ],
        reclaimableBytes: 0
      };

      const result = renderDetailTable(summary);

      expect(result).toContain("vol1");
      expect(result).toContain("volume-name");
      expect(result).toContain("-");
    });

    it("renders empty items list", () => {
      const summary: ResourceSummary = {
        type: "containers",
        label: "Stopped containers",
        items: [],
        reclaimableBytes: 0
      };

      const result = renderDetailTable(summary);

      expect(result).toBeDefined();
    });

    it("handles long text with wordWrap", () => {
      const summary: ResourceSummary = {
        type: "containers",
        label: "Stopped containers",
        items: [
          {
            id: "a-very-long-container-id-that-should-be-wrapped",
            name: "container-with-very-long-name-that-might-wrap-in-the-table",
            size: "150 MB",
            createdAt: "2024-01-15T00:00:00Z",
            lastUsed: "30 days ago"
          }
        ],
        reclaimableBytes: 150000000
      };

      const result = renderDetailTable(summary);

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("status functions", () => {
    it("statusInfo returns blue status message", () => {
      const result = statusInfo("Test message");
      expect(result).toContain("Test message");
      expect(result).toContain("🔵");
    });

    it("statusWarn returns yellow status message", () => {
      const result = statusWarn("Warning message");
      expect(result).toContain("Warning message");
      expect(result).toContain("🟡");
    });

    it("statusDelete returns red status message", () => {
      const result = statusDelete("Deleting resources");
      expect(result).toContain("Deleting resources");
      expect(result).toContain("🔴");
    });

    it("statusSafe returns green status message", () => {
      const result = statusSafe("All good");
      expect(result).toContain("All good");
      expect(result).toContain("🟢");
    });

    it("status functions handle empty messages", () => {
      expect(() => statusInfo("")).not.toThrow();
      expect(() => statusWarn("")).not.toThrow();
      expect(() => statusDelete("")).not.toThrow();
      expect(() => statusSafe("")).not.toThrow();
    });

    it("status functions handle special characters", () => {
      const message = "Test with @#$% special chars!";
      expect(() => statusInfo(message)).not.toThrow();
      expect(() => statusWarn(message)).not.toThrow();
      expect(() => statusDelete(message)).not.toThrow();
      expect(() => statusSafe(message)).not.toThrow();
    });
  });

  describe("confirmProceed", () => {
    it("prompts user with message and countText", async () => {
      const mockConfirm = confirm as any;
      mockConfirm.mockResolvedValue(true);

      const summary = "Estimated space: 500 MB";
      const countText = "⚠️ 5 items will be removed";

      await confirmProceed(summary, countText);

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(countText),
          initialValue: false
        })
      );
    });

    it("returns true when user confirms", async () => {
      const mockConfirm = confirm as any;
      mockConfirm.mockResolvedValue(true);

      const result = await confirmProceed("Summary", "Count");

      expect(result).toBe(true);
    });

    it("returns false when user declines", async () => {
      const mockConfirm = confirm as any;
      mockConfirm.mockResolvedValue(false);

      const result = await confirmProceed("Summary", "Count");

      expect(result).toBe(false);
    });

     it("returns true when user cancels", async () => {
       const mockConfirm = confirm as any;
       const mockIsCancel = isCancel as any;

       mockConfirm.mockResolvedValue(Symbol.for("cancel"));
       mockIsCancel.mockReturnValue(true);

       const result = await confirmProceed("Summary", "Count");

       expect(result).toBe(true);
     });

    it("calls outro when user cancels", async () => {
      const mockConfirm = confirm as any;
      const mockIsCancel = isCancel as any;
      const mockOutro = outro as any;

      mockConfirm.mockResolvedValue(Symbol.for("cancel"));
      mockIsCancel.mockReturnValue(true);

      await confirmProceed("Summary", "Count");

      expect(mockOutro).toHaveBeenCalledWith("Cancelled.");
    });

    it("passes initialValue of false to confirm", async () => {
      const mockConfirm = confirm as any;
      mockConfirm.mockResolvedValue(false);

      await confirmProceed("Summary", "Count");

      const callArgs = mockConfirm.mock.calls[0][0];
      expect(callArgs.initialValue).toBe(false);
    });

    it("includes both summary and countText in prompt message", async () => {
      const mockConfirm = confirm as any;
      mockConfirm.mockResolvedValue(true);

      const summary = "Estimated space: 1 GB";
      const countText = "⚠️ 10 items will be removed";

      await confirmProceed(summary, countText);

      const message = mockConfirm.mock.calls[0][0].message;
      expect(message).toContain(summary);
      expect(message).toContain(countText);
    });

    it("includes 'Proceed?' in prompt message", async () => {
      const mockConfirm = confirm as any;
      mockConfirm.mockResolvedValue(true);

      await confirmProceed("Summary", "Count");

      const message = mockConfirm.mock.calls[0][0].message;
      expect(message).toContain("Proceed?");
    });

    it("handles edge case with empty strings", async () => {
      const mockConfirm = confirm as any;
      mockConfirm.mockResolvedValue(true);

      const result = await confirmProceed("", "");

      expect(result).toBe(true);
    });

    it("handles edge case with very long text", async () => {
      const mockConfirm = confirm as any;
      mockConfirm.mockResolvedValue(true);

      const longSummary = "A".repeat(1000);
      const longCountText = "B".repeat(1000);

      const result = await confirmProceed(longSummary, longCountText);

      expect(result).toBe(true);
    });

    it("does not call outro on regular confirm", async () => {
      const mockConfirm = confirm as any;
      const mockOutro = outro as any;

      mockConfirm.mockResolvedValue(true);

      await confirmProceed("Summary", "Count");

      expect(mockOutro).not.toHaveBeenCalled();
    });

    it("does not call outro on decline", async () => {
      const mockConfirm = confirm as any;
      const mockOutro = outro as any;

      mockConfirm.mockResolvedValue(false);

      await confirmProceed("Summary", "Count");

      expect(mockOutro).not.toHaveBeenCalled();
    });
  });
});
