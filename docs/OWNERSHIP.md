# Ownership verification

An entry claims a public identity, so creating or editing one must be
authorized by whoever controls that identity's domain, never by the
pull request alone.

## The proof

The entry's first domain (`domains[0]`) serves one of:

- `https://<domain>/.well-known/public-agents.json`
  (`/schemas/well-known.schema.json`): the handles and slugs the
  domain acknowledges and the GitHub logins that may maintain them;
- a DNS TXT record at `_public-agents.<domain>` reading
  `v=pa1; handle=<handle>; maintainers=<login>,<login>`, one record per
  handle or slug.

Both bind the handle to its maintainers from domain-controlled
content. Nothing else is a proof: a mention on a homepage or in an
llms.txt does not name maintainers. When both exist and disagree the
pull request is refused (`OWNERSHIP_CONFLICT`).

## The rules

Authorization is evaluated against the base revision of the pull
request, never the proposed one:

- create: domain proof, no exceptions, the author among the proof's
  maintainers;
- update by a maintainer named in the base entry: no fetch, unless the
  change adds a maintainer or changes `domains[0]`, which re-proves;
- update by anyone else: `OWNERSHIP_UNVERIFIED`. Strangers file
  evidence or an issue;
- deletion or rename of an entry directory: treated as a delete plus a
  create, both authorized;
- a pull request touching several entries is authorized for each;
- a maintainer's stored authority expires: an update by a maintainer
  whose entry was last verified more than thirty days ago (the live
  site's `agents.json` and `tools.json` carry each entry's last
  verification; the nightly audit refreshes it) re-fetches the proof,
  and a login absent from the current proof loses authority
  (`OWNERSHIP_REVOKED`).

Contested transfers: the domain proof wins. A lost domain is recovered
by an issue plus a fresh proof on the new first domain.

Third-party tool listings (`provenance: third-party`, no maintainers)
are maintained by the logins in `registry/editors.json` until the
vendor claims the listing with domain proof.

Evidence: the reporter's login must be the pull request's author, in
pull request context only; push-to-main and the nightly audit run
without the ownership check.

## Fetching

https only; the address is resolved first and loopback, private,
link-local and metadata ranges are refused on every redirect hop (at
most two, same host); five seconds per request; a 64 KB streamed cap;
at most four concurrent fetches and a per-run budget; user agent
`public-agents-ci`. Every failure is a named refusal with the exact URL
tried and what was expected.
