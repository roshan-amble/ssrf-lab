import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { adaptFetcher, type CustomFetcherModule } from '../adapters/customFetcher.js'
import { startAttackRange } from '../range/server.js'
import { environment, measureClient, type MeasuredScanResult } from './measure.js'
import { DIRECT_PROBES, PROBES } from './probes.js'
import { renderTable } from './report.js'
import { runScan, type ScanResult } from './run.js'

export interface CustomCheckReport {
  environment: ReturnType<typeof environment>
  mode: 'direct-only' | 'isolated-address-and-redirect'
  scope: { directCases: number; redirectCases: number; dnsRebinding: false; tls: false; bodyLimits: false }
  negativeControl: MeasuredScanResult
  scan: MeasuredScanResult
  exitCode: 0 | 1 | 2
}

/** Unknown prevention is inconclusive, rather than a passing policy check. */
export function gateScan(scan: ScanResult): 0 | 1 | 2 {
  if (scan.results.some(row => row.verdict === 'REACHED')) return 1
  if (scan.results.length === 0 || scan.results.some(row =>
    row.verdict !== 'BLOCKED' || !row.note.startsWith('forbidden-address:'))) return 2
  return 0
}

export async function checkFetcher(
  fetcher: string | CustomFetcherModule,
  { isolated = false }: { isolated?: boolean } = {},
): Promise<CustomCheckReport> {
  // Verify the namespace before loading application code or opening listeners.
  const range = await startAttackRange({ publicAddress: isolated })
  let module: CustomFetcherModule | undefined
  try {
    module = typeof fetcher === 'string'
      ? await import(pathToFileURL(resolve(fetcher)).href) as CustomFetcherModule
      : fetcher
    const client = adaptFetcher(module)
    const redirects = PROBES.filter(probe => ['redirect-loopback', 'redirect-decimal-loopback'].includes(probe.id))
    const probes = isolated ? [...DIRECT_PROBES, ...redirects] : DIRECT_PROBES
    const direct = DIRECT_PROBES[0]!
    const controls = [direct, ...(isolated ? [redirects[0]!] : [])]
    const unsafeClient = adaptFetcher({
      name: 'native fetch control',
      fetchUrl: (url, { signal }) => fetch(url, { signal }),
    })
    const negativeControl = await measureClient(unsafeClient, range, controls, runScan, { positiveControl: isolated })
    assert(negativeControl.results.every(row => row.verdict === 'REACHED' && row.internalHits > 0),
      'Negative control did not reach the internal service')
    const scan = await measureClient(client, range, probes, runScan, { positiveControl: isolated })
    return {
      environment: environment(),
      mode: isolated ? 'isolated-address-and-redirect' : 'direct-only',
      scope: { directCases: DIRECT_PROBES.length, redirectCases: isolated ? redirects.length : 0, dnsRebinding: false, tls: false, bodyLimits: false },
      negativeControl,
      scan,
      exitCode: gateScan(scan),
    }
  } finally {
    try {
      if (typeof module?.close === 'function') await module.close()
    } finally {
      await range.close()
    }
  }
}

export function renderCheckReport(report: CustomCheckReport): string {
  const control = report.scan.positiveControl
  return [
    renderTable(report.scan),
    `\nNegative control: ${report.negativeControl.reached}/${report.negativeControl.results.length} reached, as expected.`,
    control
      ? `Allowed entry: HTTP ${control.status}, ${control.publicHits} measured request(s).`
      : 'Direct-only smoke test. Run --isolated in CI to verify an allowed entry and two redirects.',
    `Gate exit ${report.exitCode}: ${['all selected cases explicitly blocked', 'an internal request was observed', 'inconclusive coverage'][report.exitCode]}.`,
  ].join('\n')
}
