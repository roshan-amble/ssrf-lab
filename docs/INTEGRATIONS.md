# Pinned client integrations

These integrations measure specific published packages and configurations.
A successful run is evidence for the listed probes, not a general security
assessment or a claim that every application request path is protected.

The [Linkwarden application-source trial](../integrations/linkwarden/README.md)
calls its shared `safeFetch()` and guard from a pinned checkout, using the same
address policy and redirect implementation. Recorded Node 22/24 runs blocked
nine selected cases with zero internal hits and working allowed/unsafe controls.
The [upstream test-coverage proposal](https://github.com/linkwarden/linkwarden/issues/1869)
awaits maintainer feedback.
It does not boot the application or test its browser/archive jobs, and is not
evidence of external adoption.

The separate [guarded-fetch source-build CI candidate](../integrations/guarded-fetch/README.md)
tests a pinned 0.1.6 checkout through the reusable Action. It is preparation for
an upstream contribution; it does not establish external adoption. The table
below continues to describe the published-package comparisons.

| Target | Exact version | API exercised | Scope |
| --- | --- | --- | --- |
| Vercel Labs guarded-fetch | 0.1.5 | `guardedFetch` with `createGuardedDispatcher` and `readBodyAsText` | Seven direct cases, five address redirects, redirect cap, three body probes |
| n8n backend-network | 1.17.3 | `OutboundHttp.requests().request()` | Seven direct cases and five address redirects |
| n8n backend-network | 1.17.3 | `OutboundHttp.transport({proxy:false}).asCustomFetch()` | Seven direct cases and five address redirects |
| ssrf-safe-fetch | 0.1.0 | `safeFetch` | Seven direct cases, four address redirects, redirect cap; TEST-NET explicitly outside policy |
| ssrf-fetch | 0.1.0 | `safeFetch` | Seven direct cases and six redirect cases; all redirects forbidden by design |
| @tak-ps/node-safeurl | 1.8.0 | `fetch` | Seven direct cases, five address redirects, redirect cap |

The n8n integration also pins `@n8n/config@2.41.2`. These are the component
versions in the [`n8n@2.43.5` source](https://github.com/n8n-io/n8n/tree/d811f5e87dfc164999f34d75b17017876d41a54a).
It instantiates the published production policy, resolver, cache, and outbound
client classes. It does not boot n8n, execute a workflow, or prove that each node
uses these APIs. No upstream source is vendored or patched.

## Configuration

The current comparison lockfiles use patched Undici transports. In particular,
guarded-fetch 0.1.5 runs with an explicit Undici 7.30.1 override rather than its
original 7.30.0 pin. See the [dependency policy](DEPENDENCY_POLICY.md#patched-comparison-transports)
for the exact versions and advisory review. Historical evidence below retains
its original dependency configuration.

The n8n fixture also explicitly overrides backend-network's pinned `qs@6.15.2`
with `qs@6.16.1` to address GHSA-6pq8-jhm2-2vcw. See the
[query-serializer review](DEPENDENCY_POLICY.md#patched-n8n-query-serializer).
This is a patched comparison configuration, not an untouched transitive install.
It also pins `follow-redirects@1.16.2` to repair GHSA-mrwp-f3q8-3g9p; see the
[redirect dependency review](DEPENDENCY_POLICY.md#patched-n8n-redirect-dependency).

The [additional package group](../integrations/community/README.md) is installed
separately and has its own scope notes and audit. Its node-safeurl functional
redirect regression and patch are separate from the unmodified SSRF comparison.

- guarded-fetch uses its own dispatcher and exported body reader, with a shared
  request/body deadline of 5 seconds and a decoded response cap of 1 MiB. The
  slow-body probe selects 4 seconds. These are configured limits, not upstream
  defaults. This does not claim that `guardedFetch` alone limits body consumption.
- n8n uses upstream default blocked IP ranges, empty allowlists, protection on,
  and proxies off. Each API is also measured with protection off as a negative
  control. Its 5-second adapter timeout is a harness limit and is never mapped
  to an n8n policy refusal. The logger alone is a small local substitute.
- Only typed errors from the actual target policy are translated to
  `PolicyRefusal`. Parser failures remain `PREVENTED` or `LUCKY`, as appropriate.
  Internal server hits take precedence over later errors.
- Neither adapter injects a base DNS resolver, so simulated rebinding is `N/A`.
  These runs cover plain HTTP, not TLS or proxy behavior. n8n body resource
  limits are outside this integration's scope.
- Opaque clients do not expose a complete intermediate URL trace. Counters are
  the evidence of actual entry and internal requests.

## Why the isolated entry address matters

Both packages refuse a loopback entry URL. Crediting that refusal as a passing
redirect or response-body test would test the wrong thing. Without the special
fixture, the harness marks those cases `N/A` for these adapters.

For a full run, CI creates a fresh Linux network namespace with only `lo`, then
assigns `93.184.216.34/32` to `lo`. The address is used solely as a local fixture:
there is no external interface, default route, or gateway. The fixture refuses
to start unless those conditions are verified for IPv4 and IPv6. Never assign
this address or run this mode on a normal connected host interface.

Every protected client must first receive the expected successful entry
response. Every redirect and body probe must reach the entry server. The JSON
records per-probe entry and internal hit counts. Unprotected controls must
reach the internal service through both a direct URL and a redirect; a control
is not required to accept malformed or credential-bearing URLs.

## Reproduce

Install and build before entering the namespace:

```bash
npm ci --ignore-scripts
npm ci --ignore-scripts --prefix integrations/n8n
npm run build
mkdir -p verification
```

On a disposable Linux runner with permission to create network namespaces:

```bash
sudo env "PATH=$PATH" unshare --net -- bash -euo pipefail -c '
  ip link set lo up
  ip address add 93.184.216.34/32 dev lo
  ip -j address show > verification/network.json
  ip -j route show table all > verification/routes.json
  node scripts/verify-vercel.mjs > verification/vercel.json
  node integrations/n8n/verify.mjs > verification/n8n.json
'
```

If namespace creation is unavailable, use the direct-only commands in the
README. Do not remove the isolation check to get a full run.

## Evidence and dependency review

[The recorded Node 22 and 24 results](evidence/2026-10-14-c731faa/README.md)
retain the original JSON, controls, environment, and network inventory for
source head `c731faa`. No protected request reached the internal service in
that run. Unsupported cases and failures without a named policy are retained
as distinct verdicts.

The [CI workflow](../.github/workflows/ci.yml) runs both integrations on Node 22
and 24. Artifacts named `integration-verification-node<version>-<commit>` contain
the measured JSON, environment, network inventory, installed versions, and n8n
audit report. JSON includes package versions checked against the installation,
lockfile SHA-256, explicit configuration, positive controls, and negative controls.
Artifacts are retained for 14 days. Check the workflow conclusion before using
an artifact as a passing result, since failed jobs also upload evidence.

n8n's dependencies are separate from the main harness installation. The exact
research fixture contains known dependency advisories, documented in
[the dependency policy](DEPENDENCY_POLICY.md). A passing audit gate means no
unreviewed advisory, not zero vulnerabilities. Those pre-existing advisories
are not discoveries made by this comparison.
