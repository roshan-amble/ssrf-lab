# A fetch error can hide an internal request

A URL-fetching test can pass while the request it was meant to prevent has
already happened. This assertion is not enough to establish an SSRF block:

```js
await expect(fetchUrl(url)).rejects.toThrow()
```

The client might throw while reading or processing the response, after the
destination has already received the request. To check that boundary, measure
requests at the destination as well as the client's result.

Here is a small, runnable example using ssrf-lab's real fixture and checker.
It deliberately constructs a client that fetches first and claims a policy
refusal afterward. It is a test of the harness, not a newly discovered bug in
a third-party library.

## Run it

With Node.js 22.12 or later:

```bash
git clone https://github.com/roshan-amble/ssrf-lab.git
cd ssrf-lab
npm ci --ignore-scripts
npm run build
node examples/late-error/demo.mjs
```

After dependency installation, the example only requests the fixture's local
HTTP listeners on `127.0.0.1`. It selects one direct-address probe. There is no
metadata endpoint, external target, DNS rebinding or redirect in this example.

The script asserts the verdict and the change in the internal counter for
each case. It exits with an error if an assertion fails.

## What happens

This is the [recorded output on Node 24.22.1](../evidence/2026-10-29-late-error/output-node24.txt):

```text
Allowed entry control: HTTP 200; publicHits=1; internalHits=0
Unsafe fetch control: REACHED; internalHits=1
Fetch, then claim a refusal: REACHED; internalHits=1
Refuse before fetching: BLOCKED; internalHits=0
Unexplained failure before fetching: PREVENTED; internalHits=0
PASS: all four verdicts and per-case destination counters matched
```

The allowed request checks that the entry fixture can serve a real response.
The unsafe fetch checks that the internal counter detects a request. Those
controls help distinguish a working measurement from a broken test setup.

The late-error client does this:

```js
const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
await response.arrayBuffer()
throw new PolicyRefusal('body-too-large', 'rejected after receiving the response')
```

The caller sees a policy error, but the internal counter has already increased.
ssrf-lab reports `REACHED`. Even a recognizable policy error cannot undo that
request.

The early-refusal client throws `PolicyRefusal('forbidden-address', ...)` before
fetching. The internal counter stays unchanged, so this case is `BLOCKED`.
That client is a fixture for testing classification, not a production URL guard.

The last client also makes no request, but throws an unexplained initialization
error. It is `PREVENTED`: no hit was observed, and no explicit policy refusal
was established. Zero hits alone do not turn that failure into `BLOCKED`.

Each case uses its own counter delta. A request from the unsafe control cannot
be attributed to the later refusal.

## Put the same check around your fetcher

Start with the [custom-fetcher example](../../examples/custom-fetcher/README.md)
and call the function your application actually uses, with its normal policy.
Keep an allowed-request control and an unsafe-client control. Classify only
the application's real policy errors as refusals.

For a first look at the built-in clients, the published package also has a
local direct-address demo:

```bash
npx ssrf-lab@0.1.0 scan --client all --suite direct
```

The larger redirect suites require network isolation. HTTPS-only fetchers and
hostname allowlists need matching fixtures; keep those restrictions intact.
Passing the checks you selected is bounded regression evidence, not a security
certification.

The full example is [examples/late-error/demo.mjs](../../examples/late-error/demo.mjs).
It also runs in the repository's isolated Node 22 and 24 CI jobs.

If you try it with a link preview, URL import or webhook fetcher, an
[issue describing what worked or where setup failed](https://github.com/roshan-amble/ssrf-lab/issues)
would help. Star [ssrf-lab](https://github.com/roshan-amble/ssrf-lab) to follow
new fixtures and adapters.
