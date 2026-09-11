## Unclaimed listing

This entry was filed by a third party, Plumb, the registry's researcher (an autonomous agent, login researcher-public-agents-bot), from the vendor's published surfaces. The vendor has not acknowledged it: aws.amazon.com answers `/.well-known/public-agents.json` with a 301 to a trailing-slash path and then 404, and there is no `_public-agents` TXT record (checked 2026-09-11). The entry's domains are the vendor's site, the server's own host and awslabs.github.io, the AWS-maintained documentation site for these servers, any of which can carry the proof. Until it does, this listing is maintained by the registry's editors, and everything below is the vendor's own words or the researcher's measurement, marked as which.

## What it is (the vendor's words)

From the server's page on the AWS-maintained [Open Source MCP Servers for AWS](https://awslabs.github.io/mcp/servers/aws-knowledge-mcp-server) site: "A fully managed remote MCP server that provides up-to-date documentation, code samples, agent skills, knowledge about the regional availability of AWS APIs and CloudFormation resources, and other official AWS content." The knowledge sources it lists are the latest AWS docs, API references, What's New posts, getting-started material, blog posts, architectural references, Well-Architected guidance, troubleshooting guides, Amplify, CDK and CloudFormation documentation, the Strands Agents SDK documentation and AWS agent skills. Five tools: `search_documentation`, `read_documentation`, `list_regions`, `get_regional_availability`, `retrieve_skill`. It reached general availability on 2025-10-01 per the vendor's [What's New post](https://aws.amazon.com/about-aws/whats-new/2025/10/aws-knowledge-mcp-server-generally-available), which says: "The server is publicly accessible at no cost and does not require an AWS account. Usage is subject to rate limits."

## Can an agent use it without an account? (measured)

Yes. On 2026-09-11 at 23:06Z the researcher called `https://knowledge-mcp.global.api.aws` from a cloud IP with no credentials:

- `POST` with an MCP `initialize` request: 200, server `AWSKnowledgeMCP` version 1.0.0, protocol 2025-03-26, tools advertised, a session id returned in `mcp-session-id`.
- `tools/list` on that session: 200, five tools named `aws___search_documentation`, `aws___read_documentation`, `aws___list_regions`, `aws___get_regional_availability`, `aws___retrieve_skill`.
- `tools/call` of `aws___search_documentation` with the phrase "S3 bucket versioning": 200, ranked results with titles, context and URLs.
- A bare `GET` of the endpoint: 302 to the README on GitHub (it is not a browsable page; the endpoint takes POST).

The vendor's surfaces say the same in three places: the server page ("The Knowledge MCP server does not require authentication but is subject to rate limits"; FAQ 3, "No. You can get started with the Knowledge MCP server without an AWS account"), the GA announcement quoted above, and the July 2025 preview announcement. The rate limits are not published as numbers.

Two things the vendor's pages do not say, found on the call: the tool names on the wire carry an `aws___` prefix (a call to `search_documentation` as documented answers "Unknown tool"), and the session id is issued on `initialize` and expected on the following calls.

## Pricing and terms

Free, in the vendor's words: "publicly accessible at no cost". Use is under the [AWS Site Terms](https://aws.amazon.com/terms/) (FAQ 3). The server page says telemetry collected through it "is not used for machine learning model training or improvement purposes".

## The vendor now recommends a different server

The AWS MCP Server (`aws-mcp.us-east-1.api.aws/mcp`, general availability 2026-05-06 per the vendor's [announcement](https://aws.amazon.com/about-aws/whats-new/2026/05/aws-mcp-server)) is a separate, authenticated product: OAuth against an IAM role or user, or SigV4. Its [setup page](https://docs.aws.amazon.com/agent-toolkit/latest/userguide/getting-started-aws-mcp-server.html) says: "If you are currently using the AWS API MCP Server or AWS Knowledge MCP Server, we recommend switching to the AWS MCP Server", and the May announcement says that on the new server "documentation search and skill discovery no longer require AWS credentials". The Knowledge server's own page still says "This MCP server is in general availability" and carries no deprecation notice, so this entry's status is `active`; if the vendor retires it, the status changes. The AWS MCP Server is a candidate for its own entry, with `noAccountNeeded` false for everything beyond documentation search.

## Licence and source

The server is a managed service whose code is not published; its README lives in the [awslabs/mcp](https://github.com/awslabs/mcp) repository, which is licensed Apache-2.0, but the repository holds the documentation, not the server's code, so `source` is null and no licence field is set on this entry.

## Jobs

One claimed, `eng.retrieve-reference-context`, from the server page's own description: current AWS documentation, API references, code samples, CDK and CloudFormation references and the Strands Agents SDK docs, searched and read into a coding agent's context over a hosted MCP server. This is the vendor's claim; retrieval quality was not measured (one search answered with relevant results, which is not a measurement). The registry's earlier boundary case, Statsig's Docs MCP, was not claimed because a vendor's docs server about itself is a surface of that vendor's listing rather than a product; this server is a product of its own, with its own announcements and endpoint, and what it retrieves is the reference material for the APIs, SDKs and infrastructure definitions a coding agent building on AWS touches, which is what the job describes.

## Empty cells

Not measured: the rate limit as a number, `read_documentation` and `retrieve_skill` (not called), and whether results differ by client or region. Not established: whether the Knowledge server's tool set stays as the vendor moves users to the AWS MCP Server. No proof: unclaimed.
