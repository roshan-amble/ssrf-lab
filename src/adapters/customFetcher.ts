import { PolicyRefusal, type HttpClient } from './types.js'

/** Import the application's real fetcher without changing its destination policy. */
export interface CustomFetcherModule {
  name?: string
  fetchUrl(url: string, options: { signal: AbortSignal; timeoutMs: number }): Promise<Response> | Response
  classifyRefusal?(error: unknown): 'forbidden-address' | undefined
  close?(): Promise<void> | void
}

const SAMPLE_BYTES = 4096
const MAX_READ_BYTES = 64 * 1024

export function adaptFetcher(module: CustomFetcherModule): HttpClient {
  if (typeof module.fetchUrl !== 'function') {
    throw new TypeError('Export fetchUrl(url, options) from your module')
  }
  for (const key of ['classifyRefusal', 'close'] as const) {
    if (module[key] !== undefined && typeof module[key] !== 'function') {
      throw new TypeError(`Optional export ${key} must be a function`)
    }
  }
  if (module.name !== undefined && typeof module.name !== 'string') {
    throw new TypeError('Optional export name must be a string')
  }
  return {
    name: module.name ?? 'custom application fetcher',
    supportsConnectHook: false,
    supportsLoopbackOrigin: false,
    async fetch(url) {
      const controller = new AbortController()
      const timeoutMs = 5000
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        let response: Response
        try {
          response = await module.fetchUrl(url, { signal: controller.signal, timeoutMs })
        } catch (error) {
          // The harness's deadline must never be credited to the application.
          if (controller.signal.aborted) throw new Error('Harness deadline expired')
          if (module.classifyRefusal?.(error) === 'forbidden-address') {
            throw new PolicyRefusal('forbidden-address', 'the application reported an explicit address-policy refusal')
          }
          throw error
        }
        if (!response || typeof response.status !== 'number' ||
            (response.body != null && typeof response.body.getReader !== 'function')) {
          throw new TypeError('fetchUrl must return a fetch-compatible Response')
        }
        let bytesRead = 0
        let sample = Buffer.alloc(0)
        reader = response.body?.getReader()
        if (reader) {
          const bodyReader = reader
          controller.signal.addEventListener('abort', () => {
            void bodyReader.cancel().catch(() => {})
          }, { once: true })
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read()
            if (done) break
            bytesRead += value.byteLength
            if (sample.length < SAMPLE_BYTES) {
              sample = Buffer.concat([sample, value.subarray(0, SAMPLE_BYTES - sample.length)])
            }
            if (bytesRead > MAX_READ_BYTES) throw new Error('Harness response limit exceeded')
          }
        }
        if (controller.signal.aborted) throw new Error('Harness deadline expired')
        return { status: response.status, bytesRead, bodySample: sample.toString('utf8'), hops: [], stoppedByHarness: false }
      } finally {
        clearTimeout(timer)
        await reader?.cancel().catch(() => {})
        controller.abort()
      }
    },
  }
}
