// Exercise the npm artifact from a separate consumer, without dev dependencies.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { isolated: { type: 'boolean', default: false } } })
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const temp = mkdtempSync(join(tmpdir(), 'ssrf-lab-package-'))
const consumer = join(temp, 'consumer app')
const results = []
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 30_000 })
  assert.ifError(result.error)
  return result
}

try {
  mkdirSync(join(consumer, 'test fixtures'), { recursive: true })
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  const pack = run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temp], root)
  assert.equal(pack.status, 0, pack.stderr)
  const [artifact] = JSON.parse(pack.stdout)
  const tarball = join(temp, artifact.filename)
  const install = run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer)
  assert.equal(install.status, 0, install.stderr)
  const packageDir = join(consumer, 'node_modules/ssrf-lab')
  assert(!existsSync(join(packageDir, 'examples')), 'The runner must not depend on repository-only examples')
  assert(!existsSync(join(packageDir, 'scripts')), 'The runner must not depend on repository-only scripts')
  assert(!existsSync(join(consumer, 'node_modules/guarded-fetch')), 'No comparison package should be installed')
  const cli = join(packageDir, 'dist/cli.js')
  const fixtureDir = join(consumer, 'test fixtures')
  writeFileSync(join(fixtureDir, 'application.mjs'), `
import { writeFileSync } from 'node:fs'
export class AddressRefusal extends Error {}
export function protectedFetch(url, { signal }) {
  // This is the consumer test fixture's own policy, outside the harness.
  if (new URL(url).hostname !== '93.184.216.34') throw new AddressRefusal('local destination')
  return fetch(url, { signal })
}
export const classify = error => error instanceof AddressRefusal ? 'forbidden-address' : undefined
export const cleanup = () => writeFileSync('closed.txt', 'closed')
`)
  const modules = {
    protected: `export { protectedFetch as fetchUrl, classify as classifyRefusal, cleanup as close } from './application.mjs'`,
    unsafe: `export const fetchUrl = (url, { signal }) => fetch(url, { signal })`,
    late: `
export const fetchUrl = async (url, { signal }) => {
  const response = await fetch(url, { signal })
  // Let the isolated allowed-entry control complete before testing late errors.
  if (new URL(url).pathname === '/') return response
  await response.text()
  throw new Error('refusal after reading the response')
}
export const classifyRefusal = () => 'forbidden-address'
`,
    unknown: `export const fetchUrl = () => { throw new Error('unexplained network failure') }`,
    denyAll: `
import { AddressRefusal } from './application.mjs'
export { classify as classifyRefusal } from './application.mjs'
export const fetchUrl = () => { throw new AddressRefusal('deny every destination') }
`,
    invalid: `export const fetchUrl = 'not a function'`,
    invalidClassifier: `export const fetchUrl = () => {}; export const classifyRefusal = true`,
    cleanup: `
export { protectedFetch as fetchUrl, classify as classifyRefusal } from './application.mjs'
export const close = () => { throw new Error('cleanup failed') }
`,
    sentry: `
import { writeFileSync } from 'node:fs'
writeFileSync('imported.txt', 'imported')
export const fetchUrl = (url, { signal }) => fetch(url, { signal })
`,
  }
  for (const [name, body] of Object.entries(modules)) writeFileSync(join(fixtureDir, `${name}.mjs`), body)
  function check(name, expectedExit, extra = []) {
    const args = ['check', '--module', `./test fixtures/${name}.mjs`, '--json', ...extra]
    if (values.isolated) args.push('--isolated')
    const result = run(process.execPath, [cli, ...args], consumer)
    assert.equal(result.status, expectedExit, `${name}: ${result.stderr}\n${result.stdout}`)
    const report = JSON.parse(result.stdout)
    assert.equal(report.exitCode, expectedExit)
    results.push({ name, exitCode: report.exitCode, report })
    return report
  }

  const protectedReport = check('protected', 0)
  assert.equal(protectedReport.mode, values.isolated ? 'isolated-address-and-redirect' : 'direct-only')
  assert.equal(protectedReport.scan.blocked, values.isolated ? 9 : 7)
  assert(protectedReport.scan.results.every(row => row.internalHits === 0))
  assert.equal(protectedReport.negativeControl.reached, values.isolated ? 2 : 1)
  assert.equal(readFileSync(join(consumer, 'closed.txt'), 'utf8'), 'closed')
  if (values.isolated) assert(protectedReport.scan.positiveControl.publicHits > 0)
  else assert.equal(protectedReport.scan.positiveControl, null)

  for (const name of ['unsafe', 'late']) {
    const report = check(name, 1)
    assert(report.scan.reached > 0)
    assert(report.scan.results.filter(row => row.verdict === 'REACHED').every(row => row.internalHits > 0))
  }
  const unknown = check('unknown', 2)
  if (values.isolated) assert.match(unknown.error, /unexplained network failure/)
  else {
    assert.equal(unknown.scan.prevented, 7)
    assert(unknown.scan.results.every(row => row.internalHits === 0))
  }
  assert.match(check('invalid', 2).error, /Export fetchUrl/)
  assert.match(check('invalidClassifier', 2).error, /classifyRefusal must be a function/)
  assert.match(check('missing', 2).error, /Cannot find module/)
  assert.match(check('cleanup', 2).error, /cleanup failed/)
  const denyAll = check('denyAll', values.isolated ? 2 : 0)
  if (values.isolated) assert.match(denyAll.error, /explicit address-policy refusal/)
  else assert.equal(denyAll.scan.positiveControl, null)
  assert.match(check('sentry', 2, ['--modul', 'typo']).error, /Unknown option/)
  assert(!existsSync(join(consumer, 'imported.txt')), 'Argument errors must not load the application')

  const noModule = run(process.execPath, [cli, 'check', '--json'], consumer)
  assert.equal(noModule.status, 2)
  assert.match(JSON.parse(noModule.stdout).error, /requires --module/)
  const unknownCommand = run(process.execPath, [cli, 'chekc'], consumer)
  assert.equal(unknownCommand.status, 2)
  assert.match(unknownCommand.stderr, /unknown command/)
  const invalidScan = run(process.execPath, [cli, 'scan', '--suite', 'direct', '--modul', 'typo'], consumer)
  assert.equal(invalidScan.status, 2)
  assert.match(invalidScan.stderr, /Unknown option/)
  const demo = run(process.execPath, [cli, 'scan', '--client', 'guarded', '--suite=direct', '--json'], consumer)
  assert.equal(demo.status, 0, demo.stderr)
  assert.equal(JSON.parse(demo.stdout).scans[0].results.length, 7)

  console.log(JSON.stringify({
    node: process.version,
    artifact: { filename: artifact.filename, shasum: artifact.shasum, integrity: artifact.integrity },
    isolated: values.isolated,
    checks: results,
    existingDemo: 'passed',
    argumentValidation: 'passed',
  }, null, 2))
} finally {
  rmSync(temp, { recursive: true, force: true })
}
