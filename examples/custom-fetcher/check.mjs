import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { checkFetcher, renderCheckReport } from '../../dist/index.js'

try {
  const { values } = parseArgs({ options: {
    module: { type: 'string' }, isolated: { type: 'boolean', default: false },
    unsafe: { type: 'boolean', default: false }, json: { type: 'boolean', default: false },
  } })
  if (values.module && values.unsafe) throw new Error('Choose either --module or --unsafe')
  const fetcher = values.unsafe
    ? { name: 'native fetch: deliberately unsafe control', fetchUrl: (url, { signal }) => fetch(url, { signal }) }
    : values.module ?? fileURLToPath(new URL('./app-fetch.mjs', import.meta.url))
  const report = await checkFetcher(fetcher, { isolated: values.isolated })
  console.log(values.json ? JSON.stringify(report, null, 2) : renderCheckReport(report))
  process.exitCode = report.exitCode
} catch (error) {
  console.error(`Custom-fetcher check could not establish coverage: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 2
}
