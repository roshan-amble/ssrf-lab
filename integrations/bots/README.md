# Bots safeFetch counted-request trial

This trial connects the actual `safeFetch()` module from
[tehZevo/bots](https://github.com/tehZevo/bots), pinned at
[`5aa3d5e`](https://github.com/tehZevo/bots/commit/5aa3d5ed96635663f9fbd91c480a0faf510077ae),
to ssrf-lab's independent destination counter. It complements the application
tests added in [Bots PR #465](https://github.com/tehZevo/bots/pull/465).
It is maintained here; Bots has not adopted or endorsed it.

The build reads the committed `packages/server/src/ssrf.ts` Git blob, checks its
identity, and erases TypeScript types. The adapter preserves the real Node HTTP
transport, lookup behavior, redirect logic, and address policy. No production
dependencies are added. `BOTS_ALLOW_PRIVATE_NETWORK=1` is refused, including
for the allowed entry. The unsafe control uses native fetch separately.

## Run

From the ssrf-lab root on Node 22.12+:

```sh
npm ci --ignore-scripts
npm run build
git clone https://github.com/tehZevo/bots.git /tmp/bots-trial-source
git -C /tmp/bots-trial-source checkout --detach 5aa3d5ed96635663f9fbd91c480a0faf510077ae
node integrations/bots/build-source.mjs /tmp/bots-trial-source
```

On Linux with permission to create network namespaces:

```sh
sudo env "PATH=$PATH" unshare --net -- bash -euo pipefail -c '
  ip link set lo up
  ip address add 93.184.216.34/32 dev lo
  node integrations/bots/verify.mjs
'
```

The public-looking address exists on loopback inside the isolated namespace.
The runner verifies that only loopback is enabled and that no external route
exists before opening listeners or importing the application. Do not assign
this address to a normal network interface.

The full trial requires:

- An allowed entry request returning HTTP 200 and incrementing the entry count.
- Seven direct-address cases with explicit application refusals and zero internal hits.
- Two real redirects that reach the allowed entry, then refuse the internal destination with zero internal hits.
- Separate unsafe direct and redirect controls that each increment the internal counter.

Exit 0 means every selected case was explicitly refused; exit 1 means an
internal hit was observed; exit 2 means coverage could not be established.
Reports include source hashes, Node version, per-case counts, and scope.
The [workflow](../../.github/workflows/bots-source.yml) runs the full trial on
Node 22 and 24 and retains its actual output, including failed runs.

## Limited local smoke check

Without network-namespace privileges, run only local direct-address cases:

```sh
node integrations/bots/verify.mjs --direct-only
```

This mode does not establish an allowed request or redirect coverage. Its report
records those omissions. Do not interpret it as a full trial pass.

This is a source-module comparison, not a full Bots application test. It does not
assess DNS rebinding, TLS, response-size limits, Git imports, or the web tool's
error presentation. It does not claim a newly discovered vulnerability.
