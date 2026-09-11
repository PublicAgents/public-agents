# Jobs, claims and evidence

## Jobs

A job is an outcome an enterprise wants done, written in our own words,
at the granularity a solution can plausibly claim, with the measures
that would show it done. Jobs are grouped by function
(`registry/functions.json`: cs, fin, hr, proc, scm, legal, mkt, sales,
it, eng) and named `<function>.<outcome-slug>`, for example
`cs.deflect-tier1`. Ids are ours and stable forever: a job is never
renamed or deleted, only deprecated with a successor, and its page
redirects.

The map is cross-functional by design, the way process classification
frameworks are. We borrow that idea and nothing else: no framework's
ids, numbering, category names or process text appear here; every job
is written from scratch as an outcome with measures.

Anyone files a job with the job template: outcome phrasing, at least
two measures, aliases checked against search for duplicates. New
functions are a code-class change.

## Claims

A claim lives inside a solution's entry (`jobs[]`): the solution's own
assertion, in one sentence, with an optional source URL where the
vendor makes it. A claim carries no tier and no evidence inline.

## Evidence

Evidence is its own file and never needs the subject's consent:

- **Case report** (`registry/evidence/case-reports/`): a named reporter
  says they deployed a solution for a job, for a period, with an
  outcome, and discloses affiliation, compensation and reselling. The
  reporter's GitHub login is the pull request's author and never
  changes.
- **Measured** (`registry/evidence/measured/`): a measurement with its
  protocol URL and artifacts URL, so anyone can re-run it. A
  measurement nobody can re-run is a case report and is filed as one.
- **Probe** (`registry/evidence/probes/`): one request with no
  credentials and no payment, from one network, on one day, and what
  came back: the status, the headers, what a challenge decoded to. A
  probe answers a question no job can (`access`: what must a human do
  first; `payment`: what does it cost inline and by which protocol;
  `disclosure`: does the surface say it is an agent). It has a subject
  and no job, sets no field on the subject, never counts as support or
  contradiction for any claim, and is shown apart from both. One IP is
  one sample and the finding says so.

## Payment

Payment is a property of solutions, never a solution (issue #24). The
protocols by which an HTTP 402 is negotiated are vocabulary in
`registry/payment-protocols.json`, the way functions are, and a
protocol never gets an entry. A tool's optional `payments` block is the
vendor's claim about the second half of the registry's question: what a
human must do before an agent can pay (`machinePayable`, `protocols`,
`methods`, `humanBilling`, `priceList`, dated `notes`). An entry
without the block says nothing; `humanBilling: unknown` says the editor
looked and could not tell. An agent's `payments` has two sides, `sells`
and `pays`, each sourced to the agent's own surfaces, and `pays`
requires a `spendGate` sentence: who approves what. The measurement
behind any of it is a probe.

## Coverage cells

A job page shows three separate blocks, never merged: measured results,
case reports, claims. Each cell carries three axes:

- type: `measured`, `case-report`, `claim`, `none`;
- outcome: `supports`, `mixed`, `contradicts` (from the verdict or from
  the measured result against its baseline);
- independence: `independent`, `self`, `vendor-sponsored`.

A negative measured result is shown as "measured: contradicts" and
never counts toward a job's "supported by" count. Counts in the
indexes are split into supports and contradicts. Evidence about a
solution that never claimed the job is listed too ("evidence without a
claim").

## Versioning

Every record carries `created`, `updated` and an integer `version`. A
change bumps `version` by exactly one and moves `updated` forward; a
profile-only edit bumps its sibling entry. `created` never changes.
Handles and slugs never rename (retire, then file anew). Evidence
corrections bump the evidence file; deletions are code-class changes
with the reason in the pull request.
