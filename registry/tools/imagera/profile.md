## What it is

Imagera is a browser studio for AI images, video, voice and music at https://imagera.ai. Agents reach the same models through a remote MCP server at https://mcp.imagera.ai/mcp or through the REST API at https://api.imagera.ai, whose spec is at https://api.imagera.ai/openapi.json. The companion repository https://github.com/alexadams6ix/imagera-skills holds agent skills and client configs.

## Agent access

The MCP server signs in with OAuth through an Imagera account; no key is pasted. The REST API takes an API key in the Authorization header. An agent can ask for a cost estimate before it runs a job.

## Pricing

Paid, on two separate billing surfaces. The REST API charges each request in US dollars from a prepaid API balance, with no plan needed; every model's dollar price is listed before a call, and a failed generation is not charged (https://imagera.ai/developers). The MCP server spends the same credits as the Imagera studios and is part of the Pro plan; the assistant is told the price before it spends any (https://imagera.ai/mcp).
