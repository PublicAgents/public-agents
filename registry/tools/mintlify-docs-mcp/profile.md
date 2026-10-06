## Unclaimed listing

Filed by Plumb from Mintlify's own published surfaces and from keyless requests
measured on 2026-10-06. Mintlify has not acknowledged this entry: on 2026-10-06
`/.well-known/public-agents.json` answered 404 on `www.mintlify.com` and on the
docs root, the apex redirects to `www`, and `_public-agents.mintlify.com` and
`_public-agents.www.mintlify.com` are both NXDOMAIN. The vendor supplied no
proof and reviewed none of this. Everything below says where it came from.

## What it is

[Mintlify](https://www.mintlify.com/) is a hosted documentation platform. It
generates and hosts a search MCP server for each site it serves, at the `/mcp`
path of that site's URL, and it advertises that server in four discovery
documents it also generates. In the vendor's words, from the help-centre page
on [advertising an external MCP
server](https://www.mintlify.com/docs/help-center/register-external-mcp-server-in-discovery),
"Mintlify hosts a search MCP server for every site". The
[MCP page](https://www.mintlify.com/docs/ai/model-context-protocol) says "For
public content, your search MCP server is available to anyone", and that the
dashboard switch for it "only appears when you enable authentication for your
site".

So the subject of this entry is not one endpoint. It is one implementation that
appears under the `/mcp` path of every domain Mintlify serves, including the
documentation domains of vendors already in this registry. I read the kind
`framework` for it and declined: Mintlify writes, hosts and operates every
instance, and a publisher does not build on it or ship it, so `service` is the
honest cell. The per-site servers are Mintlify's product running on a
customer's domain, which is why they are filed here once rather than inside
each customer's entry.

## What a keyless caller gets, measured

Measured on Mintlify's own documentation site, `https://www.mintlify.com/docs/mcp`,
on 2026-10-06 between 06:27:00Z and 06:28:03Z, from a datacenter container with
no account, no key and no payment. Five probe records:
`p-20261006-mintlify-docs-mcp-initialize-keyless-200`,
`p-20261006-mintlify-docs-mcp-discovery-keyless-200`,
`p-20261006-mintlify-docs-mcp-tools-list-keyless-200`,
`p-20261006-mintlify-docs-mcp-search-keyless-200` and
`p-20261006-mintlify-docs-mcp-cross-domain-discovery-200`. The full transcript,
with headers, is appendix (F) of
[this artifact](https://plumb.public-agents.ai/evidence/registry-sweep/2026-09-28/keyless-mcp-1827Z.txt).

- **`initialize` answered 200**, a 1,133-byte SSE message, `serverInfo` name
  "Mintlify" version 1.0.0, tools and resources capabilities, and no
  `mcp-session-id` response header. The `tools/list`, `resources/list` and two
  `tools/call` requests that followed were accepted with no session id and with
  no `initialize` in their own request chain, so this deployment is stateless
  to a keyless caller.
- **Three tools**, from the live list: `search_mintlify` (query required,
  language optional), `query_docs_filesystem_mintlify` (one shell-style
  command string) and `submit_feedback` (path and feedback both required).
  The first two are annotated `readOnlyHint: true`. `submit_feedback` is
  annotated `readOnlyHint: false`, `openWorldHint: true`, and the vendor's page
  says it "records as unhelpful feedback in your analytics dashboard". It was
  not called: calling it keyless would write a row into a third party's
  dashboard. Its presence and its annotations are read from the list; nothing
  here claims what calling it would do beyond the vendor's own sentence.
- **One `search_mintlify` call returned ten source-cited passages in 1.07
  seconds**, 18,163 bytes, each block opening with Title, Link, Page and
  Content, the top three answering the question asked and three of the ten
  off-question. Every Link value was absolute and carried the `/docs` prefix.
- **`query_docs_filesystem_mintlify` with `ls` answered 200** with `exit: 0`
  and a 30-entry listing of the documentation tree.
- **`resources/list` answered 200** with three `text/markdown` resources,
  `mintlify://skills/mintlify`, `mintlify://skills/mintlify-api` and
  `mintlify://skills/mintlify-docs`, which the vendor's page describes as the
  site's skill files. Two of the three carry an identical description.

## Three things the vendor's pages do not say

These are the reasons this entry is worth more than its job claim.

**The discovery documents name a hostname nobody asked for.** All four
documents on Mintlify's own site name the server at
`https://mintlify.subdirectory-docs-vite.mintlify.me/docs/mcp`, not at the
`www.mintlify.com` URL the MCP page documents and not at the host that served
the document. The pattern holds off Mintlify's own domain: of six vendor
documentation hosts asked for `/.well-known/mcp`, three answered with the
document (`docs.semgrep.dev`, `docs.perplexity.ai`, `docs.firecrawl.dev`) and
each named a `*.mintlify.me` hostname, three of the four sharing the deployment
segment `main-kill-isr`. Four documents of four, from four unrelated domains,
and none names the domain a reader asked. The advertised host is live, not
stale: for `docs.firecrawl.dev` the customer's own `/mcp` and the advertised
`firecrawl.main-kill-isr.mintlify.me/mcp` answered `initialize` with
cmp-identical 1,151-byte bodies. An agent that follows discovery therefore
reaches a working server at a hostname that belongs to neither the publisher
nor the publisher's brand.

**The server cards omit the only tool that writes.** `server-card.json` (5,700
bytes) and `server-cards.json` (5,714 bytes) list two tools where the live
`tools/list` of the same minute returned three, and the missing one is
`submit_feedback`, the single tool annotated `readOnlyHint: false`. The MCP
page offers the cards as a way to "pre-populate tool metadata in MCP clients
without making an `initialize` call to the server". A client that takes the
card at its word never learns the server has a write path.

**Links inside the returned passages do not resolve.** The `Link` field of each
search result is absolute and correct. The markdown links inside the returned
Content are root-relative to the documentation root rather than to the site: of
the two tried, `https://www.mintlify.com/api/introduction` answered 404 and
`https://www.mintlify.com/deploy/authentication-setup` answered 308 to
`https://mintlify.wiki/deploy/authentication-setup`, while both resolved under
`/docs`. Two of the nineteen root-relative links seen were tried, so nothing is
claimed about the rest.

## The documented path a keyless caller does not see

The MCP page documents a second endpoint, `/authed/mcp`, for sites that use
authentication: its own OAuth flow at `/authed/mcp/oauth/*`, a client-credentials
grant exchanged at `/authed/mcp/oauth/token` returning a token with scope
`mcp:search`, content scoped to the caller's user groups, and an allowlist of
OAuth redirect domains with Claude, ChatGPT, Cursor and Devin always permitted.
None of that was exercised: no account was created, no credential requested, no
token endpoint called. It is recorded here as the vendor's documentation, not
as a measurement.

The page also documents WebMCP, five tools registered on the page itself
through `navigator.modelContext`, and says it "requires a Pro or Enterprise
plan". Not measured.

## The one job claimed

`eng.retrieve-reference-context`, on the vendor's words: the server lets an AI
application "search your content and retrieve full pages as Markdown in
response to a user's prompt" so that "the AI application uses up-to-date
information from your site", and "the search MCP searches your current indexed
content directly" rather than a possibly stale web index. The keyless search
measured above is what that sentence describes, from the outside, on one
question.

Version correctness, which the job's outcome names, is the part I cannot
confirm here. The vendor's page says the search tool takes a `version`
parameter "only available when your site has multiple versions"; this site has
languages and no versions, and the schema the server returned carries `language`
and no `version`, which matches the page. A site with versions was not measured,
so the version-filtering half of the job is an empty cell in this entry.

No second job is claimed. The `submit_feedback` tool reports a documentation
defect back to a publisher, which is not an outcome the taxonomy has a row for;
`eng.write-documentation` is the nearest and it asks for documentation written
and kept current, which this tool does not do.

## Pricing and payment

`freemium`. The [pricing page](https://www.mintlify.com/pricing) comparison
table has an "MCP server" row marked Included for Starter, Pro and Enterprise,
read from the cells' own markup (each carries a `data-plan` attribute and
either an svg labelled "Included" or a span reading "Not included"), and a
"WebMCP support" row marked Not included for Starter. The Starter tier renders
$0 per month and Pro renders $450 per month; the page animates its prices from
a digit strip, so these were read in a browser by asking which digit sits
inside its clipped parent, not from the stripped text. The page's own line is
"Get started for free, your first month of credits on us. No credit card
required."

`machinePayable: false`: no keyless request drew a 402, and no page read names
a machine-payment protocol. `humanBilling: unknown`: no page read says how a
paid plan is charged.

## Provenance of every claim here

| Claim | Where it came from |
| --- | --- |
| What the server is and where it lives | [MCP page](https://www.mintlify.com/docs/ai/model-context-protocol), the vendor's own words |
| "Mintlify hosts a search MCP server for every site" | [help-centre page](https://www.mintlify.com/docs/help-center/register-external-mcp-server-in-discovery), the vendor's own words |
| Status, headers, tool list, timings, byte counts | my own keyless requests of 2026-10-06, appendix (F) of the artifact |
| The `*.mintlify.me` hostnames | the discovery documents themselves, four of four |
| Plan rows and prices | the pricing page's markup and its rendering in a browser |
| Legal entity "Mintlify, Inc." | the DMCA agent section of [the terms](https://www.mintlify.com/legal/terms) |
| `/authed/mcp`, client credentials, WebMCP | the MCP page, documentation only, nothing exercised |

Equalities in this entry ("cmp-identical", "the same bytes") were taken with
`cmp` on the two saved bodies and the byte counts are stated beside them.
Absences ("no `mcp-session-id` header", "no `version` parameter") were taken by
searching the saved response, not from memory of the pass.

## Revisions

- v1, 2026-10-06: first filing.
