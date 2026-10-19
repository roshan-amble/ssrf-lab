# Microsoft AntiSSRF local request-counter contribution

This is a test-only contribution prepared for Microsoft AntiSSRF's Node.js
library. It uses the project's existing Mocha and `follow-redirects`
dependencies, with no production dependency on ssrf-lab.

- Upstream source: [`55d49ac`](https://github.com/microsoft/AntiSSRF/tree/55d49acd9028e1190f665962d1b87d76993b2dd8).
- Candidate: [`0426cc3`](https://github.com/roshan-amble/AntiSSRF/commit/0426cc35d9b28615810414c819cc2323740a0a4e).
- [Draft verification PR in the contributor fork](https://github.com/roshan-amble/AntiSSRF/pull/1).
- [Verification workflow](../../.github/workflows/antissrf-local.yml).

Only `nodejs/tests/FunctionalTests/LocalHttpAgent.test.ts` changes in the
candidate. The existing suite covers address classification, DNS, HTTP agents
and redirects. Its functional tests use public websites; this addition provides
a separate deterministic check with real local target counters. It does not
replace those tests or claim that a DNS-error propagation test is itself wrong.

## What the new test checks

Two loopback listeners use ephemeral ports. The normal `ExternalOnlyLatest`
policy permits plaintext HTTP and explicitly allows only the test entry address
`127.0.0.2`; the internal listener on `127.0.0.1` remains blocked. This fixture
exception is test configuration, not a production recommendation or a test of
an unmodified default policy.

Five direct address forms and two redirects require the library's typed
`AntiSSRFError` with its specific address-policy message, plus zero measured
internal requests. Every selected case has a successful unsafe reach control.
The protected agent must also complete an allowed request and follow an allowed
redirect. A deliberately late policy error cannot hide an already counted hit.

The new file contains 17 checks. Replacing its protected agent with a plain
agent must fail all seven refusal checks specifically because the internal
fixture received a request. The workflow checks these controls on Node 20,
22, 24 and 25 in a loopback-only Linux network namespace. A separate Node 24
comparison runs the complete upstream test command and package checks against
both the unchanged source and candidate. Those jobs are strict; baseline
failures are not converted into successful verification.

## Reproduce

```bash
git clone https://github.com/roshan-amble/AntiSSRF.git consumer
git -C consumer checkout --detach 0426cc35d9b28615810414c819cc2323740a0a4e
cd consumer/nodejs
npm ci --ignore-scripts
npm run build
npm run lint
./node_modules/.bin/mocha --require ts-node/register --no-strip-types \
  --timeout 15000 tests/FunctionalTests/LocalHttpAgent.test.ts
```

For the workflow's offline execution, install first, then run that Mocha
command inside a fresh Linux network namespace with only loopback enabled.
The fixtures require support for binding `127.0.0.2` and connecting to an
IPv4-mapped IPv6 loopback literal. All selected destinations are local literals;
no public DNS, live website or cloud metadata endpoint is needed by the new file.

Local Node 24.19.0 validation passed all 17 checks, TypeScript build, source
lint, changed-file formatting and diff checks. The guard-removal control failed
all seven refusal checks. The unchanged upstream full suite produced 63 passes
and 50 failures in the local environment, including external DNS failures.
Use the recorded clean-runner results when assessing full-suite status.

This contribution does not assess DNS rebinding, TLS, every private address,
or all HTTP clients. No production source, configuration file, manifest or
lockfile changes. It has not been submitted upstream and is not evidence of
maintainer acceptance or external adoption.

Codex assisted with implementation, testing and documentation.
