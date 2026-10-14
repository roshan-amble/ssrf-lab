# ssrf-agent 1.0.5 reaches loopback through 2 address spellings

This finding was reproduced with [ssrf-lab](../../README.md), an MIT-licensed
local testing harness for SSRF defenses in Node.js HTTP clients. It checks whether
the internal service received a request, even if the client throws afterward.
[Run the local comparison](#reproduce) or
[test your own client](#test-your-own-client).

**Status:** measured on 2026-09-13. See the timeline at the end.
**Package:** [`ssrf-agent`](https://www.npmjs.com/package/ssrf-agent) 1.0.5, the
latest published version. Its stated purpose is "prevent SSRF in http(s)
request".
**Environment:** Node.js 22.13.0, macOS. `ip` 1.1.9 resolved as a dependency.

## What happens

The direct suite sends 1 request to a loopback service, written 7 ways. Two
spellings are allowed through, and the service answers.

| Spelling | ssrf-agent 1.0.5 | request-filtering-agent 3.2.1 | ssrf-req-filter 1.1.1 |
| --- | --- | --- | --- |
| `http://127.0.0.1:PORT` | blocked | blocked | blocked |
| `http://2130706433:PORT` | blocked | blocked | blocked |
| `http://0177.0.0.1:PORT` | blocked | blocked | blocked |
| `http://0x7f.0.0.1:PORT` | blocked | blocked | blocked |
| **`http://0.0.0.0:PORT`** | **reached** | blocked | blocked |
| **`http://[::ffff:127.0.0.1]:PORT`** | **reached** | blocked | blocked |
| `http://user:pass@127.0.0.1:PORT` | blocked | blocked | blocked |

"Reached" is not inferred from an error. The internal service returns a canary
string and counts its requests, so a hit is positive evidence.

## Reproduce

Requires Node.js 22.12 or later. This command runs only the local direct-address
suite. Use a disposable environment; address behavior can vary by operating
system.

```bash
git clone https://github.com/roshan-amble/ssrf-lab.git
cd ssrf-lab
npm ci
npm run build
node dist/cli.js scan --client ssrf-agent --suite direct
```

## Why

`ssrf-agent/index.js` delegates the decision to the `ip` package:

```js
const { isPrivate, isV4Format, isV6Format } = require('ip')

const defaultIpChecker = ip => {
  if (isV4Format(ip) || isV6Format(ip)) return !isPrivate(ip)
  return true
}
```

`ip.isPrivate` matches text against a list of range patterns. Two gaps follow:

1. **`0.0.0.0` is in none of its patterns.** It is not loopback, and it matches
   no private range, so `isPrivate` answers `false`. The operating system then
   routes a connection to `0.0.0.0` to the local host.
2. **The mapped IPv6 form arrives in hex.** Node normalizes
   `[::ffff:127.0.0.1]` to `::ffff:7f00:1` before the agent sees it. The
   package's patterns expect the dotted tail, `^(::f{4}:)?127\.`, so the hex
   form matches nothing.

This is the same class of weakness as
[CVE-2024-29415](https://nvd.nist.gov/vuln/detail/CVE-2024-29415) in the `ip`
package, which names `::fFFf:127.0.0.1` among the addresses it misclassifies.
The point of this note is that the weakness is still reachable through the
latest published `ssrf-agent`, whose whole purpose is to stop it.

## Suggested fix

- Classify the PARSED address, not the text. `ipaddr.js` parses every spelling
  into the same value, which is what `request-filtering-agent` uses.
- Treat `0.0.0.0` and `::` as forbidden. The unspecified address is not public.
- Judge the address the socket is about to use, and re-judge it on the
  `lookup` event. `ssrf-agent` already listens for `lookup`, but it reuses the
  same text-based checker there.

## Test your own client

If you maintain a webhook sender, URL previewer, or another server-side fetcher,
use the [adapter example](../../README.md#use-it-on-your-own-client) to test your
client against the same local attack range. The independent hit counter catches
requests that reach the internal service even when the client later reports an
error.

The [quickstart](../../README.md#quick-start) includes the three-package
comparison and JSON output. The broader harness has 10 main SSRF/fetch-safety
probes plus the separate seven direct-address cases.

**Run full scans only in a Linux network namespace with only loopback enabled**,
following the [isolation instructions](../RELEASE_VERIFICATION.md). The adapter
example runs a full scan. DNS rebinding is simulated, and passing these bounded
tests does not prove complete SSRF protection. This is a testing harness, not a
production protection library.

## Timeline

| Date | Event |
| --- | --- |
| 2026-09-13 | Found and reproduced twice with the direct suite. |
| 2026-09-13 | Published here, with the cause and a suggested fix. |
| 2026-09-13 | Reported to the maintainer by email. |
| 2026-10-10 | No reply after 27 days. This note was public from 2026-09-13, so no embargo applies. |
| 2026-10-10 | Second notice: [welefen/ssrf-agent#4](https://github.com/welefen/ssrf-agent/issues/4). |
| 2026-10-10 | CVE ID requested from MITRE, the CNA of Last Resort, because no CNA covers this package. |
| pending | A CVE ID from MITRE, a reply, or a fix. |

The repository has private vulnerability reporting turned off and no release
since November 2021, so email was the only confidential channel. This note went
up a few hours BEFORE the report was sent, which is the wrong order: the usual
practice is to notify first and publish afterwards. It is recorded here rather
than tidied away.

The root cause is already public as CVE-2024-29415 in the `ip` package, the
package takes about 265 downloads a month, and the attack is 1 alternative
spelling of an address, so the exposure this note adds is small.
