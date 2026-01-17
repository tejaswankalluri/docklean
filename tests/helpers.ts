import { vi, Mock } from "vitest";
import { execDocker } from "../src/docker";

/**
 * Mock helper to set up docker command responses
 * Allows setting specific responses for different docker commands
 */
export function mockDockerExec() {
  const responses: Record<string, string> = {};
  const callLog: string[][] = [];

  const execDockerMock = vi.fn(async (args: string[]) => {
    callLog.push([...args]);
    const key = args.join(" ");

    if (key in responses) {
      return {
        stdout: responses[key],
        stderr: ""
      };
    }

    // Default error response for unmocked commands
    throw new Error(`Unmocked docker command: ${key}`);
  });

  return {
    execDockerMock,
    setResponse: (args: string[], output: string) => {
      responses[args.join(" ")] = output;
    },
    setMultipleResponses: (
      responses_: Record<string, string>
    ) => {
      Object.assign(responses, responses_);
    },
    getCallLog: () => callLog,
    reset: () => {
      callLog.length = 0;
      Object.keys(responses).forEach((key) => {
        delete responses[key];
      });
    }
  };
}

/**
 * Sample docker container response data
 */
export const SAMPLE_CONTAINERS = [
  {
    ID: "abc123def456",
    Names: "old-container",
    State: "exited",
    Size: "150 MB",
    CreatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    ID: "xyz789uvw012",
    Names: "recent-container",
    State: "exited",
    Size: "50 MB",
    CreatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    ID: "running123",
    Names: "active-container",
    State: "running",
    Size: "100 MB",
    CreatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
  }
];

/**
 * Sample docker images response data
 */
export const SAMPLE_IMAGES = [
  {
    ID: "sha256:aaa111",
    Repository: "<none>",
    Tag: "<none>",
    Size: "500 MB",
    CreatedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    ID: "sha256:bbb222",
    Repository: "nginx",
    Tag: "latest",
    Size: "200 MB",
    CreatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    ID: "sha256:ccc333",
    Repository: "<none>",
    Tag: "<none>",
    Size: "300 MB",
    CreatedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  }
];

/**
 * Sample docker volumes response data
 */
export const SAMPLE_VOLUMES = [
  {
    Name: "old-volume",
    Driver: "local",
    CreatedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    Name: "recent-volume",
    Driver: "local",
    CreatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  }
];

/**
 * Sample docker networks response data
 */
export const SAMPLE_NETWORKS = [
  {
    ID: "net123",
    Name: "custom-network",
    CreatedAt: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString()
  },
  {
    ID: "net456",
    Name: "bridge",
    CreatedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
  }
];

/**
 * Convert sample data to JSON lines format
 */
export function toJsonLines(items: Record<string, string>[]): string {
  return items.map((item) => JSON.stringify(item)).join("\n");
}

/**
 * Create a mock docker prune response
 */
export function createPruneResponse(
  type: "containers" | "images" | "volumes" | "networks" | "cache",
  count: number,
  reclaimedSpace: string
): string {
  const labels: Record<string, string> = {
    containers: "Deleted Containers:",
    images: "Deleted Images:",
    volumes: "Deleted Volumes:",
    networks: "Deleted Networks:",
    cache: "Deleted layers:"
  };

  return `${labels[type]} ${count}\nTotal reclaimed space: ${reclaimedSpace}\n`;
}

/**
 * Create a mock docker builder prune dry-run response
 */
export function createBuilderPruneDryRunResponse(reclaimedSpace: string): string {
  return `Total reclaimable: ${reclaimedSpace}\n`;
}
