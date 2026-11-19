This is an unclaimed listing: MCP Guard did not write it, and nothing here is verified by the vendor. It records what the vendor's own public pages say and what a keyless probe of its endpoint returned on 2026-11-19.

MCP Guard (mcp-guard.ai) is a hosted service that checks a single proposed AI-agent tool call before it runs and returns a verdict. Its [llms.txt](https://mcp-guard.ai/llms.txt) describes it as a service that "checks an AI agent's tool call before it runs and returns a verdict (allow / ask / block) plus calibrated scores for nine questions (safe, violation, severity, destructive, exfiltration, injected, approval_policy, blast_radius, args_grounded), from one forward pass of a small model." The same file names the model: "DeBERTa-v3-base (184M parameters) fine-tuned on ~31k labelled agent actions". The vendor adds a caution in its own words: "It reduces risk; it does not guarantee safety."

## The surface an agent reaches

MCP Guard is itself agent-accessible. It runs a first-party MCP server at `https://api.mcp-guard.ai/mcp` (Streamable HTTP), and the [MCP server page](https://mcp-guard.ai/docs/mcp) frames it as a tool the agent calls: "Give any MCP client the guard as a tool: it can check an action before running it, or check every call a script is about to make." That page lists three tools: `guard_check` (one credit), `guard_batch` (one credit per check, up to 64 per request), and `usage` (free). The core tool's job is stated plainly: "Judge a tool call BEFORE executing it. Returns verdict (allow / ask / block), p_unsafe, reasons, and calibrated scores for nine questions". The same facility is also a REST endpoint (`POST /v1/guard`, `POST /v1/guard/batch`, `GET /v1/usage`), per the llms.txt.

## Why it claims it.review-agent-tool-actions, and where the claim stops

The job asks that a high-risk agent tool action receive a policy decision before it can change systems, with allowed actions proceeding and others denied or sent for a human decision. That is exactly what `guard_check` returns: a per-call verdict of allow, ask, or block, before execution. The docs map the three verdicts onto the job's three outcomes: "Run the action on allow, ask the user on ask, never run it on block; if the check fails, treat the action as ask." So the claim rests on the vendor's documented pre-execution verdict.

Two limits keep the claim bounded, and both are the kind the job definition itself names.

First, MCP Guard decides; it does not enforce. It returns a verdict, and the calling agent or harness has to honor it ("never run it on block"). Nothing in the surface stops a caller that ignores a block. The job warns that "a review record alone is not proof that an action was blocked", and that applies here: coverage depends entirely on the integration passing every risky call through the guard and obeying the answer.

Second, the decision is a model's risk prediction, not a configured permission ruleset. Unlike a rule engine where an administrator writes the policy an action is checked against, MCP Guard scores a call with a fine-tuned classifier and derives a verdict from thresholds on those scores. A caller can pass optional `constraints` and an intent, but the judgment is probabilistic, not a lookup against a declared permission set. That is a different mechanism from the gateway and policy-engine products in the same space, and it is worth stating so a reader does not assume rule-based enforcement.

## The vendor's own accuracy claim, recorded as a claim

MCP Guard publishes an evaluation of itself, and it is the vendor's own measurement, not a third party's. The llms.txt reports "AUROC 0.855 on R-Judge (held-out test half, 304 trajectories) vs 0.824 for saroku-guard; the difference is not yet statistically significant". R-Judge is a public agent-safety benchmark; the comparison figure is attributed to another guard. This is the vendor asserting its own effectiveness on a named benchmark, with its own caveat that the margin is not yet significant. It is recorded here as a vendor claim. It does not fill any of the job's measures, which ask about operational coverage and error rates in deployment, not a benchmark AUROC.

## Access and ownership

Reaching the guard needs an API key from the dashboard, which needs an account, so `noAccountNeeded` is false. A keyless `POST initialize` to `https://api.mcp-guard.ai/mcp` on 2026-11-19 returned HTTP 401 with `WWW-Authenticate: Bearer realm="MCP Guard", error="invalid_token"` and a JSON-RPC body `-32001` with `code "missing_api_key"`, instructing the caller to send `Authorization: Bearer mcpg_live_...`; the docs say the `x-api-key` header works too. That is first-hand evidence that the endpoint exists and gates on a bearer key. No `/.well-known/public-agents.json` was served at the homepage (404 on 2026-11-19), so provenance is third-party and this entry is unverified, in those words, until the domain acknowledges it.

## Pricing

MCP Guard is freemium with a one-time free grant rather than a recurring free tier. The [pricing page](https://mcp-guard.ai/pricing) lists "$0.20 per 1,000 checks" and says "One check is one tool call judged on all nine questions." Every new workspace gets 1,000 free requests, which is enough to use the guard before any payment; that grant is one-time, not renewing. Beyond it, a buyer can purchase credit packs ($5, $25, $100) or subscribe to a monthly plan (Starter $19, Pro $99, Scale $399), and failed calls are never billed. Payment is through Stripe: the [terms](https://mcp-guard.ai/terms) say "Payments are processed by Stripe under its own terms." So `methods` is card and `humanBilling` is prepaid-credits. It is not machine-payable: there is no documented agent-settled payment path, only a human buying credits. Consumers in the EU, EEA and UK have a 14-day withdrawal right, and purchased credits are otherwise non-refundable.

## Hosting and data

The llms.txt states that "request payloads are not stored; request metadata kept 30 days", and that inference runs on GPUs in Switzerland with EU failover. This is relevant to anyone routing tool-call arguments, which can carry sensitive data, through a third party for a verdict. It is the vendor's statement, not verified here.

## Measures

All of the job's measures are empty. No third-party figure for the share of risky actions checked, unauthorized actions executed, false-positive rate, or decision latency in a real deployment was found. The vendor's AUROC and its self-reported latency (about 15 ms per check on an RTX 4090) are its own numbers and are recorded above as claims, not as measures of the job.
