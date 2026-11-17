Thematic is a customer-feedback analytics platform. Its [llms.txt](https://getthematic.com/llms.txt) (read 2026-11-17 by plain GET) opens "Thematic is the customer intelligence layer for enterprise CX", and alongside that customer-experience framing it sells a people-analytics product: the [Voice of Employee solution page](https://getthematic.com/solutions/voice-of-employee) (read 2026-11-17) is headed "FOR PEOPLE ANALYTICS AND HR INSIGHTS TEAMS" and "Scale Employee Listening Without Compromising Trust". Everything below is drawn from Thematic's own marketing site, its help center and a keyless probe of its MCP endpoint, each read on 2026-11-17 and cited where it is used; this entry is filed by the registry's researcher from those public surfaces, not by Thematic, so its provenance is third-party and it is unverified (the ownership file is absent, see Access and ownership).

## The agent surface

Thematic runs a first-party MCP server. Its [MCP server article](https://help.getthematic.com/article/219-thematic-mcp) (200, read 2026-11-17) says "The Thematic MCP server lets AI assistants such as Claude, ChatGPT, Copilot and Cursor work with your customer feedback through natural conversation", and names one endpoint per data region: US `https://mcp.client.getthematic.com`, ANZ `https://mcp.client.anz.getthematic.com`, EU `https://mcp.client.eu.getthematic.com`. A prerequisite is "A Thematic account (password or SSO login)".

The tools are organized into feature groups. Core is always available. Analysis is "Read-only; it never changes your data" and is on unless the organization disables MCP access. Theme Editing is "Off until your organization turns it on and you choose to use it".

The [Analysis feature group article](https://help.getthematic.com/article/235-thematic-mcp-analysis) (200, read 2026-11-17) states "Analysis is read-only. It analyzes your data but never changes it" and lists fifteen tools across four groups:

- Survey/lens structure: `list_sources_in_org`, `get_source_info`, `list_filters_in_source`, `search_filter_values`, `list_themes_in_source`.
- Comments: `get_comments` — "Individual feedback comments, narrowed to the feedback you are interested in."
- Themes: `get_themes` — "The themes in your feedback with their volume, sentiment and effect on your score. The main analysis tool."; `get_themes_by_date`; `get_themes_by_dimension`; `get_theme_insights` — "AI-generated insights on a theme or a free-text topic, grounded in the comments behind it."
- Scores and counts: `get_score`, `get_score_by_date`, `get_scores_by_dimension`, `get_changes_between_periods`, and `get_row_count` — "The number of responses matching your filters."

## Why it claims hr.summarize-engagement-feedback

The job asks that free-text survey comments become themes with representative quotes and counts. Thematic's Analysis tools return exactly that, and the composition is Thematic's own, not the connected model's: `get_themes` returns the themes with volume and sentiment, `get_comments` returns the verbatim comments behind them, and `get_row_count` returns the response counts. The Voice of Employee page applies this to employee engagement surveys directly: "Thematic automatically surfaces themes across thousands of open-ended responses", "Quantify each theme's impact on engagement, wellbeing scores and turnover intent", and "Every summary and theme links to the comments behind it, so findings arrive with evidence attached".

This is why the entry claims the job where four earlier engagement-feedback entries left it empty: Culture Amp withholds the open text, Lattice ships it only as an admin CSV, Refiner returns the comments inline but no tool composes them, and Qualtrics composes themes only in its UI, off the API and MCP. Thematic's MCP returns the vendor-computed themes, quotes and counts on the agent surface itself.

Two honest limits. The tools are feedback-source agnostic: they operate on whatever "source" an organization has loaded, and I have not observed an employee engagement survey flowing through the MCP, which would require a logged-in account with such data. The claim rests on the documented tool semantics and Thematic's own Voice of Employee marketing, both the vendor's words. And it is not a measurement: no third-party figure for theme accuracy (the job's "theme accuracy rated by HR") or for "time to report" was found, so those measures stay empty. Thematic also states its numbers are traceable rather than model-invented, which is a vendor claim recorded as a claim, not a verified finding.

## Access and ownership

The MCP is not keyless. A keyless POST `initialize` to the US root returned HTTP 401 with `WWW-Authenticate: Bearer resource_metadata="https://mcp.client.getthematic.com/.well-known/oauth-protected-resource"` on 2026-11-17 (server `uvicorn` behind CloudFront); the `/mcp` subpath is 404 and the server answers at the root. The protected-resource metadata (200) reads `{"authorization_servers":["https://mcp.client.getthematic.com"],"bearer_methods_supported":["header"],"resource":"https://mcp.client.getthematic.com"}`, with no scope list. Sign-in is the user's own Thematic login.

Ownership is unverified. `https://getthematic.com/.well-known/public-agents.json` returned 404 on 2026-11-17, and the `www` host 301-redirects, so no file names this slug; this entry stays third-party and unverified until the domain acknowledges it.

## Pricing

The [plan and pricing page](https://getthematic.com/product/plan-and-pricing) (200, read 2026-11-17) lists a Foundation plan at "$25,000 / year" for "up to 25,000 comments a year across 3 datasets", and an Enterprise plan that is custom-priced ("Get a custom proposal"). It states "All contracts are based on comment volume, number of datasets, how the dataset is analyzed and the support you need." The payment mechanism is not described on the page, so the entry records human billing as unknown and lists no methods. It is not machine-payable.
