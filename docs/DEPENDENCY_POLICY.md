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

The dependency-upgrade verification compared each of these packages' versions,
resolved tarball URLs, and integrity hashes against the original lockfile.
No research dependency was silently replaced to obtain a green audit.

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

## Isolation

CI installs dependencies before creating a network namespace, then runs the tests,
scans, and demonstration with only loopback enabled. There is no fallback to an
unrestricted network. The verification workflow has only repository read access;
it does not publish packages, create releases, or modify repository content.
