import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const FIXTURE = { 'ssrf-agent': '1.0.5', ip: '1.1.9' }
const IP_ADVISORY = 'https://github.com/advisories/GHSA-2p57-rm9w-gvfp'

// Only this exact, intentionally vulnerable research fixture is excepted.
// A new advisory, version change, or any toolchain finding fails the gate.
export function validateAudit(report, lock) {
  if (!report || report.error || !report.metadata ||
      !report.vulnerabilities || typeof report.vulnerabilities !== 'object' ||
      Array.isArray(report.vulnerabilities)) throw new Error('Invalid npm audit report')
  for (const [name, version] of Object.entries(FIXTURE)) {
    if (lock?.packages?.[`node_modules/${name}`]?.version !== version) {
      throw new Error(`Research fixture changed: ${name}; review the exception`)
    }
  }
  const entries = Object.entries(report.vulnerabilities)
  if (report.metadata.vulnerabilities?.total !== entries.length) {
    throw new Error('Audit totals do not match the reported package entries')
  }
  for (const [name, item] of entries) {
    if (!Object.hasOwn(FIXTURE, name) || item.name !== name ||
        item.severity !== 'high' || !Array.isArray(item.via) || item.via.length !== 1 ||
        !Array.isArray(item.nodes) || item.nodes.length !== 1 ||
        item.nodes[0] !== `node_modules/${name}`) {
      throw new Error(`Unreviewed dependency finding: ${name}`)
    }
    const via = item.via[0]
    if (name === 'ip' ? via?.url !== IP_ADVISORY : via !== 'ip') {
      throw new Error(`Unreviewed advisory for ${name}`)
    }
  }
  return entries.map(([name]) => name)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = JSON.parse(readFileSync(process.argv[2] ?? 'verification/dependency-audit.json', 'utf8'))
    const lock = JSON.parse(readFileSync(process.argv[3] ?? 'package-lock.json', 'utf8'))
    const names = validateAudit(report, lock)
    console.log(names.length
      ? `Audit gate passed: only reviewed research-fixture findings (${names.join(', ')}). This is NOT a zero-vulnerability audit.`
      : 'Audit gate passed: no reported dependency findings.')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
