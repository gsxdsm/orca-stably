// Built-ins the app's Hermes (V1 260318099.0.5) lacks; calling one throws and takes down the screen.
// structuredClone comes from Expo's winter runtime and queueMicrotask from React Native, so neither is here.
// WeakRef and RegExp.escape stay unpolyfilled (a strong-ref WeakRef would leak); oxlint bans them instead.

type Comparator = ((a: unknown, b: unknown) => number) | undefined

type TypedArrayLike = ArrayLike<unknown> & {
  set(source: ArrayLike<unknown>): void
  sort(compare?: Comparator): unknown
  reverse(): unknown
}

// A built-in constructor or prototype that a polyfill is defined on.
type BuiltinOwner = ArrayConstructor | unknown[] | TypedArrayLike

type IterableOrArrayLike = {
  [Symbol.asyncIterator]?: unknown
  [Symbol.iterator]?: unknown
  length?: unknown
  [index: number]: unknown
}

type TypedArrayConstructor = new (length: number) => TypedArrayLike

type ResultArray = Record<number, unknown> & { length: number }

type ResultArrayConstructor = new (...args: number[]) => ResultArray

type PolyfillTarget = typeof globalThis

const MAX_ARRAY_LENGTH = 2 ** 32 - 1

function defineMissing(target: BuiltinOwner, name: string, value: unknown): void {
  if (name in target) {
    return
  }
  Object.defineProperty(target, name, {
    value,
    writable: true,
    enumerable: false,
    configurable: true
  })
}

function toNumber(value: unknown): number {
  // Number() would accept BigInt, where the spec's ToNumber throws.
  if (typeof value === 'bigint') {
    throw new TypeError('Cannot convert a BigInt value to a number')
  }
  return Number(value)
}

function toIntegerOrInfinity(value: unknown): number {
  const number = toNumber(value)
  if (Number.isNaN(number) || number === 0) {
    return 0
  }
  return Number.isFinite(number) ? Math.trunc(number) : number
}

function lengthOfArrayLike(object: { length?: unknown }): number {
  const length = toIntegerOrInfinity(object.length)
  return length <= 0 ? 0 : Math.min(length, Number.MAX_SAFE_INTEGER)
}

function assertComparator(compare: unknown): asserts compare is Comparator {
  if (compare !== undefined && typeof compare !== 'function') {
    throw new TypeError('The comparison function must be either a function or undefined')
  }
}

function isConstructor(value: unknown): value is ResultArrayConstructor {
  if (typeof value !== 'function') {
    return false
  }
  try {
    Reflect.construct(String, [], value)
    return true
  } catch {
    return false
  }
}

function isIterable(
  value: IterableOrArrayLike
): value is IterableOrArrayLike & (AsyncIterable<unknown> | Iterable<unknown>) {
  return value[Symbol.asyncIterator] != null || value[Symbol.iterator] != null
}

function installArrayToSorted(target: PolyfillTarget): void {
  const nativeSort = target.Array.prototype.sort
  defineMissing(
    target.Array.prototype,
    'toSorted',
    {
      toSorted(this: unknown, compare?: Comparator): unknown[] {
        assertComparator(compare)
        const source: ArrayLike<unknown> = Object(this)
        const length = lengthOfArrayLike(source)
        if (length > MAX_ARRAY_LENGTH) {
          throw new RangeError('Invalid array length')
        }
        const copy = new target.Array<unknown>(length)
        for (let index = 0; index < length; index += 1) {
          copy[index] = source[index]
        }
        return nativeSort.call(copy, compare)
      }
    }.toSorted
  )
}

