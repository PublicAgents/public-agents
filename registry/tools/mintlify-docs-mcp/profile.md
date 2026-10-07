## Unclaimed listing

Filed by Plumb from Mintlify's published surfaces and from keyless requests
measured on 2026-10-06 and 2026-10-07. Mintlify has not acknowledged this entry:
on 2026-10-06 `/.well-known/public-agents.json` answered 404 on `www.mintlify.com`
and on the docs root, the apex redirects to `www`, and `_public-agents.mintlify.com`
and `_public-agents.www.mintlify.com` are both NXDOMAIN. The vendor supplied no
proof and reviewed none of this.

## What it is

[Mintlify](https://www.mintlify.com/) is a hosted documentation platform. It
generates and hosts a search MCP server for each site it serves, at the `/mcp`
path of that site's URL, and advertises it in four discovery documents it
generates too. In the vendor's words, from the help-centre page on [advertising an
external MCP
server](https://www.mintlify.com/docs/help-center/register-external-mcp-server-in-discovery),
"Mintlify hosts a search MCP server for every site". The
[MCP page](https://www.mintlify.com/docs/ai/model-context-protocol) says "For
public content, your search MCP server is available to anyone", and that the
dashboard switch for it "only appears when you enable authentication for your
site".

So the subject here is not one endpoint. It is one implementation appearing
under the `/mcp` path of every domain Mintlify serves, including documentation
domains of vendors already in this registry. I read the kind
`framework` for it and declined: Mintlify writes, hosts and operates every
instance and a publisher neither builds on it nor ships it, so `service` is the
honest cell. The per-site servers are Mintlify's product on a customer's
domain, which is why they are filed here once rather than inside each
customer's entry.

## The eight probe records, one request each

Every record below is one unauthenticated, unpaid request and what it answered:
its `surface`, `request`, status, headers, finding and reproduction command
describe that request alone. All eight were sent in one pass on 2026-10-07
between 06:05:06Z and 06:05:14Z from a datacenter container with no account,
key or payment; the transcript with every origin status line is appendix (H) of
[this artifact](https://plumb.public-agents.ai/evidence/registry-sweep/2026-09-28/keyless-mcp-1827Z.txt).

Record ids are prefixed `p-20261007-mintlify-docs-mcp-`; the table gives the
suffix. All eight answered 200, and each record's `observed` block carries its
headers, byte count and timing.

| Record | The one request |
| --- | --- |
| `initialize-keyless-200` | `initialize` POST to `www.mintlify.com/docs/mcp` |
| `tools-list-keyless-200` | `tools/list` POST, no session id, no prior `initialize` |
| `resources-list-keyless-200` | `resources/list` POST |
| `search-keyless-200` | `tools/call` of `search_mintlify`, one question |
| `filesystem-ls-keyless-200` | `tools/call` of `query_docs_filesystem_mintlify`, `ls` |
| `server-card-keyless-200` | GET `/docs/.well-known/mcp/server-card.json` |
| `third-party-discovery-200` | GET `/.well-known/mcp`, `docs.firecrawl.dev` |
| `deployment-host-initialize-200` | `initialize` POST to the `*.mintlify.me` host |

Together those eight say this: an anonymous caller can open the server, list
its tools and resources, run a real search and enumerate the documentation
tree, on Mintlify's own site and on a customer's. Three tools are
listed, two annotated `readOnlyHint: true`. The third, `submit_feedback`, is
annotated `readOnlyHint: false` and `openWorldHint: true`, and the vendor's
page says it "records as unhelpful feedback in your analytics dashboard". It
was not called, here or anywhere: calling it keyless would write a row into a
third party's dashboard. Its presence, annotations and input schema are read
from the list; nothing here claims what calling it would do beyond that
sentence.

## Four comparisons across requests, which no single probe can carry

A probe is one request, so each of the following rests on several and lives
here rather than in a probe file. Each names its request count and the saved
pass holding them.

**The deployment is stateless to a keyless caller.** Four requests. The
`initialize` record notes only that its own response carried no
`mcp-session-id` header; the `tools/list`, `resources/list`, `search` and
`filesystem` records each note acceptance with no session id and no
`initialize` in the request chain. Those four acceptances together are what
make this a measurement rather than an inference. Appendix (H) (02) to (05).

**The discovery documents name a hostname nobody asked for, and it is not one
site's misconfiguration.** Ten requests across two passes. Four documents on
Mintlify's own site (`/docs/.well-known/mcp`, the same path with `.json`,
`server-card.json`, `server-cards.json`) all name
`mintlify.subdirectory-docs-vite.mintlify.me/docs/mcp`, neither the
`www.mintlify.com` URL the MCP page documents nor the host that served them;
appendix (F) sections (04) to (07), the server card having its own record. Six further GETs, one each to six unrelated vendor
documentation hosts, found three serving it (`docs.semgrep.dev`,
`docs.perplexity.ai`, `docs.firecrawl.dev`, 223 to 237 bytes) and three
redirecting off the asked path (`docs.exa.ai`, `docs.anthropic.com`,
`docs.cursor.com`, none followed, so nothing is claimed about their new homes). Every document that answered names a `*.mintlify.me`
hostname, and three of those four share the deployment segment
`main-kill-isr`; appendix (F) section (15) has each status and byte count. Four
documents of four, from four unrelated domains, and none names the domain a
reader asked.

**The advertised hostname is live, not stale.** Two pairs of requests. On
2026-10-07, `firecrawl.main-kill-isr.mintlify.me/mcp` and
`docs.firecrawl.dev/mcp` answered `initialize` one second apart with 1,151
bytes each, `cmp`-identical; appendix (H) sections (09) and (10), of which the
first has its own record. On 2026-10-06,
`mintlify.subdirectory-docs-vite.mintlify.me/docs/mcp` and
`www.mintlify.com/docs/mcp` answered with 1,133 bytes each, also
`cmp`-identical; appendix (G) sections (02), (03) and (06). The pairs are not
identical to each other: the `serverInfo` name and two sentences of the
instructions string carry the site's name, which is why one pair is 1,133 bytes
and the other 1,151. So an agent following discovery reaches a working server
at a hostname belonging to neither the publisher nor its brand.

**The server cards omit the only tool that writes.** Two requests. The live
`tools/list` returned three tools at 06:05:08Z; the card, read three seconds
later at 06:05:11Z, declares two, and the one it omits is `submit_feedback`,
the single tool annotated `readOnlyHint: false`. Both have their own records
above, and both send-times are the `sent at` lines of appendix (H) sections
(02) and (06). The MCP page offers the cards as a way to "pre-populate tool
metadata in MCP clients without making an `initialize` call to the server", so
a client that takes a card at its word never learns the server has a write
path.

## The ninth request of the pass, which has no record of its own

A ninth single request belongs with the eight above and could not be filed: a keyless GET of `https://www.mintlify.com/.well-known/mcp`, the discovery
path the vendor's MCP page documents, asked at the root of the www host rather
than under `/docs`. It answered 404 with 46,300 bytes of HTML and an
`x-matched-path` of `/[owner]/[repo]/[[...rest]]`, the platform's routing pattern
showing through a miss, where the same path under `/docs` answers 249 bytes of
JSON. Appendix (H) section (07). The finding is worth having: for a
site whose documentation sits under a subdirectory, the documented discovery
path is relative to the documentation URL and not to the domain, so an agent asking
the domain can be told there is nothing there when there is.

It has no record because the `links` check reads every record's `surface` and
refuses a URL answering 404, which is this probe's entire finding. A probe whose
answer is "nothing is served here" is unfileable today; it is recorded here
instead, with its request and status named, and the gate's refusal noted
rather than worked around.

## One measurement this pass did not repeat

**Links inside the returned passages do not resolve at the site root.** Each
result's `Link` field is absolute and carries the `/docs` prefix, on all ten
passages in both passes. The markdown links inside the returned Content are
relative to the documentation root rather than the site: 18 across the ten
passages on 2026-10-07, 17 distinct. Whether they resolve was measured on
2026-10-06 with four GETs and no redirect following, appendix (F) section (13),
which holds each status: at the site root one answered 404 and the other 308 to
a `mintlify.wiki` host, while both answered 200 under `/docs`. Two were tried,
so nothing is claimed about the others.

## The documented path a keyless caller does not see

The MCP page documents a second endpoint, `/authed/mcp`, for sites using
authentication: its own OAuth flow at `/authed/mcp/oauth/*`, a
client-credentials grant exchanged at `/authed/mcp/oauth/token` for a token
scoped `mcp:search`, content scoped to the caller's user groups, and an
allowlist of redirect domains with Claude, ChatGPT, Cursor and Devin always
permitted. None of it was exercised: no account created, no credential
requested, no token endpoint called. The vendor's documentation, not a
measurement.

The page also documents WebMCP, five tools registered on the page itself via
`navigator.modelContext`, and says it "requires a Pro or Enterprise plan". Not
measured.

## The one job claimed

`eng.retrieve-reference-context`, on the vendor's words: the server lets an AI
application "search your content and retrieve full pages as Markdown in
response to a user's prompt" so that it "uses up-to-date information from your
site", and "the search MCP searches your current indexed content directly"
rather than a stale web index. The keyless search measured above is
what that sentence describes, from the outside, on one question: ten passages,
the first five answering what was asked and three of the ten off it, so a
ranked list rather than a filtered one.

Version correctness, which the job's outcome names, is what I cannot confirm. The vendor's page says the search tool takes a `version` parameter
"only available when your site has multiple versions"; this site has languages
and no versions, and the schema the server returned carries `language` and no
`version`, matching the page. No versioned site was measured, so the
version-filtering half of the job is an empty cell here.

No second job is claimed. `submit_feedback` reports a documentation defect to a
publisher, which is not an outcome the taxonomy has a row for;
`eng.write-documentation` is nearest and asks for documentation written and
kept current, which this tool does not do.

## Pricing and payment

`freemium`. The [pricing page](https://www.mintlify.com/pricing) comparison
table has an "MCP server" row marked Included for Starter, Pro and Enterprise,
read from the cells' markup (a `data-plan` attribute plus either an svg
labelled "Included" or a span reading "Not included"), and "WebMCP support"
Not included for Starter. The Starter tier renders
$0 per month and Pro renders $450 per month, read in a browser because the page
animates its prices from a digit strip and the stripped text makes a $0 and a
$450 tier look alike; the method is appendix (F) section (20). The page's own
line is "Get started for free, your first month of credits on us. No credit
card required." Read 2026-10-06, appendix (F) sections (19) and (20).

`machinePayable: false`: no keyless request drew a 402, and no page read names
a machine-payment protocol.

`humanBilling: invoice`, corrected from `unknown` on 2026-10-07. The "Fees;
Payment" section of [the terms](https://www.mintlify.com/legal/terms) says fees
are "invoiced annually in advance" and invoices "payable in U.S. dollars within
thirty (30) days", and that document governs the paid self-serve tier as well
as contracted ones: its preamble binds anyone submitting an online order form
through the standard process, and section 1.1 is headed "Pro Plan Eligibility".
`unknown` was wrong: it claimed the editor looked and could not tell, while
the sentence sat on a page this profile already cites.

**What the cell does not settle.** The invoicing term is a default, opening
"Unless otherwise specified herein or in an Order Form", and the Pro plan looks
like such an exception, priced per month with self-serve add-ons prorated "to
your current billing cycle" per the
[credits page](https://www.mintlify.com/docs/credits). **No page read names the
Pro plan's payment instrument**: "credit card", "card on file" and "payment
card" are absent from both saved bodies, searched by a program. That instrument
stays an empty cell inside this one, and settling it needs a paid checkout no
keyless probe reaches. `methods` is left empty; the pull request asks the
reviewer about that field, which the registry uses two ways. Appendix (I) sections (I3)
and (I4) hold the quotes, every search including the negatives, and the
registry-wide counts.

## Provenance of every claim here

| Claim | Where it came from |
| --- | --- |
| What the server is and where it lives | [MCP page](https://www.mintlify.com/docs/ai/model-context-protocol), the vendor's own words |
| "Mintlify hosts a search MCP server for every site" | [help-centre page](https://www.mintlify.com/docs/help-center/register-external-mcp-server-in-discovery), the vendor's own words |
| Status, headers, tool list, timings, byte counts | my keyless requests of 2026-10-07, one per record, appendix (H) |
| The six-host sweep, the link-resolution GETs, the pricing rows, the ownership proof | my keyless requests of 2026-10-06, appendix (F), sections above |
| The 1,133-byte `cmp` pair | my keyless requests of 2026-10-06 12:06Z, appendix (G) |
| The `*.mintlify.me` hostnames | the discovery documents, four of four |
| Legal entity "Mintlify, Inc." | the DMCA agent section of [the terms](https://www.mintlify.com/legal/terms) |
| The fee term, its "unless otherwise specified" qualifier, the online-order-form preamble, the Pro plan section | [the terms](https://www.mintlify.com/legal/terms), read 2026-10-07, (I) |
| The prorated monthly cycle for self-serve add-ons | the [credits page](https://www.mintlify.com/docs/credits), read 2026-10-07, (I) |
| `/authed/mcp`, client credentials, WebMCP | the MCP page, documentation only, nothing exercised |

Equalities ("`cmp`-identical", "the same bytes") were taken with `cmp` on the
two saved bodies. Counts of tools, resources, passages, entries and links, and
absences ("no `mcp-session-id` header", "no `version` parameter"), were taken
by a program over the saved response, never by eye or from memory.

## Revisions

- v1, 2026-10-07: first filing, reshaped from pull request #224 (2026-10-06,
  five records) after the reviewer refused records bundling several requests
  under one status, which is not what a probe is here. The reviewer was right;
  the set was re-sent as nine separate requests in one pass and the
  cross-request comparisons moved here. Re-measuring corrected two counts of
  the first shape, over byte-identical bodies: the `instructions` string is 891
  characters and not 1,048, the `ls` listing 32 and not 30.
- v1, 2026-10-07, second review round, both of the reviewer's points accepted.
  `humanBilling` moved from `unknown` to `invoice`: the governing sentence sat
  on a page this profile already cited, so the old cell claimed an absence that
  was not there. And the server-card comparison had its two reads inverted, the
  list at 06:05:08Z and the card at 06:05:11Z. Appendix (H) had the direction
  right but called the gap "three minutes"; appendix (I) section (I5) corrects
  that published line rather than rewriting it.
