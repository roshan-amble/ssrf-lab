#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { checkThenConnect } from './adapters/checkThenConnect.js'
import { guardedFetch } from './adapters/guardedFetch.js'
import { requestFilteringAgent, ssrfAgentClient, ssrfReqFilter } from './adapters/libraries.js'
import {
  MissingOptionalPackage,
  missingOptionalPackages,
  type OptionalPackage,
} from './adapters/optional.js'
import { plainFetch } from './adapters/plainFetch.js'
import { vercelGuardedFetch } from './adapters/vercelGuardedFetch.js'
import type { HttpClient } from './adapters/types.js'
import { DIRECT_PROBES, PROBES, type Probe } from './checker/probes.js'
import { LEGEND, renderJson, renderTable } from './checker/report.js'
import { runScan, type ScanResult } from './checker/run.js'
import { checkFetcher, renderCheckReport } from './checker/custom.js'
import { startAttackRange } from './range/server.js'

const CLIENTS: Record<string, HttpClient> = {
  plain: plainFetch,
  naive: checkThenConnect,
  guarded: guardedFetch,
  rfa: requestFilteringAgent,
  'ssrf-req-filter': ssrfReqFilter,
  'ssrf-agent': ssrfAgentClient,
  'vercel-guarded': vercelGuardedFetch,
}

/** Clients that compare a package ssrf-lab does not install. */
const REQUIRES: Record<string, readonly OptionalPackage[]> = {
  rfa: ['request-filtering-agent'],
  'ssrf-req-filter': ['ssrf-req-filter'],
  'ssrf-agent': ['ssrf-agent'],
  'vercel-guarded': ['guarded-fetch'],
}

const GROUPS: Record<string, readonly string[]> = {
  all: ['plain', 'naive', 'guarded'],
  libs: ['rfa', 'ssrf-req-filter', 'ssrf-agent'],
}

const SUITES: Record<string, readonly Probe[]> = {
  redirect: PROBES,
  direct: DIRECT_PROBES,
  all: [...PROBES, ...DIRECT_PROBES],
}

const USAGE = `ssrf-lab — run a local attack range against an HTTP client

  ssrf-lab check --module <path> [--isolated] [--json]

  --module         import your application's fetchUrl module, relative to cwd
                   check defaults to a seven-case, direct-only smoke test
  --isolated       check adds two redirects and an allowed-entry control;
                   requires the loopback-only Linux namespace described below

  ssrf-lab scan [--client <name|all|libs>] [--suite redirect|direct|all]
                [--json] [--fail-on-reach] [--public-address]

  --client         all (the 3 built-in clients), libs (the npm SSRF packages),
                   or one of: ${Object.keys(CLIENTS).join(', ')}
                   libs, rfa, ssrf-req-filter, ssrf-agent and vercel-guarded
                   need the compared package installed beside ssrf-lab; the
                   scan prints the install command when one is missing
  --suite          redirect: attacks that start on the public range (default)
                   direct:   one request at the internal service, in every
                             spelling a URL parser accepts
                   all:      both
  --json           print machine-readable results
  --fail-on-reach  exit 1 when any probe reports REACHED
  --public-address use the isolated entry fixture; requires only lo with
                   93.184.216.34/32 and no external routes (Linux only)
`

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h') || argv[0] === undefined) {
    process.stdout.write(USAGE)
    return
  }

  const command = argv.shift()
  if (command === 'check') {
    await check(argv)
    return
  }
  if (command !== 'scan') {
    process.stderr.write(`unknown command: ${command}\n${USAGE}`)
    process.exitCode = 2
    return
  }
  const { values } = parseArgs({ args: argv, options: {
    client: { type: 'string' }, suite: { type: 'string' },
    json: { type: 'boolean' }, 'fail-on-reach': { type: 'boolean' },
    'public-address': { type: 'boolean' },
  } })
  const json = values.json
  const failOnReach = values['fail-on-reach']
  const which = values.client ?? 'all'
  const suiteName = values.suite ?? 'redirect'
  const suite = SUITES[suiteName]
  const names = GROUPS[which] ?? [which]
  const selected = names.map((name) => CLIENTS[name])

  if (suite === undefined) {
    process.stderr.write(`unknown suite: ${suiteName}\n${USAGE}`)
    process.exitCode = 2
    return
  }

  if (selected.some((client) => client === undefined)) {
    process.stderr.write(`unknown client: ${which}\n${USAGE}`)
    process.exitCode = 2
    return
  }

  const missing = await missingOptionalPackages(names.flatMap((name) => REQUIRES[name] ?? []))
  if (missing.length > 0) {
    process.stderr.write(`${new MissingOptionalPackage(missing).message}\n`)
    process.exitCode = 2
    return
  }

  const range = await startAttackRange({ publicAddress: values['public-address'] ?? false })
  const scans: ScanResult[] = []

  try {
    for (const client of selected) {
      if (client === undefined) continue
      scans.push(await runScan(client, range, suite))
    }
  } finally {
    await range.close()
  }

  if (json) {
    process.stdout.write(`${renderJson(scans)}\n`)
  } else {
    process.stdout.write(`${LEGEND}\n`)
    for (const scan of scans) process.stdout.write(`${renderTable(scan)}\n`)
    process.stdout.write('\n')
  }

  if (failOnReach && scans.some((scan) => scan.reached > 0)) process.exitCode = 1
}

async function check(args: string[]): Promise<void> {
  try {
    const { values } = parseArgs({ args, options: {
      module: { type: 'string' }, isolated: { type: 'boolean' }, json: { type: 'boolean' },
    } })
    if (!values.module) throw new Error('check requires --module <path> to your application fetcher')
    const report = await checkFetcher(values.module, { isolated: values.isolated ?? false })
    process.stdout.write(`${values.json ? JSON.stringify(report, null, 2) : renderCheckReport(report)}\n`)
    process.exitCode = report.exitCode
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    if (args.includes('--json')) process.stdout.write(`${JSON.stringify({ exitCode: 2, error: detail })}\n`)
    process.stderr.write(`Custom-fetcher check could not establish coverage: ${detail}\n`)
    process.exitCode = 2
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`)
  const code = (error as NodeJS.ErrnoException).code
  process.exitCode = code?.startsWith('ERR_PARSE_ARGS_') ? 2 : 1
})
