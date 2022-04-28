'use strict';

const { AbortController } = require('internal/abort_controller');
const { Buffer } = require('buffer');

const {
  codes: {
    ERR_INVALID_ARG_TYPE,
    ERR_MISSING_ARGS,
    ERR_OUT_OF_RANGE,
  },
  AbortError,
} = require('internal/errors');
const { validateInteger } = require('internal/validators');
const { kWeakHandler } = require('internal/event_target');
const { finished } = require('internal/streams/end-of-stream');

const {
  ArrayPrototypePush,
  MathFloor,
  Number,
  NumberIsNaN,
  Promise,
  PromiseReject,
  PromisePrototypeCatch,
  Symbol,
} = primordials;

const kEmpty = Symbol('kEmpty');
const kEof = Symbol('kEof');

function map(fn, options) {
  if (typeof fn !== 'function') {
    throw new ERR_INVALID_ARG_TYPE(
      'fn', ['Function', 'AsyncFunction'], fn);
  }

  if (options != null && typeof options !== 'object') {
    throw new ERR_INVALID_ARG_TYPE('options', ['Object']);
  }

  let concurrency = 1;
  if (options?.concurrency != null) {
    concurrency = MathFloor(options.concurrency);
  }

  validateInteger(concurrency, 'concurrency', 1);

  return async function* map() {
    const ac = new AbortController();
    const stream = this;
    const queue = [];
    const signal = ac.signal;
    const signalOpt = { signal };

    const abort = () => ac.abort();
    if (options?.signal?.aborted) {
      abort();
    }

    options?.signal?.addEventListener('abort', abort);

    let next;
    let resume;
    let done = false;

    function onDone() {
      done = true;
    }

    async function pump() {
      try {
        for await (let val of stream) {
          if (done) {
            return;
          }

          if (signal.aborted) {
            throw new AbortError();
          }

          try {
            val = fn(val, signalOpt);
          } catch (err) {
            val = PromiseReject(err);
          }

          if (val === kEmpty) {
            continue;
          }

          if (typeof val?.catch === 'function') {
            val.catch(onDone);
          }

          queue.push(val);
          if (next) {
            next();
            next = null;
          }

          if (!done && queue.length && queue.length >= concurrency) {
            await new Promise((resolve) => {
              resume = resolve;
            });
          }
        }
        queue.push(kEof);
      } catch (err) {
        const val = PromiseReject(err);
        PromisePrototypeCatch(val, onDone);
        queue.push(val);
      } finally {
        done = true;
        if (next) {
          next();
          next = null;
        }
        options?.signal?.removeEventListener('abort', abort);
      }
    }

    pump();

    try {
      while (true) {
        while (queue.length > 0) {
          const val = await queue[0];

          if (val === kEof) {
            return;
          }

          if (signal.aborted) {
            throw new AbortError();
          }

          if (val !== kEmpty) {
            yield val;
          }

          queue.shift();
          if (resume) {
            resume();
            resume = null;
          }
        }

        await new Promise((resolve) => {
          next = resolve;
        });
      }
    } finally {
      ac.abort();

      done = true;
      if (resume) {
        resume();
        resume = null;
      }
    }
  }.call(this);
}

async function* asIndexedPairs(options) {
  let index = 0;
  for await (const val of this) {
    if (options?.signal?.aborted) {
      throw new AbortError({ cause: options.signal.reason });
    }
    yield [index++, val];
  }
}

async function some(fn, options) {
  // https://tc39.es/proposal-iterator-helpers/#sec-iteratorprototype.some
  // Note that some does short circuit but also closes the iterator if it does
  const ac = new AbortController();
  if (options?.signal) {
    if (options.signal.aborted) {
      ac.abort();
    }
    options.signal.addEventListener('abort', () => ac.abort(), {
      [kWeakHandler]: this,
      once: true,
    });
  }
  const mapped = this.map(fn, { ...options, signal: ac.signal });
  for await (const result of mapped) {
    if (result) {
      ac.abort();
      return true;
    }
  }
  return false;
}

async function every(fn, options) {
  if (typeof fn !== 'function') {
    throw new ERR_INVALID_ARG_TYPE(
      'fn', ['Function', 'AsyncFunction'], fn);
  }
  // https://en.wikipedia.org/wiki/De_Morgan%27s_laws
  return !(await some.call(this, async (...args) => {
    return !(await fn(...args));
  }, options));
}

