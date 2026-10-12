# Release verification

A prepared script is not a passing test run. The evidence for a release is a
successful CI run for its exact commit, with raw output attached.

## What CI checks

1. Clean `npm ci` using the committed lockfile on Node.js 22 and 24.
2. Seven tests for the audit gate, followed by the actual npm dependency audit.
   Only the exact [research-fixture exception](DEPENDENCY_POLICY.md) is allowed.
3. TypeScript checking and compilation, including the CLI in `dist/`.
4. Unit and integration tests, including a real internal request followed by a
   late policy refusal. A hit must remain `REACHED`, not become `BLOCKED`.
5. The compiled CLI help and ten-probe built-in-client comparison.
6. The seven-case direct-address suite against the three pinned library versions.
7. Both suites against the guarded client with `--fail-on-reach`.
8. A negative control: the plain client must return exit 1 and contain observed
   `REACHED` results. A generic crash is not accepted as a passing negative control.
9. A real, compact comparison recorded in a pseudo-terminal, with measured hit
   totals checked against the independently run library suite.

Tests and scans run in a fresh Linux network namespace with only loopback up.
Dependencies are installed before isolation. This keeps intentionally unsafe
clients away from real metadata services and other networks. Isolation errors
fail the job; there is no fallback to unrestricted scanning.

## Find the actual output

Open **Actions**, select the `ci` run for the commit, and download
`release-verification-node<version>-<sha>`. It contains:

- `environment.txt`, `network.txt`, and `versions.txt` for reproducibility;
- install, typecheck, build, and test logs;
- `dependency-audit.json`, the audit gate result, and audit-gate tests;
- `builtins`, `libraries`, and `guarded` JSON and readable scan tables;
- the unsafe-client negative control and its observed exit status;
- `demo.cast`, `demo.txt`, and `demo.json`;
- `RESULTS.txt`, written only after every required check succeeds.

Artifacts expire after 14 days. Save release evidence before expiration. A pull
request can test a synthetic merge commit: record that SHA and the PR head, and
verify CI again after merging. Do not call a historical transcript a fresh result.

## Compact demonstration

After cloning the repository, use Node.js 22.12.0 or newer on a supported release
line (CI tests 22 and 24):

```bash
npm ci
npm run typecheck
npm run build
node scripts/demo.mjs
```

The demonstration runs all seven direct-address cases against all three pinned
libraries. It prints real verdicts and independent internal-hit counts, not a
hardcoded table. It needs no account or API key. Use an authorized disposable
environment; `0.0.0.0` and IPv4-mapped IPv6 behavior can vary by operating system.

CI runs `python3 scripts/record-demo.py verification/demo.cast` in the isolated
network. The result is an asciicast v2 recording of a real process in a
pseudo-terminal. `demo.txt` preserves the text, and `demo.json` preserves its
measured scans. A video rendering may hold the final output for readability;
label that edit rather than implying the scan took longer than it did.

## Full local verification

For the complete tests and redirect scans, use the loopback-only namespace in
`.github/workflows/ci.yml`, or a disposable container/VM with external and
link-local access disabled. Some probes attempt non-loopback destinations. Do
not run them on a cloud instance or sensitive network merely because the lab's
listeners are on loopback.

## Interpretation and limitations

There are ten main SSRF/fetch-safety probes and seven separate direct cases,
not seventeen independent guarantees. Plain HTTP and an injected resolver do
not test TLS, real recursive DNS, or production deployment behavior.

Network errors and deadlines vary. A pinned public answer can fail immediately
in the isolated namespace, yielding `PREVENTED` rather than the historical
`BLOCKED` deadline. Neither result means the internal service was reached, and
neither by itself proves real-world DNS-rebinding protection.

`--fail-on-reach` rejects observed reach; it does not require every other result
to be `BLOCKED`. The hit counter takes precedence over a claimed policy refusal.
Adapters must finish or cancel network work before settling `fetch`. Do not share
one range between concurrent scans: the counter is sequential, not a request-ID
correlation system.

The pinned library comparison must reproduce the 0 / 0 / 2 internal hits on the
supported Linux CI environments. Keep the existing research write-up and timeline
intact. A CVE request is not an assigned CVE. The fixture's npm audit advisory is
not evidence of assignment or a severity rating for the pending request.