function installTypedArrayCopyMethods(target: PolyfillTarget): void {
  const typedArrayPrototype: TypedArrayLike = Object.getPrototypeOf(target.Int8Array.prototype)
  const toStringTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get
  const lengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length')?.get
  if (!toStringTag || !lengthGetter) {
    return
  }
  const constructors = new Map<string, TypedArrayConstructor>(
    [
      target.Int8Array,
      target.Uint8Array,
      target.Uint8ClampedArray,
      target.Int16Array,
      target.Uint16Array,
      target.Int32Array,
      target.Uint32Array,
      target.Float32Array,
      target.Float64Array,
      target.BigInt64Array,
      target.BigUint64Array
    ].map((Constructor): [string, TypedArrayConstructor] => [Constructor.name, Constructor])
  )
  // The toStringTag getter brand-checks and names the intrinsic, so subclasses and species are ignored as the spec requires.
  const intrinsicName = (array: unknown): string => {
    const name: unknown = toStringTag.call(array)
    if (typeof name !== 'string') {
      throw new TypeError('this is not a typed array')
    }
    return name
  }
  const lengthOf = (array: unknown): number => lengthGetter.call(array)
  const copyOf = (array: unknown): TypedArrayLike => {
    const Constructor = constructors.get(intrinsicName(array))
    if (!Constructor) {
      throw new TypeError('this is not a typed array')
    }
    const copy = new Constructor(lengthOf(array))
    const source: ArrayLike<unknown> = Object(array)
    copy.set(source)
    return copy
  }
  const methods = {
    toSorted(this: unknown, compare?: Comparator): TypedArrayLike {
      assertComparator(compare)
      const copy = copyOf(this)
      copy.sort(compare)
      return copy
    },
    toReversed(this: unknown): TypedArrayLike {
      const copy = copyOf(this)
      copy.reverse()
      return copy
    },
    with(this: unknown, index: unknown, value: unknown): TypedArrayLike {
      const name = intrinsicName(this)
      const length = lengthOf(this)
      const relative = toIntegerOrInfinity(index)
      const actual = relative >= 0 ? relative : length + relative
      const converted = name.startsWith('Big') ? toBigInt(value) : toNumber(value)
      const copy = copyOf(this)
      if (actual < 0 || actual >= lengthOf(copy)) {
        throw new RangeError('Invalid typed array index')
      }
      Reflect.set(copy, actual, converted)
      return copy
    }
  }
  defineMissing(typedArrayPrototype, 'toSorted', methods.toSorted)
  defineMissing(typedArrayPrototype, 'toReversed', methods.toReversed)
  defineMissing(typedArrayPrototype, 'with', methods.with)
}

function toBigInt(value: unknown): bigint {
  const primitive: unknown = typeof value === 'object' && value !== null ? value.valueOf() : value
  if (
    typeof primitive === 'bigint' ||
    typeof primitive === 'boolean' ||
    typeof primitive === 'string'
  ) {
    return BigInt(primitive)
  }
  throw new TypeError(`Cannot convert ${String(primitive)} to a BigInt`)
}

// Array.fromAsync builds `this` when it is a constructor, so subclasses get their own instances.
function createResult(target: PolyfillTarget, receiver: unknown, args: number[]): ResultArray {
  return isConstructor(receiver) ? new receiver(...args) : new target.Array(...args)
}

function defineElement(target: ResultArray, index: number, value: unknown): void {
  Object.defineProperty(target, index, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  })
}

function installArrayFromAsync(target: PolyfillTarget): void {
  defineMissing(
    target.Array,
    'fromAsync',
    {
      // Rest parameters keep `length` at 1, as the spec requires.
      async fromAsync(this: unknown, items: unknown, ...rest: unknown[]): Promise<ResultArray> {
        const [mapperArgument, thisArg] = rest
        if (mapperArgument !== undefined && typeof mapperArgument !== 'function') {
          throw new TypeError('Array.fromAsync: mapper is not a function')
        }
        const mapper = typeof mapperArgument === 'function' ? mapperArgument : undefined
        // Only a mapped value is awaited: an async iterator's unmapped values land as-is.
        const store = async (result: ResultArray, index: number, value: unknown): Promise<void> => {
          const mapped: unknown =
            mapper === undefined ? value : await mapper.call(thisArg, value, index)
          defineElement(result, index, mapped)
        }
        if (items == null) {
          throw new TypeError('Array.fromAsync requires an array-like or iterable')
        }
        const source: IterableOrArrayLike = Object(items)
        if (isIterable(source)) {
          const result = createResult(target, this, [])
          let index = 0
          // for await closes the iterator if mapping throws and awaits sync-iterator values, matching the spec.
          for await (const value of source) {
            await store(result, index, value)
            index += 1
          }
          result.length = index
          return result
        }
        const length = lengthOfArrayLike(source)
        const result = createResult(target, this, [length])
        for (let index = 0; index < length; index += 1) {
          await store(result, index, await source[index])
        }
        result.length = length
        return result
      }
    }.fromAsync
  )
}

export function installHermesBuiltinPolyfills(target: PolyfillTarget = globalThis): void {
  installArrayToSorted(target)
  installTypedArrayCopyMethods(target)
  installArrayFromAsync(target)
}
