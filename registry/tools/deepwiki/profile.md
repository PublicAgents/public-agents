## Unclaimed listing

This entry was filed by a third party, Plumb, the registry's researcher (an autonomous agent, login researcher-public-agents-bot), from the vendor's published surfaces. The vendor has not acknowledged it: deepwiki.com answers its HTML application to `/.well-known/public-agents.json` rather than a proof (checked 2026-09-08). Until it publishes one, this listing is maintained by the registry's editors, and everything below is the vendor's own words or the researcher's measurement, marked as which.

## What it is (the vendor's words)

From the vendor's [documentation page for the MCP server](https://docs.devin.ai/work-with-devin/deepwiki-mcp), re-read 2026-09-15: "The DeepWiki MCP server provides programmatic access to DeepWiki's public repository documentation and search capabilities (Ask Devin)." And: "The DeepWiki MCP server is a free, remote, no-authentication-required service that provides access to public repositories." Three tools: `read_wiki_structure` (topics for a repository), `read_wiki_contents` (its documentation), `ask_question` (an answer grounded in the repository). The vendor recommends the streamable HTTP endpoint at `/mcp`; `/sse` is described as legacy and being deprecated.

## Can an agent use it without an account? (measured)

Yes. On 2026-09-08 the researcher sent an MCP `initialize` request to `https://mcp.deepwiki.com/mcp` with no credentials and the user agent `public-agents-ci`: 200, server `DeepWiki` version 2.14.3, tools, prompts and resources capabilities advertised, and server instructions naming the three tools above. The measurement matches the vendor's statement. The researcher did not measure rate limits or the quality of answers; nothing here says the tool does its job well, only that an agent can reach it without a human making an account.

## What is not known

The vendor page found describes the MCP server, not the service's terms, rate limits or data retention; those cells are empty. deepwiki.com serves no llms.txt (the path returns the application's HTML). The relation between DeepWiki (free, public repositories) and Devin (Cognition's paid product) is the vendor's framing, not verified here.

The vendor's site: cognition.ai redirects (301) to cognition.com, so this entry records cognition.com as the vendor URL (measured 2026-09-08).

## Jobs

One claimed, `eng.retrieve-reference-context`, from the vendor's [MCP documentation page](https://docs.devin.ai/work-with-devin/deepwiki-mcp), which describes the server as providing "programmatic access to DeepWiki's public repository documentation and search capabilities (Ask Devin)" to AI apps. This is the vendor's own description, recorded as a claim; nothing here measures how good the answers are. The job it claims is retrieval of material about a codebase into an agent's context, not `eng.write-documentation`: DeepWiki does generate wiki pages from public repositories, but the vendor's claim about the MCP server is about serving and answering, not about maintaining a project's own documentation, and this entry does not stretch it. Until 2026-09-09 this cell was empty because no job described the outcome; the job was proposed by the researcher from this entry and Context7's.

## Citation repair, 2026-09-15

Version 2 of this profile quoted three sentences from the vendor's MCP documentation page and linked no page at all. The only URL in the whole profile was `mcp.deepwiki.com/mcp`, which is an endpoint an agent calls, not a page a reader can open. A reader who wanted to check any of the three had nowhere to click.

It was found by counting rather than by reading: a citation audit over all thirty tool profiles in this registry, which fetches nothing and simply compares how many sentences a profile quotes against how many pages it links that could carry prose. This entry was the clearest case of seven. The seven the audit flagged on 2026-09-15, all of them filed by the same researcher, are `deepwiki` (this one, 3 quotations), `posthog`, `growthbook`, `convert`, `optimizely`, `statsig` and `github` (23, the largest). Each is being repaired in its own pull request, and the repairs so far have found more than missing links: quotations flattened out of the vendor's punctuation, quotations assembled from two fragments of a page, and one quotation attributed to a page that never carried it. A reader auditing this registry should treat any quotation in those seven that has not yet been through a repair as unchecked rather than as wrong. `check-links` reads URLs out of JSON only, so nothing in CI has ever looked at a profile's links, which is exactly why the gap went six days unnoticed in the smallest entry in the registry.

The quotations were re-verified against that page on 2026-09-15 and again on 2026-09-16, in both the HTML the vendor serves and the Markdown at the same path plus `.md`. Version 3 first said all three were present verbatim in both representations, and the registry's reviewer was right that this overclaimed. The possessive differs: the Markdown writes `DeepWiki's public repository documentation` with an ASCII apostrophe and the HTML writes `DeepWiki’s public repository documentation` with a typographic one. The sentence a reader sees is the same sentence; the bytes are not, and this profile quotes the Markdown form. The second quotation ("a free, remote, no-authentication-required service that provides access to public repositories") contains no apostrophe and is byte-identical in both. Nothing in the entry's substance changes; the version bump buys a reader the ability to check it.

The general form of that, worth carrying into the other six repairs: a docs site that serves the same page as HTML and as Markdown is serving two texts, and typographic substitution (apostrophes, quotation marks, dashes) is the most common way they diverge without any reader noticing. Say which representation a quotation was taken from, rather than asserting both.
