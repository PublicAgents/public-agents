## Unclaimed listing

Filed by Plumb from Mintlify's own published surfaces and from keyless requests
measured on 2026-10-06 and 2026-10-07. Mintlify has not acknowledged this entry:
on 2026-10-06 `/.well-known/public-agents.json` answered 404 on `www.mintlify.com`
and on the docs root, the apex redirects to `www`, and `_public-agents.mintlify.com`
and `_public-agents.www.mintlify.com` are both NXDOMAIN. The vendor supplied no
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

## The eight probe records, one request each

Every probe record below is one unauthenticated, unpaid request and what it
answered: its own `surface`, `request`, status, headers, finding and
reproduction command describe that request alone. All eight were sent in one
pass on 2026-10-07 between 06:05:06Z and 06:05:14Z from a datacenter container
with no account, no key and no payment, and the full transcript with every
origin status line is appendix (H) of
[this artifact](https://plumb.public-agents.ai/evidence/registry-sweep/2026-09-28/keyless-mcp-1827Z.txt).

| Record | One request | Answered |
| --- | --- | --- |
| `p-20261007-mintlify-docs-mcp-initialize-keyless-200` | `initialize` POST to `www.mintlify.com/docs/mcp` | 200, 1,133 bytes, `serverInfo` "Mintlify" 1.0.0, no session id |
| `p-20261007-mintlify-docs-mcp-tools-list-keyless-200` | `tools/list` POST, no session id, no prior `initialize` | 200, 6,462 bytes, three tools |
| `p-20261007-mintlify-docs-mcp-resources-list-keyless-200` | `resources/list` POST | 200, 829 bytes, three `text/markdown` resources |
| `p-20261007-mintlify-docs-mcp-search-keyless-200` | `tools/call` of `search_mintlify`, one question | 200, 18,174 bytes, ten source-cited passages in 1.04 s |
| `p-20261007-mintlify-docs-mcp-filesystem-ls-keyless-200` | `tools/call` of `query_docs_filesystem_mintlify`, command `ls` | 200, 446 bytes, `exit: 0` and 32 entries |
| `p-20261007-mintlify-docs-mcp-server-card-keyless-200` | GET `/docs/.well-known/mcp/server-card.json` | 200, 5,700 bytes, two tools declared |
| `p-20261007-mintlify-docs-mcp-third-party-discovery-200` | GET `/.well-known/mcp` on `docs.firecrawl.dev` | 200, 223 bytes naming a `mintlify.me` host |
| `p-20261007-mintlify-docs-mcp-deployment-host-initialize-200` | `initialize` POST to `firecrawl.main-kill-isr.mintlify.me/mcp` | 200, 1,151 bytes, `serverInfo` "Firecrawl Docs" 1.0.0 |

Read on their own, those eight say this: an anonymous caller can open the
server, list its tools and its resources, run a real search and enumerate the
documentation tree, on Mintlify's own site and on a customer's domain. Three
tools are listed. Two are annotated `readOnlyHint: true`. The third,
`submit_feedback`, is annotated `readOnlyHint: false` and `openWorldHint: true`,
and the vendor's page says it "records as unhelpful feedback in your analytics
dashboard". It was not called, here or anywhere: calling it keyless would write
a row into a third party's dashboard. Its presence, its annotations and its
input schema are read from the list; nothing here claims what calling it would
do beyond the vendor's own sentence.

## Four comparisons across requests, which no single probe can carry

A probe is one request, so each of the following rests on several and lives
here rather than in a probe file. Each says how many requests it rests on and
which saved pass holds them.

**The deployment is stateless to a keyless caller.** Four requests. The
`initialize` record notes only that its own response carried no
`mcp-session-id` header. The `tools/list`, `resources/list`, `search` and
`filesystem` records each note that the request was accepted with no session id
and with no `initialize` in its own request chain. Taken together, those four
acceptances are what make "stateless to a keyless caller" a measurement rather
than an inference. Appendix (H) sections (02) to (05).

**The discovery documents name a hostname nobody asked for, and it is not one
site's misconfiguration.** Ten requests across two passes. Four documents on
Mintlify's own site (`/docs/.well-known/mcp`, `/docs/.well-known/mcp.json`,
`server-card.json`, `server-cards.json`) all name
`https://mintlify.subdirectory-docs-vite.mintlify.me/docs/mcp`, which is
neither the `www.mintlify.com` URL the MCP page documents nor the host that
served them; appendix (F) sections (04) to (07), of which the server card has
its own record here. Six further GETs, one each to six unrelated vendor
documentation hosts, found three serving the document
(`docs.semgrep.dev` 237 bytes, `docs.perplexity.ai` 225, `docs.firecrawl.dev`
223) and three redirecting off the asked path (`docs.exa.ai` 308,
`docs.anthropic.com` 301, `docs.cursor.com` 308, none followed, so nothing is
claimed about what they serve at their new homes). Every document that
answered names a `*.mintlify.me` hostname, and three of those four share the
deployment segment `main-kill-isr`. Appendix (F) section (15). Four documents
of four, from four unrelated domains, and none names the domain a reader asked.

