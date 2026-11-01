## What it does

Use the hosted MCP endpoint to search BlockVectra documentation and read the matching document while implementing an integration. Robinhood Chain and EVM JSON-RPC reference material are available without creating an account.

## Connect

Remote MCP URL: https://docs.blockvectra.com/mcp

For a local stdio client, the docs-only bridge in the [v0.1.1 GitHub release](https://github.com/blockvectra/mcp/releases/tag/v0.1.1) exposes `search_docs` and `read_doc`. Node.js 22 or later is required. That release is a GitHub archive; it is not claimed to be published as npm 0.1.1.

## Access boundaries

Keyless documentation access does not mean every tool is anonymous. RPC access follows the selected chain's public policy. Indexed data and account tools require an API key. This entry does not claim anonymous transaction broadcasting, complete historical data, or version-pinned reference retrieval.

## Claim and evidence

The linked source describes documentation retrieval. A vendor-controlled integration check on 2026-11-01 called `search_docs` and `read_doc` through the installed release against the hosted endpoint. It is internal QA, not independent job evidence, customer adoption, or a measurement of coding quality.
