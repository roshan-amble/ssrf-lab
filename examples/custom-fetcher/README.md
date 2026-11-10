# Test your application's fetcher

Use this example when a Node.js application fetches user-supplied URLs, such as
link previews, URL imports or webhook destinations. It checks whether requests
actually reached a local internal service, including when the fetcher throws
after connecting.

## Use the packaged CLI (next release)

The next npm release includes the custom-fetcher runner. The currently
published `ssrf-lab@0.1.0` provides the built-in demo, not the `check` command.
Until that release is published, use the source-build command below or the
existing example runner. No change to the production fetcher is required.

Your module imports the application's real fetch function and, if available,
its explicit address-policy error type. For example, adapt these import paths
and names to your application's existing exports:

```js
// test/ssrf-fetcher.mjs
import { fetchUrl as applicationFetch, AddressPolicyError } from '../dist/fetcher.js'

export const fetchUrl = (url, options) => applicationFetch(url, options)
export const classifyRefusal = error =>
  error instanceof AddressPolicyError ? 'forbidden-address' : undefined
```

Do not add a blocker in this module. If the application has no explicit refusal
type, omit `classifyRefusal`; an unexplained failure will remain inconclusive.
Build the application first. The module path is resolved from the command's
working directory, and the module's own imports resolve beside that module.
Use compiled JavaScript (`.mjs`, `.js` with the appropriate package type, or
`.cjs` exporting `fetchUrl`); the CLI does not install a TypeScript loader.

From a built ssrf-lab checkout:

```bash
node dist/cli.js check --module /absolute/path/to/your-app/test/ssrf-fetcher.mjs --json
```

The published executable will use the same arguments:
`ssrf-lab check --module ./test/ssrf-fetcher.mjs --json`.
The npm artifact includes the runner and requires no runtime dependencies or
third-party comparison packages. The command loads and executes your local
application code; it does not sandbox that code.

The default smoke test covers seven direct-address cases and first proves
that an unsafe native-fetch control reaches the internal destination. It has
**no successful allowed-request control** and tests no redirects. Even an
always-deny fetcher can pass that limited direct-only check. Use the isolated
run before claiming the application can fetch allowed URLs and reject redirects.

For a disposable Linux environment, install/build the application and harness
before entering the namespace. With the published CLI executable on `PATH`,
the isolated command is:

```bash
sudo env "PATH=$PATH" unshare --net -- bash -euo pipefail -c '
  ip link set lo up
  ip address add 93.184.216.34/32 dev lo
  ssrf-lab check --module ./test/ssrf-fetcher.mjs --isolated --json
'
```

Before publication, replace `ssrf-lab` in that snippet with
`node /absolute/path/to/ssrf-lab/dist/cli.js`. This is the same namespace
requirement as the existing CI example below. Isolation is verified before
the application module is imported. The command does not weaken HTTPS,
hostname or redirect policies to satisfy its allowed-entry control.

The JSON report retains each probe's independent entry/internal hit counts,
the scope, runtime and controls. Argument/import/setup/cleanup failures return
exit `2`; with `--json`, the CLI writes `{ "exitCode": 2, "error": "..." }`
to stdout and a diagnostic to stderr. See the exit-code table below for
completed runs. The module must honor cancellation or its own finite timeout,
complete network work before settling, and release pools/agents in `close()`.

## Run the working example

From the repository root, with Node.js 22.19 or newer:

```bash
npm ci --ignore-scripts
npm run build
node examples/custom-fetcher/check.mjs
```

The included [application module](app-fetch.mjs) calls the pinned
`guarded-fetch@0.1.5`. The direct-only smoke test should report seven named
address refusals, no internal hits from that client, and exit 0. A separate
native-fetch control must reach the internal service before these results count.
Local address behavior varies by operating system; use CI for the isolated run.

Prove that a regression fails the gate:

```bash
node examples/custom-fetcher/check.mjs --unsafe
```

