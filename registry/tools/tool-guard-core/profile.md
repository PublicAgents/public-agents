This is an unclaimed listing: DIMAGGI AI did not write it, and nothing here is verified by the vendor. It records what the project's own public repository and site say, and what the GitHub API reported, read on 2026-11-20.

Tool Guard Core is the open-source decision engine of DIMAGGI AI's Tool Guard product. Its [repository README](https://github.com/dimaggi-ai/tool-guard-core) calls it "The policy decision point for AI agents." and states the license as Apache-2.0; the GitHub API returns the same SPDX id for the repository, created 2026-06-09, with v0.8.1 the latest release (2026-10-17). It governs what an agent does rather than what a model says: a proposed tool call is evaluated against policy before the call runs, and the engine returns a decision.

## The surface an agent reaches

The README describes the call shape: a tool call goes to `POST /evaluate` as a JSON `ActionEnvelope`, or to the Go library in-process, and the engine returns "allow / deny / escalate", the rule that fired and the reason. The same repository ships three agent-facing ways to reach that decision: the `/evaluate` HTTP service (the `tg-proxy` binary), the Go library in-process, and, under `examples/mcp-server/`, a "stdio JSON-RPC 2.0 server that exposes gated tools to any MCP client" whose every `tools/call` goes through `tg-proxy` `/evaluate`. A command-line `tg evaluate` runs a single call against a policy file and exits with a code that encodes the verdict ("3 deny, 4 escalate"). The README states the repository is self-contained: "This repo is the complete engine" and "Nothing in it is gated."

Because Core is self-hosted, there is no vendor-hosted endpoint to probe: the `/evaluate` service runs wherever the operator deploys the binary or the `ghcr.io` container. The first-hand evidence here is the public, Apache-2.0 source and its documentation, not a live hosted call.

## Why it claims it.review-agent-tool-actions, and where the claim stops

The job asks that a high-risk agent tool action receive a policy decision before it can change systems, with allowed actions proceeding and others denied or sent for a human decision. That is what `/evaluate` returns: a per-call verdict of allow, deny, or escalate, before execution. The README: "Every envelope is evaluated against operator-authored YAML policies: deterministic rules (thresholds, regex, scope, condition trees)" plus six semantic classifiers (SQL, path, shell, write, HTTP, and an optional LLM content classifier that runs either a local Gemma model via Ollama or a networked TypeSafe System One model). An escalate verdict is the job's "human decision" path: the shipped reference policy escalates any action its reversibility classifier marks `irreversible` or `unknown` to a human reviewer.

Two limits keep the claim bounded, and both are the kind the job definition itself names.

First, Core decides; it does not enforce. The README is explicit: "Core decides and records; your tool-execution layer enforces." The engine returns a verdict and appends an audit record; nothing in Core stops a caller that ignores a `deny`. This is exactly the job's own caveat that "a review record alone is not proof that an action was blocked": coverage depends on the integration passing every risky call through `/evaluate` and honoring the answer. The commercial Tool Guard Enterprise edition is what closes that gap (see below), and it is not in this repository.

Second, the policy is operator-authored, which is where this sits relative to a model-scored guard; the verdict, though, is not always independent of a model. The rules an operator writes can include an `llm_classify` condition: a semantic classifier assigns the call's prompt to a forbidden label or `safe`, and any non-`safe` result fires the rule. That classifier has two operator-selected backends, a local Gemma 4 model via Ollama or a networked TypeSafe System One model (Jev by default, text-only) reached at a `TYPESAFE_BASE_URL` endpoint (default `https://api.typesafe.ai`), both fail-closed when confidence is below a fixed 0.6 floor. So a model classification can be the condition a rule fires on. The useful contrast with a model-scored guard such as MCP Guard is therefore not deterministic versus probabilistic: MCP Guard's own verdict is a model sharpened by a small fixed rule set, and Core's policy can invoke a model too. The distinction is who authors the rules. Core evaluates a policy the operator writes and configures, including whether to use a model condition at all and which backend; MCP Guard applies a vendor-set mechanism the caller does not author.

## Core versus Enterprise: decide versus enforce

The README draws the line itself. Core is "the decision point"; **Tool Guard Enterprise** is "the enforcement point: an MCP gateway your agents connect to as their single access point", which "fronts your MCP servers and tools, calls this engine on every tool call, forwards allowed calls upstream and blocks denied ones", described as "enforcement the agent cannot route around". The decision engine, the classifiers and the audit primitive "live in this repo under Apache-2.0 with no usage limits; Enterprise consumes them". So the enforcement gateway, the management dashboard, per-agent identity and RBAC, and schema-driven PII redaction are the commercial product; the decision and the audit log are the open-source part filed here.

## Access and ownership

Reaching the decision needs no vendor account: an operator runs the binary or the container and calls `/evaluate`, so `noAccountNeeded` is true and `auth` is none at the vendor boundary (how the operator protects their own deployment is their choice). No `/.well-known/public-agents.json` was served at the homepage (404 on 2026-11-20), so provenance is third-party and this entry is unverified, in those words, until the domain acknowledges it.

## Pricing

Tool Guard Core is free: Apache-2.0 open source, which the README states carries "no usage limits" and that "Nothing in it is gated." There is no billing for Core. Tool Guard Enterprise is a separate commercial, self-hosted product (the enforcement gateway plus a management plane); the site routes it through a sales contact and does not publish a price. It is not machine-payable: there is no agent-settled payment path.

## Measures

All of the job's measures are empty. No third-party figure for the share of risky actions checked, unauthorized actions executed, false-positive reviews, or time to a human decision was found. The README's claim that the engine decides "in microseconds" is the project's own statement of per-call latency, not a third-party measurement, and in any case the job's latency measure asks how quickly actions needing human approval are resolved, which is a workflow time, not the engine's evaluation time. The repository ships a `tg coverage` command that "measures what fraction of an agent's tool calls have any governing policy", but no measured result is published here.
