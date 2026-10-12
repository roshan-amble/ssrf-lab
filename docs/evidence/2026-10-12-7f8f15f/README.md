# Recorded demonstration and verification evidence

This snapshot preserves the actual post-merge verification of
[`7f8f15f4f3f068c40e3f3c2a0f69a02eff67f684`](https://github.com/roshan-amble/ssrf-lab/commit/7f8f15f4f3f068c40e3f3c2a0f69a02eff67f684)
from [CI run 38190788567](https://github.com/roshan-amble/ssrf-lab/actions/runs/38190788567),
completed on October 12, 2026 UTC. It is a historical snapshot for this commit.

- [Original MP4 demonstration](../../media/ssrf-lab-demo.mp4)
- [Readable Node 22 terminal output](node22/demo.txt)
- [Original asciicast recording](node22/demo.cast)
- [Measured demo results as JSON](node22/demo.json)
- [Download both runtimes' complete evidence](ssrf-lab-verified-evidence.zip)
- [Original provenance record](provenance.json)

The MP4 renders the real Node 22 pseudo-terminal capture. Output timing is
retained, then the final screen is held to make the total video 18 seconds.
That duration is not a scan-runtime measurement. The README animation is a
1200-pixel-wide, 5 fps conversion of this MP4. It samples the recording's timing;
the original MP4 and asciicast remain available above.

## What the run established

| Check | Node 22.23.3 | Node 24.21.0 |
| --- | --- | --- |
| Clean install, typecheck, build | Passed | Passed |
| Project tests | 53 passed | 53 passed |
| Audit-gate tests | 7 passed | 7 passed |
| Guarded client, both suites | 0 REACHED | 0 REACHED |
| Unsafe-client negative control | Exit 1 and observed REACHED | Exit 1 and observed REACHED |
| Direct demo, independent internal hits | 0 / 0 / 2 | 0 / 0 / 2 |

The hit-count order is `request-filtering-agent` 3.2.1, `ssrf-req-filter` 1.1.1,
then `ssrf-agent` 1.0.5. In the last package, `0.0.0.0` and IPv4-mapped IPv6
reached the local internal service. These seven cases are a bounded comparison;
address behavior can vary by platform. They are not a security certification.

Tests and scans ran in Linux network namespaces with only loopback enabled.
The original `network.txt`, `environment.txt`, and `versions.txt` are in each
runtime's directory inside the archive. The archive also retains the full
ten-probe comparison, direct suite, guarded scans, negative control, test logs,
audit report, demo recordings, and results marker.

The audit snapshots retain two high-severity research-fixture entries (`ip`
and `ssrf-agent`) covered by the specific
[dependency policy](../../DEPENDENCY_POLICY.md). Zero critical entries in those
snapshots does not mean zero vulnerabilities. A simulated-DNS result does not
establish real recursive-DNS or TTL behavior. See
[verification scope](../../RELEASE_VERIFICATION.md#interpretation-and-limitations).

## Integrity and reproduction

The archive and MP4 below are byte-for-byte copies of the preserved artifacts.
The extracted transcript, asciicast, and demo JSON match their hashes in the
original provenance record. That record also names a prior PNG preview that is
not included here; the animated README preview is the derived GIF described above.

| File | SHA-256 |
| --- | --- |
| `ssrf-lab-verified-evidence.zip` | `d578114e94ccd999e1584f256585a68efddc05fbf73903cc5c0a278e63a9300f` |
| `ssrf-lab-demo.mp4` | `0e8f16a9dc0ca6f0352d6d1d3c50dab6e058ba2d1f7213b8da24ea8a7227220a` |

To reproduce the local direct demo, use the clone, install, and build commands
in the [README](../../../README.md), then run `node scripts/demo.mjs`.
For full tests or redirect probes, follow the network isolation instructions in
[release verification](../../RELEASE_VERIFICATION.md). The guarded client and
the range are teaching and testing tools, not a production SSRF-prevention library.
