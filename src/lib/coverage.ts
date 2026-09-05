import type { AgentEntry, CaseReport, JobEntry, Measured, ToolEntry } from "../schema/index.ts";
import type { Registry } from "./registry.ts";
import { normalizeHandle } from "./handles.ts";

/**
 * The coverage join (docs/TAXONOMY.md): solutions x jobs x evidence,
 * with three axes kept apart in every cell: the evidence TYPE, the
 * OUTCOME it points to, and its INDEPENDENCE. A negative measured
 * result is "measured: contradicts" and never counts as support. An
 * empty cell is a finding, and the site says so.
 */

export type EvidenceType = "measured" | "case-report" | "claim" | "none";
export type Outcome = "supports" | "mixed" | "contradicts" | "inconclusive";
export type Independence = "independent" | "self" | "vendor-sponsored" | "affiliated";

export interface SolutionRef {
  type: "agent" | "tool";
  id: string;
  name: string;
  url: string;
}

export interface EvidenceCell {
  id: string;
  type: "measured" | "case-report";
  outcome: Outcome;
  independence: Independence;
  url: string;
  summary: string;
  reporter: string;
  at: string;
}

export interface Cell {
  solution: SolutionRef;
  claim: { summary: string; source?: string; since?: string } | null;
  /** The strongest type present: measured > case-report > claim. */
  type: EvidenceType;
  evidence: EvidenceCell[];
  supports: number;
  contradicts: number;
}

export interface JobCoverage {
  job: JobEntry;
  cells: Cell[];
  counts: { solutions: number; claims: number; caseReports: number; measured: number; supports: number; contradicts: number };
}

function caseOutcome(report: CaseReport): Outcome {
  switch (report.outcome.verdict) {
    case "positive":
      return "supports";
    case "negative":
      return "contradicts";
    case "mixed":
      return "mixed";
    default:
      return "inconclusive";
  }
}

/** A measured result supports the claim when every metric with a baseline moved the right way. */
function measuredOutcome(measured: Measured): Outcome {
  let better = 0;
  let worse = 0;
  for (const result of measured.results) {
    if (result.baseline === undefined) continue;
    const higher = result.higherIsBetter ?? true;
    const improved = higher ? result.value > result.baseline : result.value < result.baseline;
    if (improved) better += 1;
    else if (result.value !== result.baseline) worse += 1;
  }
  if (better === 0 && worse === 0) return "inconclusive";
  if (better > 0 && worse === 0) return "supports";
  if (worse > 0 && better === 0) return "contradicts";
  return "mixed";
}

function independenceOf(item: { disclosure: { affiliation: string; compensation: string; reseller: boolean } }, measured?: Measured): Independence {
  if (measured) {
    if (measured.independence === "vendor-sponsored") return "vendor-sponsored";
    if (measured.independence === "self") return "self";
  }
  const d = item.disclosure;
  if (d.affiliation !== "none" || d.compensation !== "none" || d.reseller) return "affiliated";
  return "independent";
}

export function solutionsOf(registry: Registry): SolutionRef[] {
  return [
    ...registry.agents.map(a => ({ type: "agent" as const, id: normalizeHandle(a.value.handle), name: a.value.displayName, url: `/@${a.value.handle}` })),
    ...registry.tools.map(t => ({ type: "tool" as const, id: t.value.slug, name: t.value.name, url: `/tools/${t.value.slug}` }))
  ];
}

export function coverage(registry: Registry): Map<string, JobCoverage> {
  const solutions = new Map(solutionsOf(registry).map(s => [`${s.type}:${s.id}`, s]));
  const byJob = new Map<string, JobCoverage>();
  for (const job of registry.jobs) {
    byJob.set(job.value.id, { job: job.value, cells: [], counts: { solutions: 0, claims: 0, caseReports: 0, measured: 0, supports: 0, contradicts: 0 } });
  }
  const cellFor = (jobId: string, key: string): Cell | undefined => {
    const jc = byJob.get(jobId);
    const solution = solutions.get(key);
    if (!jc || !solution) return undefined;
    let cell = jc.cells.find(c => `${c.solution.type}:${c.solution.id}` === key);
    if (!cell) {
      cell = { solution, claim: null, type: "none", evidence: [], supports: 0, contradicts: 0 };
      jc.cells.push(cell);
    }
    return cell;
  };
  const claimsOf = (entry: AgentEntry | ToolEntry, key: string) => {
    for (const claim of entry.jobs ?? []) {
      const cell = cellFor(claim.job, key);
      if (!cell) continue;
      cell.claim = { summary: claim.summary, ...(claim.source ? { source: claim.source } : {}), ...(claim.since ? { since: claim.since } : {}) };
      if (cell.type === "none") cell.type = "claim";
    }
  };
  for (const agent of registry.agents) claimsOf(agent.value, `agent:${normalizeHandle(agent.value.handle)}`);
  for (const tool of registry.tools) claimsOf(tool.value, `tool:${tool.value.slug}`);
  for (const report of registry.caseReports) {
    const key = `${report.value.solution.type}:${report.value.solution.type === "agent" ? normalizeHandle(report.value.solution.id) : report.value.solution.id}`;
    const cell = cellFor(report.value.job, key);
    if (!cell) continue;
    const outcome = caseOutcome(report.value);
    cell.evidence.push({
      id: report.value.id,
      type: "case-report",
      outcome,
      independence: independenceOf(report.value),
      url: `/evidence/${report.value.id}`,
      summary: report.value.outcome.summary,
      reporter: report.value.reporter.name,
      at: report.value.updated
    });
    if (cell.type !== "measured") cell.type = "case-report";
  }
  for (const measured of registry.measured) {
    const key = `${measured.value.solution.type}:${measured.value.solution.type === "agent" ? normalizeHandle(measured.value.solution.id) : measured.value.solution.id}`;
    const cell = cellFor(measured.value.job, key);
    if (!cell) continue;
    cell.evidence.push({
      id: measured.value.id,
      type: "measured",
      outcome: measuredOutcome(measured.value),
      independence: independenceOf(measured.value, measured.value),
      url: `/evidence/${measured.value.id}`,
      summary: measured.value.method.summary,
      reporter: measured.value.conductedBy.name,
      at: measured.value.updated
    });
    cell.type = "measured";
  }
  for (const jc of byJob.values()) {
    for (const cell of jc.cells) {
      cell.supports = cell.evidence.filter(e => e.outcome === "supports").length;
      cell.contradicts = cell.evidence.filter(e => e.outcome === "contradicts").length;
      jc.counts.solutions += 1;
      if (cell.claim) jc.counts.claims += 1;
      jc.counts.caseReports += cell.evidence.filter(e => e.type === "case-report").length;
      jc.counts.measured += cell.evidence.filter(e => e.type === "measured").length;
      jc.counts.supports += cell.supports;
      jc.counts.contradicts += cell.contradicts;
    }
    jc.cells.sort((a, b) => a.solution.name.localeCompare(b.solution.name));
  }
  return byJob;
}
