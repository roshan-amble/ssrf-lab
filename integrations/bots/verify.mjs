import assert from 'node:assert/strict'
import { parseArgs } from 'node:util'
import { DIRECT_PROBES, PROBES, runScan, startAttackRange } from '../../dist/index.js'
import { environment, measureClient } from '../../scripts/integration-evidence.mjs'
import { adaptFetcher, gateScan } from '../../examples/custom-fetcher/adapter.mjs'

let range
try {
  const { values } = parseArgs({ options: { 'direct-only': { type: 'boolean', default: false } } })
  const isolated = !values['direct-only']
  // Verify isolation before importing application code or opening listeners.
  range = await startAttackRange({ publicAddress: isolated })
  const application = await import('./fetcher.mjs')
  const client = adaptFetcher(application)
  const redirects = PROBES.filter(row => ['redirect-loopback', 'redirect-decimal-loopback'].includes(row.id))
  const probes = isolated ? [...DIRECT_PROBES, ...redirects] : DIRECT_PROBES
  const native = adaptFetcher({ name: 'Native fetch unsafe control', fetchUrl: (url, { signal }) => fetch(url, { signal }) })
  const controls = isolated ? [DIRECT_PROBES[0], redirects[0]] : [DIRECT_PROBES[0]]
  const negativeControl = await measureClient(native, range, controls, runScan, { positiveControl: isolated })
  assert(negativeControl.results.every(row => row.verdict === 'REACHED' && row.internalHits > 0),
    'The unsafe control did not prove the destination counter works')
  const scan = await measureClient(client, range, probes, runScan, { positiveControl: isolated })
  const exitCode = gateScan(scan)
  const report = {
    environment: environment(), application: application.sourceInfo,
    mode: isolated ? 'isolated-address-and-redirect' : 'direct-only',
    scope: { directCases: 7, redirectCases: isolated ? 2 : 0, allowedEntry: isolated,
      dnsRebinding: false, tls: false, bodyLimits: false, fullApplication: false },
    negativeControl, scan, exitCode,
  }
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = exitCode
} catch (error) {
  console.error(`Bots trial could not establish coverage: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 2
} finally {
  await range?.close()
}
