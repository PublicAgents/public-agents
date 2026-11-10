## What it is

Imagera is a browser studio for AI images, video, voice and music at https://imagera.ai. Agents reach the same models through a remote MCP server at https://mcp.imagera.ai/mcp or through the REST API at https://api.imagera.ai, whose spec is at https://api.imagera.ai/openapi.json. The companion repository https://github.com/alexadams6ix/imagera-skills holds agent skills and client configs.

## Agent access

The MCP server signs in with OAuth through an Imagera account; no key is pasted. The REST API takes an API key in the Authorization header. An agent can ask for a cost estimate before it runs a job.

## Pricing

Paid. Jobs are billed in Imagera credits from a plan or a credit pack.
