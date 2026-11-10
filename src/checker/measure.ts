import assert from 'node:assert/strict'
import { platform, release } from 'node:os'
import type { HttpClient } from '../adapters/types.js'
import type { AttackRange } from '../range/server.js'
import type { Probe } from './probes.js'
import { runScan, type ProbeResult, type ScanResult, type Verdict } from './run.js'

export interface MeasuredProbeResult extends ProbeResult {
  readonly internalHits: number
  readonly publicHits: number
}

export interface MeasuredScanResult extends ScanResult {
  readonly positiveControl: { status: number; publicHits: number } | null
  readonly results: readonly MeasuredProbeResult[]
}

/** Keep destination evidence even when the fetcher later reports an error. */
export async function measureClient(
  client: HttpClient,
  range: AttackRange,
  probes: readonly Probe[],
  scan = runScan,
  { positiveControl = true, notApplicable = {} }: {
    positiveControl?: boolean
    notApplicable?: Readonly<Record<string, string>>
  } = {},
): Promise<MeasuredScanResult> {
  let control: MeasuredScanResult['positiveControl'] = null
  if (positiveControl) {
    const before = range.publicHits()
    const response = await client.fetch(range.origin)
    assert.equal(response.status, 200, `${client.name}: entry request failed`)
    assert(response.bodySample.includes('/redirect/loopback'), `${client.name}: wrong entry response`)
    assert(range.publicHits() > before, `${client.name}: entry server saw no request`)
    control = { status: response.status, publicHits: range.publicHits() - before }
  }
  const results: MeasuredProbeResult[] = []
  for (const probe of probes) {
    const before = { internal: range.internalHits(), public: range.publicHits() }
    const result: ProbeResult | undefined = Object.hasOwn(notApplicable, probe.id)
      ? { probeId: probe.id, title: probe.title, verdict: 'NOT-APPLICABLE', note: notApplicable[probe.id]!, durationMs: 0 }
      : (await scan(client, range, [probe])).results[0]
    assert(result, `${client.name}: ${probe.id} produced no result`)
    const measured = {
      ...result,
      internalHits: range.internalHits() - before.internal,
      publicHits: range.publicHits() - before.public,
    }
    if (positiveControl && new URL(probe.start(range)).origin === range.origin &&
        result.verdict !== 'NOT-APPLICABLE') {
      assert(measured.publicHits > 0, `${client.name}: ${probe.id} never reached the entry server`)
    }
    results.push(measured)
  }
  const count = (verdict: Verdict): number => results.filter(result => result.verdict === verdict).length
  return {
    client: client.name,
    positiveControl: control,
    results,
    blocked: count('BLOCKED'),
    prevented: count('PREVENTED'),
    reached: count('REACHED'),
    lucky: count('LUCKY'),
    notApplicable: count('NOT-APPLICABLE'),
  }
}

export function environment(): { node: string; platform: string; kernel: string; measuredAt: string } {
  return { node: process.version, platform: platform(), kernel: release(), measuredAt: new Date().toISOString() }
}