async function forEach(fn, options) {
  if (typeof fn !== 'function') {
    throw new ERR_INVALID_ARG_TYPE(
      'fn', ['Function', 'AsyncFunction'], fn);
  }
  async function forEachFn(value, options) {
    await fn(value, options);
    return kEmpty;
  }
  // eslint-disable-next-line no-unused-vars
  for await (const unused of this.map(forEachFn, options));
}

function filter(fn, options) {
  if (typeof fn !== 'function') {
    throw new ERR_INVALID_ARG_TYPE(
      'fn', ['Function', 'AsyncFunction'], fn);
  }
  async function filterFn(value, options) {
    if (await fn(value, options)) {
      return value;
    }
    return kEmpty;
  }
  return this.map(filterFn, options);
}

// Specific to provide better error to reduce since the argument is only
// missing if the stream has no items in it - but the code is still appropriate
class ReduceAwareErrMissingArgs extends ERR_MISSING_ARGS {
  constructor() {
    super('reduce');
    this.message = 'Reduce of an empty stream requires an initial value';
  }
}

async function reduce(reducer, initialValue, options) {
  if (typeof reducer !== 'function') {
    throw new ERR_INVALID_ARG_TYPE(
      'reducer', ['Function', 'AsyncFunction'], reducer);
  }
  let hasInitialValue = arguments.length > 1;
  if (options?.signal?.aborted) {
    const err = new AbortError(undefined, { cause: options.signal.reason });
    this.once('error', () => {}); // The error is already propagated
    await finished(this.destroy(err));
    throw err;
  }
  const ac = new AbortController();
  const signal = ac.signal;
  if (options?.signal) {
    const opts = { once: true, [kWeakHandler]: this };
    options.signal.addEventListener('abort', () => ac.abort(), opts);
  }
  let gotAnyItemFromStream = false;
  try {
    for await (const value of this) {
      gotAnyItemFromStream = true;
      if (options?.signal?.aborted) {
        throw new AbortError();
      }
      if (!hasInitialValue) {
        initialValue = value;
        hasInitialValue = true;
      } else {
        initialValue = await reducer(initialValue, value, { signal });
      }
    }
    if (!gotAnyItemFromStream && !hasInitialValue) {
      throw new ReduceAwareErrMissingArgs();
    }
  } finally {
    ac.abort();
  }
  return initialValue;
}

async function toArray(options) {
  const result = [];
  for await (const val of this) {
    if (options?.signal?.aborted) {
      throw new AbortError(undefined, { cause: options.signal.reason });
    }
    ArrayPrototypePush(result, val);
  }
  if (!this.readableObjectMode) {
    return Buffer.concat(result);
  }
  return result;
}

function flatMap(fn, options) {
  const values = this.map(fn, options);
  return async function* flatMap() {
    for await (const val of values) {
      yield* val;
    }
  }.call(this);
}

function toIntegerOrInfinity(number) {
  // We coerce here to align with the spec
  // https://github.com/tc39/proposal-iterator-helpers/issues/169
  number = Number(number);
  if (NumberIsNaN(number)) {
    return 0;
  }
  if (number < 0) {
    throw new ERR_OUT_OF_RANGE('number', '>= 0', number);
  }
  return number;
}

function drop(number, options) {
  number = toIntegerOrInfinity(number);
  return async function* drop() {
    if (options?.signal?.aborted) {
      throw new AbortError();
    }
    for await (const val of this) {
      if (options?.signal?.aborted) {
        throw new AbortError();
      }
      if (number-- <= 0) {
        yield val;
      }
    }
  }.call(this);
}


function take(number, options) {
  number = toIntegerOrInfinity(number);
  return async function* take() {
    if (options?.signal?.aborted) {
      throw new AbortError();
    }
    for await (const val of this) {
      if (options?.signal?.aborted) {
        throw new AbortError();
      }
      if (number-- > 0) {
        yield val;
      } else {
        return;
      }
    }
  }.call(this);
}

module.exports.streamReturningOperators = {
  asIndexedPairs,
  drop,
  filter,
  flatMap,
  map,
  take,
};

module.exports.promiseReturningOperators = {
  every,
  forEach,
  reduce,
  toArray,
  some,
};
