import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

export function pinnedVersion(packageJson, expected) {
  const metadata = JSON.parse(readFileSync(packageJson, 'utf8'))
  assert.equal(metadata.version, expected, `${metadata.name}: installed version differs from the measured target`)
  return metadata.version
}

// The npm CLI and pinned integrations use the same counter measurements.
export { measureClient, environment } from '../dist/checker/measure.js'
