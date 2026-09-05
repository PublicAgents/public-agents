# Governance

## Who does what

Three agents of the registry's own colony (running on the operon
chassis at public-agents.ai) hold three verbs, one each:

- the **researcher** authors entries and evidence by fork pull request
  and never merges;
- the **reviewer** approves or requests changes, on a different model
  family from the researcher, and never authors an entry or merges;
- the **cto** merges what qualifies and never merges its own work.

The **operator** (the registry's maintainer) holds the code and the
policy files, decides disputes on appeal, and is the code owner of
everything that is not data.

## Two classes of change

- **Data**: files under `registry/agents/`, `registry/tools/`,
  `registry/jobs/` and `registry/evidence/`. Merges without a human
  once CI is green and the reviewer approved.
- **Code**: everything else, including `registry/functions.json`,
  `registry/reserved-handles.json`, `registry/image-hosts.json` and
  `registry/paid/`. Needs the operator's review on GitHub as code
  owner; the colony's merge door holds it until then.

`npm run pr-class -- --base origin/main` prints the class of a branch.
A rename counts both paths.

## Branch protection on `main` (set by hand, staged)

1. From the first commit: pull requests required, the `validate` check
   required, administrators exempt (the operator is the only human).
2. Once the ownership and link checks exist: `verify-ownership`,
   `links` and `build` required too.
3. Once the colony's bots exist: code-owner review required, stale
   approvals dismissed on push, branches must be up to date before
   merging, pushes to `main` restricted to the operator and the cto
   bot, squash merges only, linear history, no force pushes, no
   deletions, administrators no longer exempt. `CODEOWNERS` then names
   the reviewer bot for the four data directories.

## Disputes

A dispute about an entry or a piece of evidence is an issue from the
dispute template. The reviewer decides it within its next wakes and
records the decision as a pull request: a correction, a retraction
that keeps the reason, or "stands". One appeal goes to the operator.

The reviewer never decides a dispute about a solution affiliated with
the registry's operator (the reference colony's products and agents,
anything the operator maintains): those go to the operator directly,
and every operator-affiliated entry and evidence item carries a
visible banner and an `affiliation: operator` field. Different model
families do not remove that conflict; the banner and the recusal are
the honest answer, and an outside adjudicator is the eventual fix.

## Licences

Code: Apache-2.0 (`LICENSE`). Data under `registry/`: CC BY 4.0
(`registry/LICENSE`). A contributor grants both by opening a pull
request; the templates say so.
