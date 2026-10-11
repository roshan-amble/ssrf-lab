import { describe, expect, it } from 'vitest'
import { PolicyRefusal, type FetchOutcome, type HttpClient } from '../adapters/types.js'
import { startAttackRange, type AttackRange } from '../range/server.js'
import { DIRECT_PROBES } from './probes.js'
import { runScan } from './run.js'

const withoutCanary: FetchOutcome = {
  status: 200,
  bytesRead: 0,
  bodySample: '',
  hops: [],
  stoppedByHarness: false,
}

function measuredRange(): { range: AttackRange; hit: () => void } {
  let hits = 0
  return {
    hit: () => { hits += 1 },
    range: {
      origin: 'http://127.0.0.1:1111',
      port: 1111,
      internalOrigin: 'http://127.0.0.1:2222',
      internalPort: 2222,
      url: (path) => `http://127.0.0.1:1111${path}`,
      internalHits: () => hits,
      close: async () => {},
    },
  }
}

const oneProbe = DIRECT_PROBES.slice(0, 1)

describe('a measured internal hit takes precedence over client claims', () => {
  for (const failure of [
    new PolicyRefusal('body-too-large', 'refused after receiving headers'),
    new Error('connection reset after the internal request'),
  ]) {
    it(`reports REACHED when the client subsequently throws ${failure.name}`, async () => {
      const { range, hit } = measuredRange()
      const client: HttpClient = {
        name: 'hits, then throws',
        supportsConnectHook: false,
        async fetch() {
          hit()
          throw failure
        },
      }
      const scan = await runScan(client, range, oneProbe)
      expect(scan.reached).toBe(1)
      expect(scan.blocked).toBe(0)
      expect(scan.results[0]?.note).toContain('internal service recorded')
    })
  }

  it('reports REACHED even when the client omits the canary from its result', async () => {
    const { range, hit } = measuredRange()
    const client: HttpClient = {
      name: 'hits, drops the body',
      supportsConnectHook: false,
      async fetch() {
        hit()
        return withoutCanary
      },
    }
    const scan = await runScan(client, range, oneProbe)
    expect(scan.reached).toBe(1)
    expect(scan.results[0]?.note).toContain('internal service recorded')
  })

  it('does not attribute a hit from an earlier probe to a later refusal', async () => {
    const { range, hit } = measuredRange()
    let calls = 0
    const client: HttpClient = {
      name: 'first hits, then refuses before connecting',
      supportsConnectHook: false,
      async fetch() {
        calls += 1
        if (calls === 1) {
          hit()
          return withoutCanary
        }
        throw new PolicyRefusal('forbidden-address', 'blocked before connecting')
      },
    }
    const scan = await runScan(client, range, DIRECT_PROBES.slice(0, 2))
    expect(scan.results.map((row) => row.verdict)).toEqual(['REACHED', 'BLOCKED'])
  })

  it('detects a real loopback request followed by a claimed policy refusal', async () => {
    const range = await startAttackRange()
    try {
      const client: HttpClient = {
        name: 'real hit, then late refusal',
        supportsConnectHook: false,
        async fetch(url) {
          const response = await globalThis.fetch(url)
          await response.arrayBuffer()
          throw new PolicyRefusal('body-too-large', 'too late to prevent SSRF')
        },
      }
      const scan = await runScan(client, range, oneProbe)
      expect(range.internalHits()).toBe(1)
      expect(scan.reached).toBe(1)
      expect(scan.blocked).toBe(0)
    } finally {
      await range.close()
    }
  })
})
