import type { LookupFunction } from 'node:net'
import { describe, expect, it } from 'vitest'
import { flipLookup } from './flipLookup.js'

function resolve(lookup: LookupFunction, all: boolean): Promise<unknown> {
  return new Promise((done, reject) => {
    lookup('rebind.test', { all }, (error, address, family) => {
      if (error) reject(error)
      else done({ address, family })
    })
  })
}

describe('flipLookup', () => {
  it('invokes the callback after the caller can attach request error handlers', async () => {
    const lookup = flipLookup(['93.184.216.34'])
    let returned = false
    const result = new Promise<void>((done, reject) => {
      lookup('rebind.test', { all: true }, (error, addresses) => {
        try {
          expect(returned).toBe(true)
          expect(error).toBeNull()
          expect(addresses).toEqual([{ address: '93.184.216.34', family: 4 }])
          done()
        } catch (failure) {
          reject(failure)
        }
      })
      returned = true
    })
    await result
  })

  it('changes answers per call and retains the final answer', async () => {
    const lookup = flipLookup(['93.184.216.34', '127.0.0.1'])
    expect(await resolve(lookup, false)).toEqual({ address: '93.184.216.34', family: 4 })
    expect(await resolve(lookup, false)).toEqual({ address: '127.0.0.1', family: 4 })
    expect(await resolve(lookup, true)).toEqual({
      address: [{ address: '127.0.0.1', family: 4 }],
      family: undefined,
    })
  })

  it('preserves the IPv6 address family in single-answer mode', async () => {
    expect(await resolve(flipLookup(['::1']), false)).toEqual({ address: '::1', family: 6 })
  })
})
