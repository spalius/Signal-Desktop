// Copyright 2021 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

/* eslint-disable max-classes-per-file */

import { getOwn } from './getOwn';

export function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    (typeof value === 'object' && value !== null && Symbol.iterator in value) ||
    typeof value === 'string'
  );
}

export function size(iterable: Iterable<unknown>): number {
  // We check for common types as an optimization.
  if (typeof iterable === 'string' || Array.isArray(iterable)) {
    return iterable.length;
  }
  if (iterable instanceof Set || iterable instanceof Map) {
    return iterable.size;
  }

  const iterator = iterable[Symbol.iterator]();

  let result = -1;
  for (let done = false; !done; result += 1) {
    done = Boolean(iterator.next().done);
  }
  return result;
}

export function concat<T>(
  ...iterables: ReadonlyArray<Iterable<T>>
): Iterable<T> {
  return new ConcatIterable(iterables);
}

class ConcatIterable<T> implements Iterable<T> {
  constructor(private readonly iterables: ReadonlyArray<Iterable<T>>) {}

  *[Symbol.iterator](): Iterator<T> {
    for (const iterable of this.iterables) {
      yield* iterable;
    }
  }
}

export function filter<T, S extends T>(
  iterable: Iterable<T>,
  predicate: (value: T) => value is S
): Iterable<S>;
export function filter<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => unknown
): Iterable<T>;
export function filter<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => unknown
): Iterable<T> {
  return new FilterIterable(iterable, predicate);
}

class FilterIterable<T> implements Iterable<T> {
  constructor(
    private readonly iterable: Iterable<T>,
    private readonly predicate: (value: T) => unknown
  ) {}

  [Symbol.iterator](): Iterator<T> {
    return new FilterIterator(this.iterable[Symbol.iterator](), this.predicate);
  }
}

class FilterIterator<T> implements Iterator<T> {
  constructor(
    private readonly iterator: Iterator<T>,
    private readonly predicate: (value: T) => unknown
  ) {}

  next(): IteratorResult<T> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const nextIteration = this.iterator.next();
      if (nextIteration.done || this.predicate(nextIteration.value)) {
        return nextIteration;
      }
    }
  }
}

export function find<T>(
  iterable: Iterable<T>,
  predicate: (value: T) => unknown
): undefined | T {
  for (const value of iterable) {
    if (predicate(value)) {
      return value;
    }
  }
  return undefined;
}

export function groupBy<T>(
  iterable: Iterable<T>,
  fn: (value: T) => string
): Record<string, Array<T>> {
  const result: Record<string, Array<T>> = Object.create(null);
  for (const value of iterable) {
    const key = fn(value);
    const existingGroup = getOwn(result, key);
    if (existingGroup) {
      existingGroup.push(value);
    } else {
      result[key] = [value];
    }
  }
  return result;
}

export const isEmpty = (iterable: Iterable<unknown>): boolean =>
  Boolean(iterable[Symbol.iterator]().next().done);

export function map<T, ResultT>(
  iterable: Iterable<T>,
  fn: (value: T) => ResultT
): Iterable<ResultT> {
  return new MapIterable(iterable, fn);
}

class MapIterable<T, ResultT> implements Iterable<ResultT> {
  constructor(
    private readonly iterable: Iterable<T>,
    private readonly fn: (value: T) => ResultT
  ) {}

  [Symbol.iterator](): Iterator<ResultT> {
    return new MapIterator(this.iterable[Symbol.iterator](), this.fn);
  }
}

class MapIterator<T, ResultT> implements Iterator<ResultT> {
  constructor(
    private readonly iterator: Iterator<T>,
    private readonly fn: (value: T) => ResultT
  ) {}

  next(): IteratorResult<ResultT> {
    const nextIteration = this.iterator.next();
    if (nextIteration.done) {
      return nextIteration;
    }
    return {
      done: false,
      value: this.fn(nextIteration.value),
    };
  }
}

export function reduce<T, TResult>(
  iterable: Iterable<T>,
  fn: (result: TResult, value: T) => TResult,
  accumulator: TResult
): TResult {
  let result = accumulator;
  for (const value of iterable) {
    result = fn(result, value);
  }
  return result;
}

export function repeat<T>(value: T): Iterable<T> {
  return new RepeatIterable(value);
}

class RepeatIterable<T> implements Iterable<T> {
  constructor(private readonly value: T) {}

  [Symbol.iterator](): Iterator<T> {
    return new RepeatIterator(this.value);
  }
}

class RepeatIterator<T> implements Iterator<T> {
  private readonly iteratorResult: IteratorResult<T>;

  constructor(value: Readonly<T>) {
    this.iteratorResult = {
      done: false,
      value,
    };
  }

  next(): IteratorResult<T> {
    return this.iteratorResult;
  }
}

export function take<T>(iterable: Iterable<T>, amount: number): Iterable<T> {
  return new TakeIterable(iterable, amount);
}

class TakeIterable<T> implements Iterable<T> {
  constructor(
    private readonly iterable: Iterable<T>,
    private readonly amount: number
  ) {}

  [Symbol.iterator](): Iterator<T> {
    return new TakeIterator(this.iterable[Symbol.iterator](), this.amount);
  }
}

class TakeIterator<T> implements Iterator<T> {
  constructor(private readonly iterator: Iterator<T>, private amount: number) {}

  next(): IteratorResult<T> {
    const nextIteration = this.iterator.next();
    if (nextIteration.done || this.amount === 0) {
      return { done: true, value: undefined };
    }
    this.amount -= 1;
    return nextIteration;
  }
}

// In the future, this could support number and symbol property names.
export function zipObject<ValueT>(
  props: Iterable<string>,
  values: Iterable<ValueT>
): Record<string, ValueT> {
  const result: Record<string, ValueT> = {};

  const propsIterator = props[Symbol.iterator]();
  const valuesIterator = values[Symbol.iterator]();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const propIteration = propsIterator.next();
    if (propIteration.done) {
      break;
    }
    const valueIteration = valuesIterator.next();
    if (valueIteration.done) {
      break;
    }

    result[propIteration.value] = valueIteration.value;
  }

  return result;
}
