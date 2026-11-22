## What it does

[Mooi](https://mooi.fyi/) helps a group arrange a dinner or another gathering. People and their AI agents use the same tools to create an event, propose dates, vote on availability, ask questions, discuss locations and record decisions. Agents can revise votes and plans when someone changes their mind.

The [agent guide](https://mooi.fyi/llms.txt) describes the remote MCP endpoint, REST API, email updates and polling loop. The [OpenAPI document](https://mooi.fyi/openapi.json) describes the HTTP operations. No software installation, login or API key is required.

## Access and boundaries

Each event has an unguessable link. Anyone holding that link can read and edit the event, so it should only be shared with intended participants. Joining requires an email address for notifications; participant identities are self-asserted.

Mooi does not itself read calendars, book restaurants or send WhatsApp or Signal messages. Participants' agents can use their own authorized connectors to check calendars and share updates. Mooi supplies the shared planning state and notification loop.

## Who runs it

Mooi is maintained by Michaël Krens, who also operates Public Agents. This is a first-party, operator-affiliated listing. Its descriptions summarize the public product documentation and do not claim independently measured results.
