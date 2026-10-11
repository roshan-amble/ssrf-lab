# ssrf-lab

**A failed HTTP request is not proof that your SSRF defense worked.**

`ssrf-lab` is a local attack range and conformance checker for Node.js HTTP
clients. It distinguishes an explicit security refusal from a request that
failed for an unrelated reason, using a canary and an independent hit counter.
If the internal service saw the request, a later error cannot make it `BLOCKED`.

![ci](https://github.com/roshan-amble/ssrf-lab/actions/workflows/ci.yml/badge.svg)

**10 main SSRF/fetch-safety probes · 7 separate direct-address cases · MIT · Node.js 22+**

Start with the direct-address comparison: the same local target, three packages
that advertise SSRF protection. No accounts, API keys, or external targets are
needed for this suite.

```bash
git clone https://github.com/roshan-amble/ssrf-lab.git
cd ssrf-lab
npm ci
npm run build
node dist/cli.js scan --client libs --suite direct
```

The direct suite targets the lab's internal service using local address forms.
Use an authorized disposable environment; `0.0.0.0` and IPv4-mapped IPv6 behavior
can vary by operating system. The **full redirect suite also attempts non-loopback
addresses**. Run it only with network isolation, as described below.

[Read the published package finding](docs/findings/2026-09-13-ssrf-agent-bypass.md)
· [Verify a release and inspect real CI output](docs/RELEASE_VERIFICATION.md)

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

## Quick start

After the clean install and build above, these are the compiled CLI commands:

```bash
# Local direct-address comparison (the introductory demo)
node dist/cli.js scan --client libs --suite direct

# Machine-readable results from the same suite
node dist/cli.js scan --client libs --suite direct --json

# In a network-isolated environment only: all 10 main probes, 3 built-in clients
node dist/cli.js scan --client all

# In a network-isolated environment only: both suites, nonzero exit on REACHED
node dist/cli.js scan --client guarded --suite all --fail-on-reach
```

`--fail-on-reach` exits 1 for an observed `REACHED`. It does not require every
other result to be `BLOCKED` and is not a security certification.

For the full tests and redirect scans, CI uses a fresh Linux network namespace
with only loopback enabled. This prevents deliberately unsafe clients from
contacting real metadata services or other networks. See
[release verification](docs/RELEASE_VERIFICATION.md) and the
[workflow](.github/workflows/ci.yml) for the exact commands and saved logs.
The clone-based instructions do not assume this package is published on npm.

## Measured output

The transcript below is a **historical run**, retained for explanation, not a
fresh result for each commit. The updated CI records the actual environment,
tests, compiled CLI results, and a failing-client negative control as downloadable
artifacts. Use those per-commit artifacts when reporting release results.

Network failures and deadlines vary by environment. For example, an isolated
rebinding probe can produce `PREVENTED` instead of the historical deadline
`BLOCKED`. The old transcript also calls TEST-NET-2 a "private range"; the current
probe labels it correctly as reserved documentation space.

```
[+] BLOCKED    the client refused, and named the control that refused
[=] PREVENTED  the attack never arrived, but the client named no control
[!] REACHED    the client arrived, or never stopped reading
[~] LUCKY      nothing refused it; something else failed first
[-] N/A        the client has no hook this probe can use

node-fetch (global, defaults)
-----------------------------
  [!] REACHED    Redirect into loopback                        status 200, 31 bytes
  [!] REACHED    Redirect into loopback, written as a decimal  status 200, 31 bytes
  [=] PREVENTED  Redirect that carries credentials             cross origin not allowed for request mode "cors"
  [~] LUCKY      Redirect into cloud metadata                  no policy; the request failed
  [~] LUCKY      Redirect into a private range                 no policy; the request failed
  [+] BLOCKED    Endless redirect chain                        the client's own limit: redirect count exceeded
  [!] REACHED    Decompression bomb                            status 200, 67108864 bytes
  [!] REACHED    Body with no end and no length                status 200, 34942947 bytes; the harness had to stop the read
  [!] REACHED    One byte per second                           status 200, 3 bytes; the harness had to stop the read
  [-] N/A        DNS rebinding (simulated)                     the client exposes no hook on the address it connects to

  1 blocked · 1 prevented · 5 reached · 2 lucky · 1 not applicable

check-then-connect (naive guard)
--------------------------------
  [+] BLOCKED    Redirect into loopback                        forbidden-address: 127.0.0.1 (loopback)
  [+] BLOCKED    Redirect into loopback, written as a decimal  forbidden-address: 127.0.0.1 (loopback)
  [+] BLOCKED    Redirect that carries credentials             forbidden-address: 127.0.0.1 (loopback)
  [+] BLOCKED    Redirect into cloud metadata                  forbidden-address: 169.254.169.254 (link-local)
  [+] BLOCKED    Redirect into a private range                 forbidden-address: 198.51.100.1 (private)
  [+] BLOCKED    Endless redirect chain                        too-many-redirects: more than 3 hops
  [+] BLOCKED    Decompression bomb                            body-too-large: stopped after 1064960 bytes, cap is 1048576
  [+] BLOCKED    Body with no end and no length                body-too-large: stopped after 1048914 bytes, cap is 1048576
  [+] BLOCKED    One byte per second                           deadline: 4000 ms elapsed
  [!] REACHED    DNS rebinding (simulated)                     status 200, 31 bytes

  9 blocked · 0 prevented · 1 reached · 0 lucky · 0 not applicable

guarded client (this repo)
--------------------------
  [+] BLOCKED    Redirect into loopback                        forbidden-address: 127.0.0.1 is loopback
  [+] BLOCKED    Redirect into loopback, written as a decimal  forbidden-address: 127.0.0.1 is loopback
  [+] BLOCKED    Redirect that carries credentials             forbidden-address: 127.0.0.1 is loopback
  [+] BLOCKED    Redirect into cloud metadata                  forbidden-address: 169.254.169.254 is link-local
  [+] BLOCKED    Redirect into a private range                 forbidden-address: 198.51.100.1 is private
  [+] BLOCKED    Endless redirect chain                        too-many-redirects: more than 3 hops
  [+] BLOCKED    Decompression bomb                            body-too-large: stopped after 1064960 bytes, cap is 1048576
  [+] BLOCKED    Body with no end and no length                body-too-large: stopped after 1048914 bytes, cap is 1048576
  [+] BLOCKED    One byte per second                           deadline: 4000 ms elapsed
  [+] BLOCKED    DNS rebinding (simulated)                     deadline: 3000 ms elapsed

  10 blocked · 0 prevented · 0 reached · 0 lucky · 0 not applicable
```

## Findings

The direct suite sends a request to a loopback service using 7 address forms,
through npm packages whose stated purpose is to stop SSRF. These are the
published finding's measured results, with exact versions:

| Package | Version | Result |
| --- | --- | --- |
| [request-filtering-agent](https://www.npmjs.com/package/request-filtering-agent) | 3.2.1 | 7 of 7 blocked |
| [ssrf-req-filter](https://www.npmjs.com/package/ssrf-req-filter) | 1.1.1 | 7 of 7 blocked |
| [ssrf-agent](https://www.npmjs.com/package/ssrf-agent) | 1.0.5 | **5 of 7.** `0.0.0.0` and `[::ffff:127.0.0.1]` reached the internal service |

```bash
node dist/cli.js scan --client libs --suite direct
```

Details, root cause, suggested fix, and disclosure timeline:
[docs/findings/2026-09-13-ssrf-agent-bypass.md](docs/findings/2026-09-13-ssrf-agent-bypass.md).
The CVE request remains a request unless and until an assignment is confirmed.

## The verdicts, and why there are 5

| Verdict | Meaning |
| --- | --- |
| `BLOCKED` | The client named a refusing control, with no contradictory measured internal hit. Evidence for this probe, not proof of complete SSRF protection. |
| `PREVENTED` | No internal request was observed during the probe, but no control was named. Measured with the internal service's hit counter, not inferred solely from an error. |
| `REACHED` | An internal request was observed, the response proved reach, or a fetch-safety limit was exceeded. A later refusal does not erase a measured hit. |
| `LUCKY` | No refusing control or observed successful prevention was established. A network failure alone is not evidence of a security boundary. |
| `N/A` | This adapter exposes no hook the probe needs. It does not establish whether the underlying client has its own equivalent protection. |

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
