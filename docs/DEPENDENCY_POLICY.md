# Dependencies and the deliberately vulnerable fixture

This repository is a local research harness, not an SSRF protection service.
The default comparison intentionally includes a vulnerable version of a package.
Do not deploy this checkout as a production fetch service or expose its test tools.

## Development toolchain

The test runner was upgraded from Vitest 2.1.9 to 5.0.3 and the lockfile regenerated
without `--force` or `--legacy-peer-deps`. Other direct dependencies were pinned to
their previously resolved versions. CI runs on Node.js 22 and 24. Use Node 22.12.0
or newer on a release line supported by Vitest 5.

## Research versions must remain reproducible

| Package | Pinned version | Role |
| --- | --- | --- |
| request-filtering-agent | 3.2.1 | Comparison target |
| ssrf-req-filter | 1.1.1 | Comparison target |
| ssrf-agent | 1.0.5 | Vulnerable research target |
| ip | 1.1.9 | Transitive dependency of ssrf-agent |
| ipaddr.js | 2.5.0 | Transitive dependency of the comparison targets |
| guarded-fetch | 0.1.5 | Additional comparison target |

The dependency-upgrade verification compared each of these packages' versions,
resolved tarball URLs, and integrity hashes against the original lockfile.
No research dependency was silently replaced to obtain a green audit.

## Patched comparison transports

The current lockfiles use Undici 7.30.1 for guarded-fetch, n8n, and ssrf-fetch,
and 8.12.3 for node-safeurl. These versions address
[GHSA-4qv8-2p9j-2685](https://github.com/advisories/GHSA-4qv8-2p9j-2685),
[GHSA-f72v-6w45-q472](https://github.com/advisories/GHSA-f72v-6w45-q472), and
[GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c).
guarded-fetch 0.1.5 pins Undici 7.30.0, so the root manifest explicitly overrides
only that package's Undici dependency. The other updates satisfy upstream's
declared version ranges. The comparison packages' own versions are unchanged.

These are the current comparison configurations. Historical evidence retains
its original lockfiles and results; it does not describe these patched installs.
The audit gates are unchanged; no Undici advisory is excepted.
The published ssrf-lab CLI has no runtime dependencies and does not install
these optional comparison packages.

## Patched n8n query serializer

The current n8n fixture overrides only `@n8n/backend-network@1.17.3`'s exact
`qs@6.15.2` dependency with `qs@6.16.1`. This fixes
[GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw),
which can make comma-format serialization throw for certain object elements.
The override is explicit because the upstream dependency is an exact pin;
the n8n component versions and audit gate remain unchanged. No new advisory
is excepted. The old `qs` exception and its propagated dependency edge are
removed from the review snapshot, while the repaired version remains pinned.
Historical evidence retains its original dependency configuration.

## Patched n8n redirect dependency

The current n8n fixture explicitly pins `follow-redirects@1.16.2` instead of
the previously locked `1.16.1`. The upstream advisory
[GHSA-mrwp-f3q8-3g9p](https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-mrwp-f3q8-3g9p)
lists `1.16.2` as the fix for cross-realm `sensitiveHeaders` validation.
The replacement satisfies Axios's existing `^1.16.0` dependency range. The
n8n component versions remain unchanged, and the repaired transitive version
is recorded in the review snapshot. No advisory exception was added or
expanded. The audit gate rejected the old lockfile and accepts the patched
configuration with its twelve existing research-fixture findings.
Historical results retain their original dependency configuration. This
dependency belongs to the optional comparison fixture, not the published CLI.

## Two package findings, one documented exception

At upgrade verification, `npm audit` reported two high-severity package entries:
`ip` and its dependent `ssrf-agent`. The underlying advisory is
[GHSA-2p57-rm9w-gvfp](https://github.com/advisories/GHSA-2p57-rm9w-gvfp).
Those audit entries are separate from the project's pending CVE request. They do
not establish assignment, novelty, or severity of that request.

`scripts/check-audit.mjs` allows only this advisory on the exact fixture versions.
It fails on an additional package, changed fixture version, new advisory on an
excepted package, malformed report, or inconsistent totals. Seven tests exercise
that gate. A passing gate means **no unreviewed findings**, not zero vulnerabilities.

Run the checks with:

```bash
mkdir -p verification
node --test scripts/check-audit.test.mjs
npm audit --json > verification/dependency-audit.json
node scripts/check-audit.mjs
```

`npm audit` currently exits 1 for the known fixture; the subsequent gate separately
evaluates the report. Never disable the audit or allow all advisories on a package
just because it is part of a security lab.

## Separate n8n research fixture

The optional n8n integration has its own lockfile and audit gate under
`integrations/n8n/`. It pins `@n8n/backend-network@1.17.3` and
`@n8n/config@2.41.2`, matching the components in n8n 2.43.5. Its reviewed audit
snapshot contains twelve vulnerable package entries after the qs repair, including
transitive impact entries rather than twelve independent discoveries. The original eight
entries were `@n8n/api-types`, `@n8n/backend-common`, `@n8n/backend-network`,
`@n8n/decorators`, `axios`, `n8n-workflow`, `qs`, and `stream-json`.

The additional review covers Zod 3.25.76 and the exact dependency impact through
`@asteasolutions/zod-to-openapi`, `@n8n/config`, `@n8n/expression-runtime`, and
`@n8n/permissions`.
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
describes memory exhaustion during oversized collection validation and lists
Zod 4.6.6 as the fix. These n8n components pin Zod 3.25.76; forcing Zod 4 would
replace their declared dependency with a different major version. The fixture
exercises outbound HTTP against small, static local responses and does not
accept external schema-validation inputs. This is an isolation-based research
exception, not a claim that the pinned Zod version is fixed or production-safe.
The review pins the additional package versions, install paths, advisory URL,
affected range, severity, and propagated dependency edges. New findings still
fail the gate.

`integrations/n8n/reviewed-audit.json` records exact advisory URLs, affected
ranges, severities, install paths, and pinned versions. The separate gate
rejects new advisories, package entries, paths, or versions, and permits removal
of reviewed advisories. Five tests cover that gate. The fixture is kept intact
for reproducibility and exercised only as a local research client. Do not
interpret the exception as a production dependency recommendation.

```bash
node --test integrations/n8n/check-audit.test.mjs
npm audit --prefix integrations/n8n --json > verification/n8n-audit.json
node integrations/n8n/check-audit.mjs verification/n8n-audit.json
```

## Isolation

The optional [Linkwarden source trial](../integrations/linkwarden/README.md)
uses another separate npm lockfile. Its three direct transport dependency
versions match the pinned application's Yarn lock; the rest of the application
dependency graph is not installed. The recorded 2026-10-20 Node 22/24 transport
audits reported zero advisories and are retained with the request evidence.
The workflow fails on any advisory instead of introducing an audit exception.

CI installs dependencies before creating a network namespace, then runs the tests,
scans, and demonstration with only loopback enabled. There is no fallback to an
unrestricted network. The verification workflow has only repository read access;
it does not publish packages, create releases, or modify repository content.
The new integration job assigns a public-shaped entry address to `lo` inside
that namespace, with no external interfaces or routes. See
[integration reproduction](INTEGRATIONS.md) for its fail-closed checks.
