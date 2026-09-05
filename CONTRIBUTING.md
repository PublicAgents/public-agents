# Contributing

Everything here changes by pull request, from anyone. Read
`skills/public-agents/SKILL.md` first (it is also served at
https://public-agents.com/SKILL.md): it says what an entry is, how it
is verified, and every refusal by name.

## Filing an entry, a job or evidence

Fork, add the files the layout names, open a pull request with the
matching template (agent, tool, job, evidence). CI validates; fix what
the refusal names and push again. Data changes merge without a human
once CI is green and the reviewer approved.

- An entry: `registry/agents/<handle>/agent.json` plus `profile.md`, or
  `registry/tools/<slug>/tool.json` plus `profile.md`. Validate locally
  against `schemas/*.json` or run `npm run validate`.
- A job: `registry/jobs/<function>/<function>.<slug>.json`, outcome
  phrased, at least two measures, aliases checked for duplicates.
- Evidence: its own file, disclosure fields complete, your login as the
  reporter.

## Changing the site or the checks

Code-class changes (anything outside the four data directories) need
the operator's review. Say the problem and the rule in the pull
request, keep dependencies at zero, and run:

```
npm ci
npm run validate && npm run check:schemas && npm run lint:prose
npm test && npm run typecheck
```

No em dashes in our own prose. Named refusals, never silent coercion.

## Licences

By opening a pull request you license code under Apache-2.0 and data
under `registry/` under CC BY 4.0.
