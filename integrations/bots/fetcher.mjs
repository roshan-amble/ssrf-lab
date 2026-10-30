import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const sourceInfo = JSON.parse(readFileSync(new URL('./dist/source.json', import.meta.url), 'utf8'))
assert.equal(sourceInfo.repository, 'tehZevo/bots')
assert.equal(sourceInfo.sourceCommit, '5aa3d5ed96635663f9fbd91c480a0faf510077ae')
assert.equal(sourceInfo.gitBlob, '81999887739fa5ad5a72cc14f30fe71cead2a883')
assert.equal(createHash('sha256').update(readFileSync(new URL('./dist/ssrf.js', import.meta.url))).digest('hex'), sourceInfo.emittedSha256)
const { safeFetch, HostNotAllowedError } = await import('./dist/ssrf.js')

export const name = 'Bots safeFetch(), private-network override off'
export async function fetchUrl(url, { signal, timeoutMs }) {
  assert.notEqual(process.env.BOTS_ALLOW_PRIVATE_NETWORK, '1',
    'The Bots private-network override must be off for this trial')
  // No injected lookup, request, trusted origin, or policy override.
  const response = await safeFetch(url, { signal, timeoutMs })
  // Bots buffers a string body. Preserve it for the harness Response reader.
  return new Response(response.body, { status: response.status, headers: response.headers })
}

export function classifyRefusal(error) {
  if (error instanceof HostNotAllowedError) return 'forbidden-address'
  // Network failures and unrelated exceptions are inconclusive.
  return undefined
}
