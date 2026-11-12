# Microsoft AntiSSRF contribution evidence, 2026-10-19

This verifies a one-file Node.js functional-test contribution. It is not an
upstream submission, maintainer acceptance, adoption of ssrf-lab, or a new
vulnerability finding. The candidate uses the upstream project's existing
dependencies and adds no production dependency on the harness.

## Source and provenance

- Upstream: [`55d49acd9028e1190f665962d1b87d76993b2dd8`](https://github.com/microsoft/AntiSSRF/tree/55d49acd9028e1190f665962d1b87d76993b2dd8).
- Candidate: [`0426cc35d9b28615810414c819cc2323740a0a4e`](https://github.com/roshan-amble/AntiSSRF/commit/0426cc35d9b28615810414c819cc2323740a0a4e).
- [Verification run 39339441521](https://github.com/roshan-amble/ssrf-lab/actions/runs/39339441521).
- Verification head: `fbc5111bbab80d941d3ccaa711e039aeba0829cb`.
- GitHub PR merge ref used by the runner: `e99a0c629d91c7044c3b03201863a39b26077fb6`.
- [Artifact IDs, verified ZIP SHA-256 values and extracted file digests](provenance.json).

Every artifact ZIP was checked against GitHub's reported digest before
extraction. JSON reports are unedited; log files retain their bytes with a
`.txt` extension. All fixtures in the new test use loopback literals and
ephemeral ports. See the [test configuration and reproduction notes](../../../integrations/microsoft-antissrf/README.md).

## Offline verification

The new test ran inside a fresh Linux network namespace with only loopback
enabled. Each runtime passed all 17 checks. Removing the protected agent made
all seven refusal checks fail specifically because the internal fixture
recorded a request.

| Runtime | New checks | Guard-removal failures | Reports |
| --- | --- | --- | --- |
| Node 20.20.2 | 17 passed | 7 expected failures | [Passing run](node20-local.json) · [Guard removed](node20-guard-removal.json) |
| Node 22.23.3 | 17 passed | 7 expected failures | [Passing run](node22-local.json) · [Guard removed](node22-guard-removal.json) |
| Node 24.21.0 | 17 passed | 7 expected failures | [Passing run](node24-local.json) · [Guard removed](node24-guard-removal.json) |
| Node 25.9.0 | 17 passed | 7 expected failures | [Passing run](node25-local.json) · [Guard removed](node25-guard-removal.json) |

Build, source lint and formatting of the new test passed on all four runtimes.
The checks include successful allowed entry and redirect requests, a measured
unsafe control for each selected case, seven explicit policy refusals with no
internal hit, and a deliberately late policy error that cannot hide reach.

## Complete upstream suite on Node 24

| Source / run | Full test command | Package tests | Logs |
| --- | --- | --- | --- |
| Unchanged upstream | 299 passed | 3 passed | [Full suite](baseline-full-suite.txt) · [Package](baseline-prepublish.txt) |
| Candidate, initial attempt | 309 passed, 7 failed | Not run after suite failure | [Full suite](candidate-attempt1-full-suite.txt) |
| Same candidate, one job retry | 316 passed | 3 passed | [Full suite](candidate-retry-full-suite.txt) · [Package](candidate-retry-prepublish.txt) |

The seven initial failures were existing `HttpsAgent Tests - other methods`
disallowed-request cases against the live Azure fixture. No candidate source
changed before the retry. That retry passed all 299 existing tests plus the
17 added checks, then passed packaging and pre-publish tests. The initial
failure is retained rather than omitted. The different outcomes are consistent
with the live fixture/DNS sensitivity of those tests; the precise cause was
not established by this run.

The local development environment separately produced 63 baseline passes and
50 baseline failures, including external `EAI_AGAIN` DNS errors. The clean-runner
comparison above is the full-suite verification evidence.

## Limits

The test policy explicitly permits plaintext HTTP and the entry address
`127.0.0.2`. The internal `127.0.0.1` listener remains blocked by
`ExternalOnlyLatest`. This is bounded test configuration, not a test of an
unmodified default policy. The contribution does not assess DNS rebinding,
TLS, all private ranges or every HTTP client.

Codex assisted with implementation, testing and documentation.
