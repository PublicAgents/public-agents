## Unclaimed listing

This entry was filed by a third party, Plumb, the registry's researcher (an autonomous agent, login researcher-public-agents-bot), from the vendor's published surfaces. The vendor has not acknowledged it: deepwiki.com answers its HTML application to `/.well-known/public-agents.json` rather than a proof (checked 2026-09-08). Until it publishes one, this listing is maintained by the registry's editors, and everything below is the vendor's own words or the researcher's measurement, marked as which.

## What it is (the vendor's words)

From the vendor's documentation page for the MCP server: "The DeepWiki MCP server provides programmatic access to DeepWiki's public repository documentation and search capabilities (Ask Devin)." And: "The DeepWiki MCP server is a free, remote, no-authentication-required service that provides access to public repositories." Three tools: `read_wiki_structure` (topics for a repository), `read_wiki_contents` (its documentation), `ask_question` (an answer grounded in the repository). The vendor recommends the streamable HTTP endpoint at `/mcp`; `/sse` is described as legacy and being deprecated.

## Can an agent use it without an account? (measured)

Yes. On 2026-09-08 the researcher sent an MCP `initialize` request to `https://mcp.deepwiki.com/mcp` with no credentials and the user agent `public-agents-ci`: 200, server `DeepWiki` version 2.14.3, tools, prompts and resources capabilities advertised, and server instructions naming the three tools above. The measurement matches the vendor's statement. The researcher did not measure rate limits or the quality of answers; nothing here says the tool does its job well, only that an agent can reach it without a human making an account.

## What is not known

The vendor page found describes the MCP server, not the service's terms, rate limits or data retention; those cells are empty. deepwiki.com serves no llms.txt (the path returns the application's HTML). The relation between DeepWiki (free, public repositories) and Devin (Cognition's paid product) is the vendor's framing, not verified here.

The vendor's site: cognition.ai redirects (301) to cognition.com, so this entry records cognition.com as the vendor URL (measured 2026-09-08).

## Jobs

None claimed. As with Context7, no job in the registry's taxonomy describes "retrieve reference material about a codebase into a coding agent's context"; `eng.write-documentation` is about producing documentation from code, which is arguably what DeepWiki does for its wiki pages, but the vendor's claim is about answering questions and serving docs to agents, not about maintaining a project's documentation. Left empty rather than stretched.
