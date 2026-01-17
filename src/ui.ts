import { confirm, isCancel, outro } from "@clack/prompts";
import chalk from "chalk";
import Table from "cli-table3";
import { formatBytes } from "./docker";
import { ResourceSummary } from "./types";

export function setColorEnabled(enabled: boolean): void {
  chalk.level = enabled ? 3 : 0;
}

export function renderSummaryTable(summaries: ResourceSummary[]): string {
  const table = new Table({
    head: ["Type", "Count", "Estimated Size"],
    style: { head: ["cyan"] }
  });

  summaries.forEach((summary) => {
    table.push([
      summary.label,
      summary.items.length,
      summary.reclaimableBytes ? formatBytes(summary.reclaimableBytes) : "-"
    ]);
  });

  return table.toString();
}

export function renderDetailTable(summary: ResourceSummary): string {
  const table = new Table({
    head: ["ID", "Name", "Size", "Created At", "Last Used"],
    style: { head: ["cyan"] },
    colWidths: [18, 24, 12, 22, 22],
    wordWrap: true
  });

  summary.items.forEach((item) => {
    table.push([
      item.id || "-",
      item.name || "-",
      item.size || "-",
      item.createdAt || "-",
      item.lastUsed || "-"
    ]);
  });

  return table.toString();
}

export function statusInfo(message: string): string {
  return chalk.blue(`🔵 ${message}`);
}

export function statusWarn(message: string): string {
  return chalk.yellow(`🟡 ${message}`);
}

export function statusDelete(message: string): string {
  return chalk.red(`🔴 ${message}`);
}

export function statusSafe(message: string): string {
  return chalk.green(`🟢 ${message}`);
}

export async function confirmProceed(summary: string, countText: string): Promise<boolean> {
   const response = await confirm({
     message: `${countText}\n${summary}\nProceed?`,
     initialValue: false
   });

   if (isCancel(response)) {
     outro("Cancelled.");
     return true;
   }

   return Boolean(response);
 }
