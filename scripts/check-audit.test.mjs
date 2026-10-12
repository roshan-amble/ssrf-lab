import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateAudit } from './check-audit.mjs'

const lock = { packages: {
  'node_modules/ssrf-agent': { version: '1.0.5' },
  'node_modules/ip': { version: '1.1.9' },
} }
function report() {
  return { metadata: { vulnerabilities: { total: 2 } }, vulnerabilities: {
    ip: { name: 'ip', severity: 'high', nodes: ['node_modules/ip'],
      via: [{ url: 'https://github.com/advisories/GHSA-2p57-rm9w-gvfp' }] },
    'ssrf-agent': { name: 'ssrf-agent', severity: 'high', nodes: ['node_modules/ssrf-agent'], via: ['ip'] },
  } }
}
test('allows only the documented fixture advisory', () => {
  assert.deepEqual(validateAudit(report(), lock), ['ip', 'ssrf-agent'])
})
test('also accepts a valid empty audit', () => {
  assert.deepEqual(validateAudit({ metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} }, lock), [])
})
test('rejects toolchain findings', () => {
  const r = report()
  r.vulnerabilities.vitest = { name: 'vitest' }
  r.metadata.vulnerabilities.total = 3
  assert.throws(() => validateAudit(r, lock), /vitest/)
})
test('rejects new advisories even on an excepted package', () => {
  const r = report()
  r.vulnerabilities.ip.via[0].url = 'https://github.com/advisories/NEW'
  assert.throws(() => validateAudit(r, lock), /Unreviewed advisory/)
})
test('rejects a different transitive dependency for ssrf-agent', () => {
  const r = report()
  r.vulnerabilities['ssrf-agent'].via = ['other']
  assert.throws(() => validateAudit(r, lock), /Unreviewed advisory/)
})
test('rejects changed research fixture versions', () => {
  const changed = structuredClone(lock)
  changed.packages['node_modules/ip'].version = '2.0.1'
  assert.throws(() => validateAudit(report(), changed), /fixture changed/)
})
test('rejects missing, failed, and inconsistent reports', () => {
  for (const r of [null, {}, { ...report(), error: {} },
    { ...report(), metadata: { vulnerabilities: { total: 0 } } }]) {
    assert.throws(() => validateAudit(r, lock))
  }
})
