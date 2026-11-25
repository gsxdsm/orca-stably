import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { installHermesBuiltinPolyfills } from './hermes-builtin-polyfills'

// A fresh realm stripped to what Hermes V1 260318099.0.5 ships, so the fallbacks run instead of Node's natives.
function hermesLikeRealm(): typeof globalThis {
  const realm: typeof globalThis = runInNewContext('globalThis')
  const typedArrayPrototype: Int8Array = Object.getPrototypeOf(realm.Int8Array.prototype)
  Reflect.deleteProperty(realm.Array.prototype, 'toSorted')
  Reflect.deleteProperty(realm.Array, 'fromAsync')
  for (const name of ['toSorted', 'toReversed', 'with']) {
    Reflect.deleteProperty(typedArrayPrototype, name)
  }
  installHermesBuiltinPolyfills(realm)
  return realm
}

const run = (realm: typeof globalThis, code: string): unknown => runInNewContext(code, realm)

// Errors may come from either realm, so match the constructor by name.
function errorName(action: () => unknown): string | undefined {
  try {
    action()
  } catch (error) {
    return typeof error === 'object' && error !== null && 'name' in error
      ? String(error.name)
      : undefined
  }
  return undefined
}

describe('installHermesBuiltinPolyfills', () => {
  it('installs non-enumerable, spec-shaped methods only where missing', () => {
    const realm = hermesLikeRealm()
    const typedArrayPrototype: Int8Array = Object.getPrototypeOf(realm.Int8Array.prototype)
    for (const [owner, name, length] of [
      [realm.Array.prototype, 'toSorted', 1],
      [realm.Array, 'fromAsync', 1],
      [typedArrayPrototype, 'toSorted', 1],
      [typedArrayPrototype, 'toReversed', 0],
      [typedArrayPrototype, 'with', 2]
    ] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(owner, name)
      expect(descriptor).toMatchObject({ enumerable: false, writable: true, configurable: true })
      const method: unknown = descriptor?.value
      expect(typeof method === 'function' && [method.name, method.length]).toEqual([name, length])
    }
    expect(run(realm, 'Object.keys(Array.prototype).length')).toBe(0)

    const native = Array.prototype.toSorted
    installHermesBuiltinPolyfills(globalThis)
    expect(Array.prototype.toSorted).toBe(native)
  })

  it('Array.prototype.toSorted copies, fills holes and leaves the source alone', () => {
    const realm = hermesLikeRealm()
    expect(
      run(
        realm,
        `const source = [3, , 1, undefined, 2]
        const sorted = source.toSorted()
        JSON.stringify([sorted.length, 1 in sorted, sorted.slice(0, 3), source[0], Array.isArray(sorted)])`
      )
    ).toBe('[5,true,[1,2,3],3,true]')
    expect(
      run(realm, `JSON.stringify(Array.prototype.toSorted.call({ length: 2, 0: 'b', 1: 'a' }))`)
    ).toBe('["a","b"]')
    expect(run(realm, 'JSON.stringify([1, 10, 2].toSorted((a, b) => b - a))')).toBe('[10,2,1]')
    expect(errorName(() => run(realm, '[1].toSorted(null)'))).toBe('TypeError')
  })

  it('TypedArray toSorted, toReversed and with return a fresh same-type copy', () => {
    const realm = hermesLikeRealm()
    expect(
      run(
        realm,
        `class Sub extends Uint8Array {}
        const source = new Sub([3, 1, 2])
        const results = [source.toSorted(), source.toReversed(), source.with(-1, 9)]
        JSON.stringify([...results.map((r) => [r.constructor.name, Array.from(r)]), Array.from(source)])`
      )
    ).toBe('[["Uint8Array",[1,2,3]],["Uint8Array",[2,1,3]],["Uint8Array",[3,1,9]],[3,1,2]]')
    expect(run(realm, 'new BigInt64Array([1n]).with(0, 5n)[0]')).toBe(5n)
    expect(errorName(() => run(realm, 'new Int8Array(2).with(2, 0)'))).toBe('RangeError')
    expect(errorName(() => run(realm, 'new BigInt64Array(1).with(0, 1)'))).toBe('TypeError')
    expect(errorName(() => run(realm, 'Uint8Array.prototype.toSorted.call([1])'))).toBe('TypeError')
  })

  it('Array.fromAsync reads async iterables, sync iterables of promises and array-likes', async () => {
    const realm = hermesLikeRealm()
    // Each snippet gets its own block so `const` names do not collide in the shared realm.
    const fromAsync = (code: string): Promise<unknown> => runInNewContext(`{${code}}`, realm)
    await expect(
      fromAsync(
        `Array.fromAsync((async function* () { yield 1; yield 2 })(), (v, i) => v * 10 + i)`
      )
    ).resolves.toEqual([10, 21])
    await expect(fromAsync('Array.fromAsync([Promise.resolve(1), 2])')).resolves.toEqual([1, 2])
    expect(
      await fromAsync(`
        const pending = Promise.resolve(1)
        const iterable = { [Symbol.asyncIterator]: () => { let done = false; return { next: async () => (done ? { done } : ((done = true), { value: pending, done: false })) } } }
        Array.fromAsync(iterable).then((result) => result[0] === pending)`)
    ).toBe(true)
    await expect(
      fromAsync(`Array.fromAsync({ length: 2, 0: Promise.resolve('a'), 1: 'b' })`)
    ).resolves.toEqual(['a', 'b'])
    await expect(fromAsync('Array.fromAsync([1], 5)')).rejects.toMatchObject({ name: 'TypeError' })
    expect(
      await fromAsync(`
        let closed = false
        const iterable = { [Symbol.iterator]: () => ({ next: () => ({ value: 1, done: false }), return() { closed = true; return {} } }) }
        Array.fromAsync(iterable, () => { throw new Error('stop') }).catch(() => closed)`)
    ).toBe(true)
  })
})
