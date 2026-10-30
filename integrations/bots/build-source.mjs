import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import ts from 'typescript'

const sourceCommit = '5aa3d5ed96635663f9fbd91c480a0faf510077ae'
const sourcePath = 'packages/server/src/ssrf.ts'
const gitBlob = '81999887739fa5ad5a72cc14f30fe71cead2a883'
const checkout = process.argv[2]
assert(checkout, 'Pass the path to the pinned Bots Git checkout')
const git = args => execFileSync('git', ['-C', checkout, ...args])
assert.equal(git(['rev-parse', 'HEAD']).toString('utf8').trim(), sourceCommit)
// Read committed bytes, so local edits cannot silently change the measured code.
const bytes = git(['show', `${sourceCommit}:${sourcePath}`])
assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), gitBlob)
const result = ts.transpileModule(bytes.toString('utf8'), {
  fileName: sourcePath,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  reportDiagnostics: true,
})
assert(!result.diagnostics?.some(row => row.category === ts.DiagnosticCategory.Error), 'TypeScript transpilation failed')
const sha256 = input => createHash('sha256').update(input).digest('hex')
const info = {
  repository: 'tehZevo/bots', sourceCommit, sourcePath, gitBlob,
  sourceSha256: sha256(bytes), emittedSha256: sha256(result.outputText),
  typescript: ts.version,
  build: 'TypeScript type erasure only; original Node transports and address policy retained',
  scope: 'One unchanged application module, not a full Bots build',
}
const output = new URL('./dist/', import.meta.url)
mkdirSync(output, { recursive: true })
writeFileSync(new URL('ssrf.js', output), result.outputText)
writeFileSync(new URL('source.json', output), JSON.stringify(info, null, 2) + '\n')
console.log(JSON.stringify(info, null, 2))
