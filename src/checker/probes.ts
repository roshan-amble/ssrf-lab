import type { ClientOptions, FetchOutcome } from '../adapters/types.js'
import { BOMB_EXPANDED_BYTES } from '../range/bomb.js'
import { CANARY_INTERNAL_SECRET } from '../range/canaries.js'
import { INTERNAL_PATH, RANGE_PATHS, type AttackRange } from '../range/server.js'
import { flipLookup } from '../util/flipLookup.js'

export interface Probe {
  readonly id: string
  readonly title: string
  /** What the range does. */
  readonly attack: string
  /** What a client must do about it. */
  readonly control: string
  readonly start: (range: AttackRange) => string
  readonly options?: (range: AttackRange) => ClientOptions
  /** True when the outcome shows the client went where it should not have. */
  readonly reached: (outcome: FetchOutcome) => boolean
  /**
   * True when the probe targets the internal service, so the checker can
   * MEASURE whether the attack arrived instead of reading it from an error.
   */
  readonly internalTarget?: boolean
  /**
   * True when an ordinary error is in fact the client's own limit.
   * The argument is the error and its causes, flattened into 1 line.
   */
  readonly recognizes?: (detail: string) => boolean
  readonly needsConnectHook?: boolean
}

const gotSecret = (outcome: FetchOutcome): boolean =>
  outcome.bodySample.includes(CANARY_INTERNAL_SECRET)

/**
 * Address spellings that can reach the local internal service.
 *
 * Several normalize to 127.0.0.1; 0.0.0.0 is an unspecified address and
 * IPv4-mapped IPv6 uses a different address family. These probes need no
 * redirect, so they also test guards applied at the first hop.
 */
export const DIRECT_PROBES: readonly Probe[] = [
  directProbe('direct-dotted', 'Plain 127.0.0.1', (port) => `http://127.0.0.1:${port}`),
  directProbe('direct-decimal', 'Decimal 2130706433', (port) => `http://2130706433:${port}`),
  directProbe('direct-octal', 'Octal 0177.0.0.1', (port) => `http://0177.0.0.1:${port}`),
  directProbe('direct-hex', 'Hexadecimal 0x7f.0.0.1', (port) => `http://0x7f.0.0.1:${port}`),
  directProbe(
    'direct-zero-host',
    'The unspecified address 0.0.0.0',
    (port) => `http://0.0.0.0:${port}`,
  ),
  directProbe(
    'direct-ipv6-mapped',
    'IPv4-mapped IPv6 [::ffff:127.0.0.1]',
    (port) => `http://[::ffff:127.0.0.1]:${port}`,
  ),
  directProbe(
    'direct-credentials',
    'Credentials in front of the host',
    (port) => `http://lab:s3cr3t@127.0.0.1:${port}`,
  ),
]

function directProbe(
  id: string,
  title: string,
  origin: (port: number) => string,
): Probe {
  return {
    id,
    title,
    attack: 'one request straight at the internal service',
    control: 'Classify the parsed address, whatever spelling reached the parser.',
    start: (range) => `${origin(range.internalPort)}${INTERNAL_PATH}`,
    internalTarget: true,
    reached: gotSecret,
  }
}

export const PROBES: readonly Probe[] = [
  {
    id: 'redirect-loopback',
    title: 'Redirect into loopback',
    attack: '302 to http://127.0.0.1:<range>/internal/secret',
    control: 'Judge every hop, not only the first URL.',
    start: (range) => range.url(RANGE_PATHS.redirectLoopback),
    internalTarget: true,
    reached: gotSecret,
  },
  {
    id: 'redirect-decimal-loopback',
    title: 'Redirect into loopback, written as a decimal',
    attack: '302 to http://2130706433:<range>/internal/secret',
    control: 'Classify the parsed host, never the raw string.',
    start: (range) => range.url(RANGE_PATHS.redirectDecimalLoopback),
    internalTarget: true,
    reached: gotSecret,
  },
  {
    id: 'redirect-credentials',
    title: 'Redirect that carries credentials',
    attack: '302 to http://lab:s3cr3t@127.0.0.1:<range>/internal/secret',
    control: 'Refuse the address, and never echo the credentials.',
    start: (range) => range.url(RANGE_PATHS.redirectCredentials),
    internalTarget: true,
    reached: gotSecret,
  },
  {
    id: 'redirect-link-local',
    title: 'Redirect into cloud metadata',
    attack: '302 to http://169.254.169.254/latest/meta-data/',
    control: 'Refuse link-local addresses.',
    start: (range) => range.url(RANGE_PATHS.redirectLinkLocal),
    reached: (outcome) => outcome.status > 0,
  },
  {
    // Keep the ID stable for consumers of existing JSON reports.
    id: 'redirect-private',
    title: 'Redirect into TEST-NET-2 (reserved)',
    attack: '302 to http://198.51.100.1/',
    control: 'Refuse reserved documentation addresses; this is not an RFC 1918 probe.',
    start: (range) => range.url(RANGE_PATHS.redirectPrivate),
    reached: (outcome) => outcome.status > 0,
  },
  {
    id: 'redirect-loop',
    title: 'Endless redirect chain',
    attack: '302 to itself, for ever',
    control: 'Cap the number of hops.',
    start: (range) => range.url(RANGE_PATHS.redirectLoop),
    reached: (outcome) => outcome.status > 0 && outcome.hops.length > 10,
    recognizes: (detail) => /redirect/i.test(detail),
  },
  {
    id: 'decompression-bomb',
    title: 'Decompression bomb',
    attack: 'about 64 KiB on the wire, 64 MiB once expanded',
    control: 'Count bytes AFTER decompression, while reading.',
    start: (range) => range.url(RANGE_PATHS.payloadBomb),
    reached: (outcome) => outcome.bytesRead >= BOMB_EXPANDED_BYTES / 2,
  },
  {
    id: 'endless-body',
    title: 'Body with no end and no length',
    attack: 'chunked response that never finishes',
    control: 'Cap received bytes with a running total.',
    start: (range) => range.url(RANGE_PATHS.payloadEndless),
    reached: (outcome) => outcome.bytesRead > 1024 * 1024 || outcome.stoppedByHarness,
  },
  {
    id: 'slow-drip',
    title: 'One byte per second',
    attack: 'a response that stays open for hours',
    control: 'Bound the whole request with a deadline.',
    start: (range) => range.url(RANGE_PATHS.payloadSlow),
    options: () => ({ timeoutMs: 4000 }),
    reached: (outcome) => outcome.stoppedByHarness || outcome.status === 200,
  },
  {
    id: 'dns-rebind',
    title: 'DNS rebinding (simulated)',
    attack: 'first answer 93.184.216.34, every later answer 127.0.0.1',
    control: 'Judge the address the SOCKET uses, not an earlier answer.',
    needsConnectHook: true,
    internalTarget: true,
    start: (range) => `http://rebind.test:${range.internalPort}${INTERNAL_PATH}`,
    options: () => ({ lookup: flipLookup(['93.184.216.34', '127.0.0.1']) }),
    reached: gotSecret,
  },
]
