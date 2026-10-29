# ssrf-lab

Test the Node.js fetcher behind your link previews, URL imports and webhooks.

**A failed HTTP request is not proof that your SSRF defense worked.**

## Quick start

With **Node.js 22.12+**, run the local direct-address demo:

```bash
npx ssrf-lab@0.1.0 scan --client all --suite direct
```

No accounts, API keys or external targets. This compares an unprotected fetcher,
a check-then-connect client and the lab's guarded client against its own local
fixture. Look for `REACHED` on the unprotected client and explicit `BLOCKED`
results on the guarded client. Address behavior can vary by operating system.
Add `--json` for a machine-readable report.

The npm package does not install the third-party comparison packages. These
built-in clients demonstrate the harness; testing your application requires
connecting its actual fetch function.

[Walk through a request that throws after reaching the destination](docs/tutorials/failed-fetch-internal-hit.md).
The runnable example checks the destination's counter independently of the
client's error, with successful-request and refusal controls.

Star this repository to follow new fixtures and adapters.

![ci](https://github.com/roshan-amble/ssrf-lab/actions/workflows/ci.yml/badge.svg)

**10 main SSRF/fetch-safety probes · 7 separate direct-address cases · MIT**

## Try it

| You want to | Start here |
| --- | --- |
| Test your own fetcher | The [custom-fetcher example](examples/custom-fetcher/README.md): an application module, a deliberately unsafe control and a copyable isolated CI workflow (Node.js 22.19+) |
| Run the sample on GitHub, with no local install or secrets | [Create a repository from the starter](https://github.com/roshan-amble/ssrf-lab-starter/generate) and run its Node 22/24 workflow from Actions ([recorded passing and failing runs](https://github.com/roshan-amble/ssrf-lab-starter/tree/main/verification)) |
| Catch regressions in CI | The [reusable GitHub Action](action/README.md) · [step-by-step tutorial](docs/tutorials/node-fetcher-github-actions.md) · [48-second recording](docs/media/ssrf-lab-walkthrough.mp4) ([raw recording and reports](docs/evidence/2026-10-16-action/README.md)) |

For HTTPS test development, the [isolated fixture prototype](examples/https-fixture/README.md)
checks real TLS, independent destination counters and certificate-error controls
against the lab's reference client. Application adapters are a separate step.

## What it found

- **`ssrf-agent` 1.0.5**, the latest release of a package whose stated purpose is
  to prevent SSRF, lets `0.0.0.0` reach loopback, and on macOS also
  `[::ffff:127.0.0.1]`. See the [finding, root cause and disclosure timeline](docs/findings/2026-09-13-ssrf-agent-bypass.md).
- **`@tak-ps/node-safeurl`** has a reproduced redirect-conformance bug, with a
  [tested fix](patches/node-safeurl/README.md) submitted as
  [PR #4](https://github.com/dfpc-coe/node-safeurl/pull/4).
- Recorded trials of [guarded-fetch, linkpeek and Linkwarden](#tested-against)
  on Node 22 and 24.

## Run from source

To reproduce the pinned npm-package comparisons or work on the harness, build
from a clone. Its development dependencies include the comparison packages:

```bash
git clone https://github.com/roshan-amble/ssrf-lab.git
cd ssrf-lab
npm ci
npm run build
node dist/cli.js scan --client libs --suite direct          # add --json for machine-readable output
```

Use an authorized disposable environment; `0.0.0.0` and IPv4-mapped IPv6
behavior can vary by operating system. **The redirect suite also attempts
non-loopback addresses. Run the commands below only with network isolation:**

```bash
# All 10 main probes against the 3 built-in clients
node dist/cli.js scan --client all

# Both suites, nonzero exit on REACHED
node dist/cli.js scan --client guarded --suite all --fail-on-reach
```

`--fail-on-reach` exits 1 for an observed `REACHED`. It does not require every
other result to be `BLOCKED` and is not a security certification.

For the full tests and redirect scans, CI uses a fresh Linux network namespace
with only loopback enabled. This prevents deliberately unsafe clients from
contacting real metadata services or other networks. See
[release verification](docs/RELEASE_VERIFICATION.md) and the
[workflow](.github/workflows/ci.yml) for the exact commands and saved logs.
Standalone npm installations that select a third-party client print the exact
commands to install the required comparison packages when they are missing.

## What it is

Most SSRF material shows 1 payload against 1 endpoint. Production is harder in a
different way: a fetcher has several controls, and a log cannot tell you whether
a request was **refused by a control** or simply **failed on its own**. Those
look identical until the day the network changes and the attack lands.

```
        your client under test
                 │
                 ▼
   ┌──────────────────────────┐        ┌───────────────────────────┐
   │  PUBLIC range            │  302   │  INTERNAL service         │
   │  (stands for the         │ ─────▶ │  answers a canary string  │
   │   internet; the client   │        │  counts every hit         │
   │   is allowed to fetch it)│        │  nothing may reach it     │
   │                          │        └───────────────────────────┘
   │  redirects: loopback,    │
   │  decimal-IP, metadata,   │        ┌───────────────────────────┐
   │  reserved, credentials,  │ ─────▶ │  169.254.169.254          │
   │  endless loop            │        │  198.51.100.1             │
   │  payloads: gzip bomb,    │        │  block external egress!  │
   │  endless body, 1 B/s     │        └───────────────────────────┘
   └──────────────────────────┘
```

Two servers, not one, because a single origin cannot tell a control from an
accident: the client is **allowed** to fetch the public range, so anything that
arrives at the internal service arrived by attack.

## Tested against

Recorded library and application-source trials on Node 22 and 24. Each trial
requires a successful allowed request and a working unsafe control.

| Client | Reproduce and inspect | Measured result |
| --- | --- | --- |
| Vercel Labs' `guarded-fetch` 0.1.6 candidate build | [CI recipe](integrations/guarded-fetch/README.md) · [Raw reports](docs/evidence/2026-10-19-guarded-fetch-source/README.md) | 9 explicit refusals; 0 internal hits |
| `linkpeek` 2.1.5 public `preview()` API | [Trial recipe](integrations/linkpeek/README.md) · [Raw reports](docs/evidence/2026-10-19-linkpeek/README.md) | 8 address/redirect refusals + separate credential rejection; 0 internal hits |
| Linkwarden's shared `safeFetch()` at `952ac45` | [Application fetch recipe](integrations/linkwarden/README.md) · [Raw reports](docs/evidence/2026-10-20-linkwarden/README.md) | 9 explicit refusals; 0 internal hits |

These are tests prepared and run for ssrf-lab, not evidence of maintainer
adoption or endorsements. The [guarded-fetch PR](https://github.com/vercel-labs/guarded-fetch/pull/12)
was closed without merging: the maintainer declined the third-party GitHub
Action because of its trust cost. The recorded trial remains reproducible.
The [linkpeek trial discussion](https://github.com/thegruber/linkpeek/discussions/39#discussioncomment-19046880)
and Linkwarden [test-coverage proposal](https://github.com/linkwarden/linkwarden/issues/1869)
are separate proposals; the Linkwarden coverage is limited to the shared fetch
function. DNS rebinding and TLS are outside these trials. linkpeek's separate
development-dependency audit failure is recorded with its evidence.

## Additional pinned integrations

The harness also exercises Vercel Labs' `guarded-fetch@0.1.5` and the published
outbound networking component used by `n8n@2.43.5`. The n8n integration covers
its request and fetch APIs with SSRF protection both enabled and disabled.
It is a component test, not coverage of every n8n workflow node.

```bash
# Local direct-address cases for guarded-fetch
node dist/cli.js scan --client vercel-guarded --suite direct --json

# Optional n8n component integration, installed separately
npm ci --ignore-scripts --prefix integrations/n8n
node integrations/n8n/verify.mjs --direct-only
```

Their redirect tests require an entry address that the clients actually accept.
CI assigns that address to loopback inside an isolated network namespace,
verifies successful entry requests, and records both servers' hit counters.
Ordinary loopback entry tests are marked `N/A` for these adapters.
See [integration scope and reproduction](docs/INTEGRATIONS.md) for the exact
configuration, limitations, and per-commit evidence artifacts.

An [optional additional group](integrations/community/README.md) compares
`ssrf-safe-fetch@0.1.0`, `ssrf-fetch@0.1.0`, and
`@tak-ps/node-safeurl@1.8.0` with the same independent hit counters. It also
includes a reproduced redirect-conformance bug and a
[tested node-safeurl patch](patches/node-safeurl/README.md), submitted as
[upstream PR #4](https://github.com/dfpc-coe/node-safeurl/pull/4) and awaiting
maintainer review.

## Findings

The direct suite sends a request to a loopback service using 7 address forms,
through npm packages whose stated purpose is to stop SSRF. These are the
published finding's measured results on macOS, with exact versions:

| Package | Version | Result |
| --- | --- | --- |
| [request-filtering-agent](https://www.npmjs.com/package/request-filtering-agent) | 3.2.1 | 7 of 7 blocked |
| [ssrf-req-filter](https://www.npmjs.com/package/ssrf-req-filter) | 1.1.1 | 7 of 7 blocked |
| [ssrf-agent](https://www.npmjs.com/package/ssrf-agent) | 1.0.5 | **5 of 7.** `0.0.0.0` and `[::ffff:127.0.0.1]` reached the internal service |

On a Linux host without IPv6, the mapped case fails with `EAFNOSUPPORT` and
reports `PREVENTED` instead; `0.0.0.0` still reaches the internal service.

```bash
node dist/cli.js scan --client libs --suite direct
```

[![Static screenshot of the recorded Node 22 results: the internal service counted 0, 0, and 2 hits for the three pinned packages.](docs/media/ssrf-lab-results.png)](docs/evidence/2026-10-12-7f8f15f/README.md)

Actual output from isolated CI at [`7f8f15f`](https://github.com/roshan-amble/ssrf-lab/commit/7f8f15f4f3f068c40e3f3c2a0f69a02eff67f684).
[Read the terminal output](docs/evidence/2026-10-12-7f8f15f/node22/demo.txt)
· [Inspect the evidence and original recording](docs/evidence/2026-10-12-7f8f15f/README.md)
· [Verify a release and inspect real CI output](docs/RELEASE_VERIFICATION.md)

Details, root cause, suggested fix, and disclosure timeline:
[docs/findings/2026-09-13-ssrf-agent-bypass.md](docs/findings/2026-09-13-ssrf-agent-bypass.md).
The CVE request remains a request unless and until an assignment is confirmed.

This is a reproduction of a known address-classification weakness, not a claim
of a new attack class. See the related [`ip` advisory, CVE-2024-29415](https://github.com/advisories/GHSA-2p57-rm9w-gvfp).
The earlier [CVE-2021-23718](https://nvd.nist.gov/vuln/detail/CVE-2021-23718)
covers `ssrf-agent` versions **before** 1.0.5; the local results above test 1.0.5.

## The verdicts, and why there are 5

| Verdict | Meaning |
| --- | --- |
| `BLOCKED` | The client named a refusing control, with no contradictory measured internal hit. Evidence for this probe, not proof of complete SSRF protection. |
| `PREVENTED` | No internal request was observed during the probe, but no control was named. Measured with the internal service's hit counter, not inferred solely from an error. |
| `REACHED` | An internal request was observed, the response proved reach, or a fetch-safety limit was exceeded. A later refusal does not erase a measured hit. |
| `LUCKY` | No refusing control or observed successful prevention was established. A network failure alone is not evidence of a security boundary. |
| `N/A` | The adapter lacks a required hook or the selected entry fixture cannot exercise the probe. It does not establish whether the underlying client has its own equivalent protection. |

`LUCKY` is the reason this tool exists. A metadata redirect that fails on a
network without a reachable metadata endpoint is not evidence that the client
blocks that destination. Reachability and provider-side requirements vary.

## The probes

| Probe | The attack | The control it tests |
| --- | --- | --- |
| Redirect into loopback | `302` to the internal service | Judge every hop, not only the first URL |
| Redirect into loopback, as a decimal | `302` to `http://2130706433:PORT/` | Classify the parsed host, never the raw string |
| Redirect that carries credentials | `302` to `http://user:pass@127.0.0.1/` | Refuse the address, and never echo the credentials |
| Redirect into cloud metadata | `302` to `169.254.169.254` | Refuse link-local addresses |
| Redirect into TEST-NET-2 | `302` to `198.51.100.1` | Refuse reserved documentation addresses; this is not an RFC 1918 test |
| Endless redirect chain | `302` to itself | Cap the number of hops |
| Decompression bomb | 64 KiB on the wire, 64 MiB expanded | Count bytes after decompression, while reading |
| Body with no end and no length | chunked, never finishes | Cap received bytes with a running total |
| One byte per second | a response that stays open for hours | One deadline over the whole request |
| DNS rebinding (simulated) | first answer public, every later answer loopback | Judge the address the socket uses |

The separate direct suite exercises 7 local address forms. These are not 17
independent security guarantees; several cases test related behavior.

## The 4 controls in the guarded client

```ts
// 1. every hop is judged, not only the entry URL
for (const hop of redirects) refuseForbiddenLiteral(hop)

// 2. the address is judged where the socket connects, and pinned
const lookup = guardedLookup(base)   // a mixed answer is refused whole

// 3. the cap runs WHILE reading, and counts decompressed bytes
if ((bytes += chunk.length) > maxBytes) throw new PolicyRefusal('body-too-large', …)

// 4. one deadline covers the request AND the body read
const deadline = AbortSignal.timeout(timeoutMs)
```

A socket inactivity timeout is not a whole-request deadline: a slow target can
keep the socket active without finishing the response.

## Use it on your own client

Start with the [runnable fetch-compatible example](examples/custom-fetcher/README.md)
and its [GitHub Actions workflow](examples/custom-fetcher/ssrf-check.yml).
They include real request measurement, positive and negative controls, explicit
error mapping, cleanup and exit codes. Replace one application module to test
your existing fetcher.

For clients that need the lower-level adapter interface:

After building this repository, import `./dist/index.js` from an example file at
the repository root. The adapter shape is illustrated below; replace its `fetch`
body with your own client's implementation.

```ts
import { startAttackRange, runScan, renderTable } from './dist/index.js'

const range = await startAttackRange()

const myClient = {
  name: 'my-fetcher',
  supportsConnectHook: false,
  async fetch(url, options) {
    /* call your fetcher, return { status, bytesRead, bodySample, hops, stoppedByHarness } */
  },
}

try {
  // Full scan: use a network-isolated environment.
  console.log(renderTable(await runScan(myClient, range)))
} finally {
  await range.close()
}
```

Throw `PolicyRefusal(reason, detail)` from your adapter when your client refuses
on purpose. The checker gives the internal hit counter priority over that claim.
Finish or cancel the adapter's network work before settling `fetch`, and do not
share a range between concurrent scans. The counter measures sequential probes;
it is not a per-request correlation system.

## Measured output

A full `scan --client all` at [`d6156ea`](https://github.com/roshan-amble/ssrf-lab/commit/d6156ea),
run on Linux with Node.js 22.22 in a network namespace with only loopback enabled.
Network failures and deadlines vary by environment: here the rebinding probe
reports `PREVENTED` because the namespace had no simulated public address. CI
records each commit's environment, tests, compiled CLI results and a
failing-client negative control as downloadable artifacts. Use those per-commit
artifacts when reporting release results.

```
[+] BLOCKED    the client refused, and named the control that refused
[=] PREVENTED  the attack never arrived, but the client named no control
[!] REACHED    the client arrived, or never stopped reading
[~] LUCKY      nothing refused it; something else failed first
[-] N/A        the client has no hook this probe can use

node-fetch (global, defaults)
-----------------------------
  [!] REACHED    Redirect into loopback                        the internal service recorded a request, independent of the returned body
  [!] REACHED    Redirect into loopback, written as a decimal  the internal service recorded a request, independent of the returned body
  [=] PREVENTED  Redirect that carries credentials             the internal service saw no request; the attempt failed with fetch failed <- cross origin not allowed for request mode "cors"
  [~] LUCKY      Redirect into cloud metadata                  no policy; the request failed with fetch failed <- ENETUNREACH
  [~] LUCKY      Redirect into TEST-NET-2 (reserved)           no policy; the request failed with fetch failed <- ENETUNREACH
  [+] BLOCKED    Endless redirect chain                        the client's own limit: fetch failed <- redirect count exceeded
  [!] REACHED    Decompression bomb                            status 200, 67108864 bytes
  [!] REACHED    Body with no end and no length                status 200, 38614251 bytes; the harness had to stop the read
  [!] REACHED    One byte per second                           status 200, 3 bytes; the harness had to stop the read
  [-] N/A        DNS rebinding (simulated)                     the client exposes no hook on the address it connects to

  1 blocked · 1 prevented · 5 reached · 2 lucky · 1 not applicable

check-then-connect (naive guard)
--------------------------------
  [+] BLOCKED    Redirect into loopback                        forbidden-address: 127.0.0.1 resolved to 127.0.0.1 (loopback)
  [+] BLOCKED    Redirect into loopback, written as a decimal  forbidden-address: 127.0.0.1 resolved to 127.0.0.1 (loopback)
  [+] BLOCKED    Redirect that carries credentials             forbidden-address: 127.0.0.1 resolved to 127.0.0.1 (loopback)
  [+] BLOCKED    Redirect into cloud metadata                  forbidden-address: 169.254.169.254 resolved to 169.254.169.254 (link-local)
  [+] BLOCKED    Redirect into TEST-NET-2 (reserved)           forbidden-address: 198.51.100.1 resolved to 198.51.100.1 (private)
  [+] BLOCKED    Endless redirect chain                        too-many-redirects: more than 3 hops
  [+] BLOCKED    Decompression bomb                            body-too-large: stopped after 1064960 bytes, cap is 1048576
  [+] BLOCKED    Body with no end and no length                body-too-large: stopped after 1048914 bytes, cap is 1048576
  [+] BLOCKED    One byte per second                           deadline: 4000 ms elapsed
  [!] REACHED    DNS rebinding (simulated)                     the internal service recorded a request, independent of the returned body

  9 blocked · 0 prevented · 1 reached · 0 lucky · 0 not applicable

guarded client (this repo)
--------------------------
  [+] BLOCKED    Redirect into loopback                        forbidden-address: 127.0.0.1 is loopback
  [+] BLOCKED    Redirect into loopback, written as a decimal  forbidden-address: 127.0.0.1 is loopback
  [+] BLOCKED    Redirect that carries credentials             forbidden-address: 127.0.0.1 is loopback
  [+] BLOCKED    Redirect into cloud metadata                  forbidden-address: 169.254.169.254 is link-local
  [+] BLOCKED    Redirect into TEST-NET-2 (reserved)           forbidden-address: 198.51.100.1 is private
  [+] BLOCKED    Endless redirect chain                        too-many-redirects: more than 3 hops
  [+] BLOCKED    Decompression bomb                            body-too-large: stopped after 1064960 bytes, cap is 1048576
  [+] BLOCKED    Body with no end and no length                body-too-large: stopped after 1048914 bytes, cap is 1048576
  [+] BLOCKED    One byte per second                           deadline: 4000 ms elapsed
  [=] PREVENTED  DNS rebinding (simulated)                     the internal service saw no request; the attempt failed with ENETUNREACH

  9 blocked · 1 prevented · 0 reached · 0 lucky · 0 not applicable
```

## What this does NOT prove

- **The rebinding probe is simulated.** It swaps answers inside the process with
  an injected resolver. It tests which address a client connects to, not a real
  recursive resolver, DNS cache, or TTL policy.
- **The listeners are loopback; not every destination is.** Unsafe clients can
  attempt metadata, documentation, and simulated-public addresses. The range
  uses plain HTTP, so TLS and `https` to `http` downgrade behavior are untested.
- **`trustedOrigin` is a lab affordance.** The range lives on loopback, so the
  entry origin is exempt from the address rules. Without it a guard refuses the
  range itself and every probe passes while testing nothing. No production
  fetcher should use this exception for untrusted requests.
- **A green scan is not a safe client.** These are bounded tests, not the entire
  class of SSRF attacks, and a deadline can stop a probe without proving address
  validation is correct.

## Design notes

- **Two servers.** The public range stands for the internet and may be fetched.
  The internal service may not. A hit on the internal service is therefore
  always an attack that landed within the isolated, sequential test.
- **A canary and a counter.** The body can prove a hit, while the internal service
  independently counts requests. That catches a hit even if the client drops
  the body or throws afterward. Watching only errors cannot do that.
- **`198.51.100.1`, not `10.0.0.1`.** An early version used `10.0.0.1` and a
  probe reached a real device on the author's own network. The range now points
  at TEST-NET-2, reserved for documentation. This choice is not a substitute for
  network isolation.

## Roadmap

- A real DNS server in the range, so rebinding is measured rather than simulated
- TLS on the range, for scheme-downgrade probes
- Adapters for `axios`, `got` and `undici` with explicit agents
- Native IPv6 targets beyond the direct suite's IPv4-mapped IPv6 case

## License

MIT
