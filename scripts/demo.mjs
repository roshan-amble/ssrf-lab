import { readFileSync, writeFileSync } from 'node:fs'
import { DIRECT_PROBES, requestFilteringAgent, ssrfReqFilter, ssrfAgentClient,
  runScan, startAttackRange } from '../dist/index.js'

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
const clients = [
  ['request-filtering-agent', requestFilteringAgent],
  ['ssrf-req-filter', ssrfReqFilter],
  ['ssrf-agent', ssrfAgentClient],
]
const labels = ['127.0.0.1', 'decimal', 'octal', 'hexadecimal', '0.0.0.0', 'IPv4-mapped IPv6', 'URL credentials']
const columns = ['RFA', 'REQ-FILTER', 'SSRF-AGENT']
const range = await startAttackRange()
const measured = []
try {
  console.log('ssrf-lab | observe the destination, not just the error')
  console.log(`Node ${process.version} | direct suite | local loopback target`)
  for (let i = 0; i < clients.length; i += 1) {
    const [name, client] = clients[i]
    const version = lock.packages[`node_modules/${name}`].version
    console.log(`${columns[i]} = ${name} ${version}`)
    const before = range.internalHits()
    const scan = await runScan(client, range, DIRECT_PROBES)
    measured.push({ package: name, version, internalHits: range.internalHits() - before, scan })
  }
  console.log('\n' + 'Address form'.padEnd(23) + columns.map(x => x.padEnd(15)).join(''))
  console.log('-'.repeat(68))
  DIRECT_PROBES.forEach((probe, i) => {
    const verdicts = measured.map(m => {
      const row = m.scan.results.find(x => x.probeId === probe.id)
      if (!row) throw new Error(`Missing measured result: ${probe.id}`)
      return row.verdict.padEnd(15)
    })
    console.log(labels[i].padEnd(23) + verdicts.join(''))
  })
  console.log('-'.repeat(68))
  console.log('Observed internal hits'.padEnd(23) + measured.map(m => String(m.internalHits).padEnd(15)).join(''))
  console.log('\nREACHED: the internal service received a request.')
  console.log('BLOCKED: a named control refused it, with no observed internal hit.')
  console.log('Seven local cases, not a complete security certification.')
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ node: process.version, measured }, null, 2) + '\n')
} finally {
  await range.close()
}