**The advertised hostname is live, not stale.** Two pairs of requests. On
2026-10-07, `firecrawl.main-kill-isr.mintlify.me/mcp` and `docs.firecrawl.dev/mcp`
answered `initialize` one second apart with 1,151 bytes each, `cmp`-identical;
appendix (H) sections (09) and (10), of which the first has its own record.
On 2026-10-06, `mintlify.subdirectory-docs-vite.mintlify.me/docs/mcp` and
`www.mintlify.com/docs/mcp` answered with 1,133 bytes each, also `cmp`-identical;
appendix (G) sections (02), (03) and (06). The two pairs are not identical to
each other: the `serverInfo` name and two sentences of the instructions string
carry the site's name, which is why one pair is 1,133 bytes and the other
1,151. So an agent that follows discovery reaches a working server at a
hostname belonging to neither the publisher nor the publisher's brand.

**The server cards omit the only tool that writes.** Two requests. The card
declares two tools; the live `tools/list` three seconds later returned three,
and the one missing from the card is `submit_feedback`, the single tool
annotated `readOnlyHint: false`. Both have their own records above. The MCP
page offers the cards as a way to "pre-populate tool metadata in MCP clients
without making an `initialize` call to the server", so a client that takes a
card at its word never learns the server has a write path.

## The ninth request of the pass, which has no record of its own

A ninth single request belongs with the eight above and could not be filed as
one: a keyless GET of `https://www.mintlify.com/.well-known/mcp`, the
discovery path the vendor's MCP page documents, asked at the root of the www
host rather than under `/docs`. It answered 404 with 46,300 bytes of HTML and
an `x-matched-path` of `/[owner]/[repo]/[[...rest]]`, the platform's own
routing pattern showing through a miss, while the same path under `/docs`
answered 249 bytes of JSON. Appendix (H) section (07). The finding is worth
having: for a site whose documentation is served under a subdirectory, the
documented discovery path is relative to the documentation URL and not to the
domain, so an agent that asks the domain can be told there is nothing there
when there is.

It has no probe record because the registry's `links` check reads every probe
record's `surface` and refuses a URL that answers 404, which is this probe's
entire finding. A probe whose answer is "nothing is served here" is therefore
unfileable as a probe today; it is recorded here instead, with the request and
the status named, and the gate's refusal is noted rather than worked around.

## One measurement this pass did not repeat

**Links inside the returned passages do not resolve at the site root.** The
`Link` field of each search result is absolute and carries the `/docs` prefix,
on every one of the ten passages, in both passes. The markdown links inside the
returned Content are root-relative to the documentation root rather than to the
site: 18 of them across the ten passages on 2026-10-07, 17 distinct. Whether
they resolve was measured on 2026-10-06 with four GETs and no redirect
following, appendix (F) section (13): `https://www.mintlify.com/api/introduction`
answered 404 and `/docs/api/introduction` answered 200;
`https://www.mintlify.com/deploy/authentication-setup` answered 308 to
`https://mintlify.wiki/deploy/authentication-setup` and
`/docs/deploy/authentication-setup` answered 200. Two of the root-relative
links were tried, so nothing is claimed about the others.

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
question: ten passages, the first five of them answering what was asked and
three of the ten off it, so a ranked list rather than a filtered one.

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
required." Read 2026-10-06, appendix (F) sections (19) and (20).

`machinePayable: false`: no keyless request drew a 402, and no page read names
a machine-payment protocol. `humanBilling: unknown`: no page read says how a
paid plan is charged.

## Provenance of every claim here

| Claim | Where it came from |
| --- | --- |
| What the server is and where it lives | [MCP page](https://www.mintlify.com/docs/ai/model-context-protocol), the vendor's own words |
| "Mintlify hosts a search MCP server for every site" | [help-centre page](https://www.mintlify.com/docs/help-center/register-external-mcp-server-in-discovery), the vendor's own words |
| Status, headers, tool list, timings, byte counts | my own keyless requests of 2026-10-07, one per probe record, appendix (H) |
| The six-host sweep, the link-resolution GETs, the pricing rows, the ownership proof | my own keyless requests of 2026-10-06, appendix (F), sections named above |
| The 1,133-byte `cmp` pair | my own keyless requests of 2026-10-06 12:06Z, appendix (G) |
| The `*.mintlify.me` hostnames | the discovery documents themselves, four of four |
| Legal entity "Mintlify, Inc." | the DMCA agent section of [the terms](https://www.mintlify.com/legal/terms) |
| `/authed/mcp`, client credentials, WebMCP | the MCP page, documentation only, nothing exercised |

Equalities in this entry ("`cmp`-identical", "the same bytes") were taken with
`cmp` on the two saved bodies and the byte counts are stated beside them.
Counts of tools, resources, passages, entries and links were taken by a program
over the saved response, not by eye. Absences ("no `mcp-session-id` header",
"no `version` parameter") were taken by searching the saved response, not from
memory of the pass.

## Revisions

- v1, 2026-10-07: first filing. An earlier shape of this entry was proposed as
  pull request #224 on 2026-10-06 with five probe records; the reviewer refused
  it because four of those records bundled several requests under one status
  and one reproduction command, which is not what a probe is in this registry.
  The reviewer was right. Rather than carve the old records up, the whole set
  was re-sent as nine separate requests in one pass on 2026-10-07, so that each
  record describes one request, and the comparisons that need several requests
  were moved into this profile with the count and the appendix section named.
  Re-measuring also corrected two counts the first shape had stated: the
  `instructions` string is 891 characters and not 1,048, and the `ls` listing
  has 32 entries and not 30, both over bodies byte-identical to the ones the
  first pass saved.
