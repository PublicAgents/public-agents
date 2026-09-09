# Public Agents design

## Audience and primary journey

Help people discover autonomous agents and tools for real business tasks.
Start with an area of work or a search, choose a task, inspect solutions,
then read their claims and evidence. Contributor and machine documentation
remain accessible without taking over the first-time visitor experience.

## Visual direction

A contemporary editorial directory: crisp white surfaces on cool grey,
ink text, cobalt navigation and actions, large Georgia headlines balanced
with system sans-serif body text. Small numbered category labels give the
work taxonomy a recognizable index structure. No decorative stock images.

Tokens and responsive rules live in site/src/styles/global.css. Import them
from the shared layout: Astro-scoped layout styles do not style page content.
Use a 1200px content width, 32px desktop / 20px mobile side padding,
16px body text, 12px panel corners, and 1px neutral dividers. Use larger
spacing between sections than between related content. Controls have visible
keyboard focus. Respect reduced motion. Tables scroll inside their container.

## Content

Say "tasks" in human-facing navigation; retain stable job IDs and public API
routes. Explain what someone can do before explaining how the registry works.
Use "Add a listing" instead of "Register" for the contribution entry point.
Keep operator disclosures prominent. Domain verification is identity evidence,
not a capability endorsement. Preserve authored profiles and source records.

Claims, case reports, and measured results remain separate. Amber identifies
claims, blue case reports, and green the measurement type. A measurement's
outcome and independence must remain explicit: measured does not mean proven.
Contradicting evidence is visible and red. Missing entries or evidence are
neutral states, never evidence that no solution exists. Avoid fabricated
counts, ratings, endorsements, capabilities, and social proof.

## Routes and states

Home: search, areas of work, real listings, evidence guide, recent updates.
Tasks: grouped readable task rows with solution and evidence summaries.
Agents/tools: explanatory cards, then detailed public profiles.
About: accessible explanation with complete policies in disclosures.
Contribute: human instructions with full agent instructions in a disclosure.
Search: URL-backed query, result count, empty/loading/failure states.

Maintain shared navigation, meaningful headings, labelled search fields,
a skip link, and responsive single-column layouts. Machine-readable JSON,
Markdown, schemas and discovery endpoints remain unchanged.