This deliberately uses native fetch with no SSRF policy. Expect `REACHED` and
exit 1. It is a test control, not a suggested application implementation.

## Connect your own code

Copy `app-fetch.mjs` into your application as `test/ssrf-fetcher.mjs`. Replace
its `fetchUrl` implementation with an import of the **same fetch function and
configuration your application uses**, and adapt its own error type in
`classifyRefusal`. Remove the example's guarded-fetch dispatcher and `close`
function if your application does not use them.

The module contract is:

| Export | Contract |
| --- | --- |
| `name` | Optional label in the report. |
| `fetchUrl(url, { signal, timeoutMs })` | Required. Return a fetch-compatible `Response`; preserve the application's redirect and address policy. Honor cancellation or a finite timeout, and finish network work before settling. |
| `classifyRefusal(error)` | Optional. Return `forbidden-address` only for your application's explicit address-policy error; return `undefined` for everything else. |
| `close()` | Optional async cleanup for the application's pools/agents. |

Use an absolute module path or a path relative to your current working directory:

```bash
node /path/to/ssrf-lab/examples/custom-fetcher/check.mjs \
  --module ./test/ssrf-fetcher.mjs --json > ssrf-report.json
```

If your application returns parsed data, import its lower-level HTTP fetcher
that returns a `Response`. This example does not pretend that a fabricated
response exercises your actual HTTP code. It does not support remote services,
browser fetchers, or functions that require the internet to initialize.

Do not add an address blocker to the adapter to make the test green. Map only
real policy errors from the code under test. DNS errors, connection failures,
HTTP status codes and the harness's timeout are not address-policy evidence.
Unknown errors remain `PREVENTED` or `LUCKY`, and do not pass this gate.

## Add the isolated CI check

Use [ssrf-check.yml](ssrf-check.yml) as your application's
`.github/workflows/ssrf-check.yml`, alongside your `test/ssrf-fetcher.mjs`.
The workflow installs and builds both repositories before entering a Linux
network namespace. Adjust the application build command if needed.

The isolated run adds two redirects to the seven direct-address cases. The
entry server uses `93.184.216.34` assigned to **loopback inside the namespace**,
with no external interface or route. The runner verifies this setup before
loading your module. Your application's allowed request must return the real
entry response, and every redirect probe must reach that entry server. A
client that rejects everything cannot pass this check. Native fetch must reach
the internal service both directly and through a redirect.

For a disposable Linux machine with `iproute2`, `unshare` and sudo available,
the same isolated example can be run from the lab repository:

```bash
sudo env "PATH=$PATH" unshare --net -- bash -euo pipefail -c '
  ip link set lo up
  ip address add 93.184.216.34/32 dev lo
  node examples/custom-fetcher/check.mjs --isolated
'
```

The workflow uses a standard GitHub-hosted Ubuntu runner. Do not replace the
namespace with ordinary host networking. If your policy requires HTTPS or an
explicit hostname allowlist, this fixture is not sufficient and should fail
the entry control; do not weaken your application policy just for a pass.

## Read the result

| Exit | Meaning |
| --- | --- |
| `0` | Every selected attack case produced a named address refusal without a contradictory internal hit. |
| `1` | At least one attack reached the internal service. |
| `2` | Setup/control failure, an unexplained failure, or incomplete coverage. Investigate before treating it as protection. |

JSON includes runtime, scope, allowed-entry evidence, native-fetch control,
per-probe entry/internal hit counts, verdicts and the exit code. CI keeps the
report and error log even when the gate fails.

**Scope:** the local smoke test covers seven direct-address cases only. The
isolated CI check covers those plus dotted and decimal loopback redirects.
Neither tests DNS rebinding, TLS, cross-origin credential handling, arbitrary
private-network destinations, or body/timeout policy. See the
[broader integrations](../../docs/INTEGRATIONS.md) for additional coverage.
This is a bounded regression check, not a security certification.
