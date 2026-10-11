import { PolicyRefusal, type HttpClient } from '../adapters/types.js'
import type { AttackRange } from '../range/server.js'
import { PROBES, type Probe } from './probes.js'

/**
 * What one probe learned about one client.
 *
 * `LUCKY` is the verdict that this whole tool exists for. The request failed,
 * the client has no control, and the difference is invisible in a log.
 */
export type Verdict = 'BLOCKED' | 'PREVENTED' | 'REACHED' | 'LUCKY' | 'NOT-APPLICABLE'

export interface ProbeResult {
  readonly probeId: string
  readonly title: string
  readonly verdict: Verdict
  readonly note: string
  readonly durationMs: number
}

export interface ScanResult {
  readonly client: string
  readonly results: readonly ProbeResult[]
  readonly blocked: number
  readonly prevented: number
  readonly reached: number
  readonly lucky: number
  readonly notApplicable: number
}

export async function runScan(
  client: HttpClient,
  range: AttackRange,
  probes: readonly Probe[] = PROBES,
): Promise<ScanResult> {
  const results: ProbeResult[] = []
  for (const probe of probes) {
    results.push(await runProbe(client, range, probe))
  }

  const count = (verdict: Verdict): number =>
    results.filter((row) => row.verdict === verdict).length

  return {
    client: client.name,
    results,
    blocked: count('BLOCKED'),
    prevented: count('PREVENTED'),
    reached: count('REACHED'),
    lucky: count('LUCKY'),
    notApplicable: count('NOT-APPLICABLE'),
  }
}

async function runProbe(client: HttpClient, range: AttackRange, probe: Probe): Promise<ProbeResult> {
  const started = Date.now()
  const hitsBefore = range.internalHits()
  const hitInternal = (): boolean =>
    probe.internalTarget === true && range.internalHits() > hitsBefore
  const missed = (): boolean =>
    probe.internalTarget === true && range.internalHits() === hitsBefore
  const finish = (verdict: Verdict, note: string): ProbeResult => ({
    probeId: probe.id,
    title: probe.title,
    verdict,
    note,
    durationMs: Date.now() - started,
  })

  if (probe.needsConnectHook === true && !client.supportsConnectHook) {
    return finish('NOT-APPLICABLE', 'the client exposes no hook on the address it connects to')
  }

  try {
    // The range itself lives on loopback. Without this the guards refuse the
    // entry URL and every probe passes while testing nothing.
    const outcome = await client.fetch(probe.start(range), {
      trustedOrigin: range.origin,
      ...(probe.options?.(range) ?? {}),
    })
    // SSRF has already happened if the internal service saw the request,
    // even when an adapter drops the body or omits the canary from its result.
    if (hitInternal()) {
      return finish('REACHED', 'the internal service recorded a request, independent of the returned body')
    }
    if (probe.reached(outcome)) {
      return finish('REACHED', describeReach(outcome.status, outcome.bytesRead, outcome.stoppedByHarness))
    }
    if (missed()) {
      return finish('PREVENTED', 'no refusal, and the internal service saw no request')
    }
    return finish('LUCKY', `no refusal; status ${outcome.status}, ${outcome.bytesRead} bytes`)
  } catch (error) {
    // A late body cap, timeout, or network error cannot undo an internal hit.
    // Independent server-side evidence takes priority over a client's claim.
    if (hitInternal()) {
      return finish('REACHED', 'the internal service recorded a request before the client reported an error')
    }
    if (error instanceof PolicyRefusal) {
      return finish('BLOCKED', `${error.reason}: ${error.detail}`)
    }

    const failure = error instanceof Error ? error : new Error(String(error))
    const detail = flatten(failure)
    if (probe.recognizes?.(detail) === true) {
      return finish('BLOCKED', `the client's own limit: ${detail}`)
    }
    if (missed()) {
      return finish('PREVENTED', `the internal service saw no request; the attempt failed with ${detail}`)
    }
    return finish('LUCKY', `no policy; the request failed with ${detail}`)
  }
}

/**
 * Flatten an error and its causes into one line.
 *
 * Node's fetch reports "fetch failed" and keeps the reason in `cause`, so a
 * check that reads only the message cannot tell a redirect cap from a DNS
 * failure.
 */
function flatten(error: Error): string {
  const parts: string[] = []
  let current: unknown = error

  while (current instanceof Error && parts.length < 4) {
    parts.push(codeOf(current))
    current = (current as { cause?: unknown }).cause
  }

  return parts.join(' <- ')
}

function describeReach(status: number, bytes: number, stoppedByHarness: boolean): string {
  const base = `status ${status}, ${bytes} bytes`
  return stoppedByHarness ? `${base}; the harness had to stop the read` : base
}

function codeOf(error: Error): string {
  const code = (error as NodeJS.ErrnoException).code
  return code ?? error.message
}
