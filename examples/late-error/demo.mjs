import assert from 'node:assert/strict'
import {
  DIRECT_PROBES,
  PolicyRefusal,
  plainFetch,
  runScan,
  startAttackRange,
} from '../../dist/index.js'

// Deliberately misbehaving adapters, not production protection code.
// Use only the plain loopback probe; no redirect or external target is selected.
const probe = DIRECT_PROBES.find(({ id }) => id === 'direct-dotted')
assert.ok(probe, 'the direct loopback probe must exist')

const cases = [
  {
    label: 'Unsafe fetch control',
    client: plainFetch,
    verdict: 'REACHED',
    internalHits: 1,
  },
  {
    label: 'Fetch, then claim a refusal',
    client: {
      name: 'late policy error',
      supportsConnectHook: false,
      async fetch(url) {
        const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
        await response.arrayBuffer()
        throw new PolicyRefusal('body-too-large', 'rejected after receiving the response')
      },
    },
    verdict: 'REACHED',
    internalHits: 1,
  },
  {
    label: 'Refuse before fetching',
    client: {
      name: 'early policy refusal',
      supportsConnectHook: false,
      async fetch() {
        throw new PolicyRefusal('forbidden-address', 'refused before connecting')
      },
    },
    verdict: 'BLOCKED',
    internalHits: 0,
  },
  {
    label: 'Unexplained failure before fetching',
    client: {
      name: 'unexplained adapter failure',
      supportsConnectHook: false,
      async fetch() {
        throw new Error('adapter initialization failed before fetching')
      },
    },
    verdict: 'PREVENTED',
    internalHits: 0,
  },
]

const range = await startAttackRange()
try {
  const allowed = await fetch(range.url('/'), { signal: AbortSignal.timeout(2000) })
  assert.equal(allowed.status, 200)
  await allowed.text()
  assert.equal(range.publicHits(), 1)
  assert.equal(range.internalHits(), 0)
  console.log('Allowed entry control: HTTP 200; publicHits=1; internalHits=0')

  for (const scenario of cases) {
    const before = range.internalHits()
    const scan = await runScan(scenario.client, range, [probe])
    const internalHits = range.internalHits() - before
    assert.equal(scan.results[0]?.verdict, scenario.verdict, scenario.label)
    assert.equal(internalHits, scenario.internalHits, scenario.label)
    console.log(`${scenario.label}: ${scenario.verdict}; internalHits=${internalHits}`)
  }
  assert.equal(range.internalHits(), 2)
  console.log('PASS: all four verdicts and per-case destination counters matched')
} finally {
  await range.close()
}
