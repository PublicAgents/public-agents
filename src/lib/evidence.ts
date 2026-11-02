import { independenceOf } from "./coverage.ts";
import type { Registry } from "./registry.ts";

/**
 * The evidence array the site renders: every case report and measured result
 * as filed, except that `independence` carries the DERIVED grading rather
 * than the reporter's own declaration of it.
 *
 * It is replaced rather than added beside, because `site/src/pages/evidence/[id].astro`
 * prints this field under the heading "Independence" and the registry must not
 * answer the same question two ways: the job page grades a competitor's
 * measurement `affiliated` from its disclosure (docs/TAXONOMY.md), so the
 * evidence page cannot print the `independent` the reporter declared. A page
 * that holds only the derived value cannot render the other one by mistake.
 *
 * The record exactly as filed stays one click away: `/evidence/<id>.json` is
 * written from the file itself, and so is the file in `registry/`.
 */
export function evidenceForSite(registry: Registry) {
  return [
    ...registry.caseReports.map(e => ({ kind: "case-report" as const, ...e.value, independence: independenceOf(e.value) })),
    ...registry.measured.map(e => ({ kind: "measured" as const, ...e.value, independence: independenceOf(e.value, e.value) }))
  ];
}
