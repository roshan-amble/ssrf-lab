# Release verification

A prepared script is not a passing test run. The evidence for a release is a
successful CI run for its exact commit, with the raw output attached.

## What CI checks

1. A clean `npm ci` using the committed lockfile on Node.js 22.
2. TypeScript checking and compilation, including the CLI in `dist/`.
3. Unit and integration tests, including a real internal request followed by a
   late policy refusal. A hit must remain `REACHED`, not become `BLOCKED`.
4. The compiled CLI help and the ten-probe built-in-client comparison.
5. The seven-case direct-address suite against the three pinned library versions.
6. Both suites against the guarded client with `--fail-on-reach`.
7. A negative control: the plain client on the direct suite must return exit 1
   with `--fail-on-reach`. A gate that never fails is not useful.

Tests and scans run in a fresh Linux network namespace with only loopback up.
Dependency installation happens before isolation. This keeps the intentionally
unsafe clients away from real metadata services and other networks. Isolation
errors fail the job; there is no fallback to unrestricted scanning.

## Find the actual output

Open the repository's **Actions** tab, select the `ci` run for the commit being
released, and download `release-verification-<sha>`. It contains:

- `environment.txt`, `network.txt`, and `versions.txt` for reproducibility;
- installation, typecheck, build, and test logs;
- `builtins`, `libraries`, and `guarded` results in JSON and readable text;
- the unsafe-client negative control and its observed exit status;
- `RESULTS.txt`, written only after every required check succeeds.

GitHub retains these artifacts for 14 days. Save the output for a release before
it expires. On a pull request, GitHub may test a synthetic merge commit; record
both that tested SHA and the PR head. Run CI again after merging.

Do not describe old README output or an unexecuted script as fresh verification.
Network failures and deadline timing can change between environments. In a
loopback-only namespace, a pinned public DNS answer can fail immediately and
produce `PREVENTED` rather than the historical `BLOCKED` deadline result. Neither
means that the internal service was reached, and neither proves real DNS rebinding
is covered.

## Local reproduction

Use Node.js 22 or newer and the committed dependency lockfile:

```bash
npm ci
npm run typecheck
npm run build
node dist/cli.js --help
node dist/cli.js scan --client libs --suite direct
```

The direct suite targets only the lab's local service. Still use a disposable,
authorized environment: the address spellings include `0.0.0.0` and IPv4-mapped
IPv6, whose behavior can vary by operating system.

For the full test suite and redirect scans, use the loopback-only network
namespace shown in `.github/workflows/ci.yml`, or a disposable container/VM with
external and link-local access disabled. Do not run unsafe clients on a cloud
instance or a network with sensitive services merely because the listeners are
bound to loopback. Some probes attempt non-loopback destinations.

## Make a launch demonstration

Use the actual scan tables from a verified run, or record a terminal running the
compiled direct-suite command in an isolated local environment. Show the commit,
Node version, command, verdict legend, and result. Label an edited excerpt as an
excerpt; label a rendering of CI results as a CI-results visualization rather than
a live recording. Never generate a fictional successful scan.

## Scope and interpretation

There are ten main SSRF/fetch-safety probes and seven separate direct-address
cases, not seventeen independent guarantees. The two suites overlap in the
behavior they exercise. Plain HTTP and an injected resolver do not test TLS,
real recursive DNS, or production deployment behavior.

`--fail-on-reach` rejects observed reach. It does not require every other row to
be `BLOCKED`, and it is not a security certification. A client-reported refusal
alone cannot outweigh an observed internal hit. Adapters must finish or cancel
their network work before settling `fetch`, and scans must not share one range
concurrently: the hit counter is scoped to a sequential probe, not a request ID.

Keep the existing research write-up and disclosure timeline intact. A CVE
request is not an assigned CVE; do not add a CVE badge or a confirmed severity
claim without assignment evidence.
