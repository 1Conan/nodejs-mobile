'use strict';

const {
  Array,
  MathMin,
  NumberIsInteger,
  NumberIsSafeInteger,
  ObjectDefineProperty,
  ObjectSetPrototypeOf,
  Symbol,
} = primordials;

const {
  ERR_OUT_OF_RANGE,
  ERR_STREAM_DESTROYED
} = require('internal/errors').codes;
const { validateNumber } = require('internal/validators');
const fs = require('fs');
const { Buffer } = require('buffer');
const {
  copyObject,
  getOptions,
} = require('internal/fs/utils');
const { Readable, Writable } = require('stream');
const { toPathIfFileURL } = require('internal/url');
const kIoDone = Symbol('kIoDone');
const kIsPerformingIO = Symbol('kIsPerformingIO');

const kMinPoolSpace = 128;

let pool;
// It can happen that we expect to read a large chunk of data, and reserve
// a large chunk of the pool accordingly, but the read() call only filled
// a portion of it. If a concurrently executing read() then uses the same pool,
// the "reserved" portion cannot be used, so we allow it to be re-used as a
// new pool later.
const poolFragments = [];

function allocNewPool(poolSize) {
  if (poolFragments.length > 0)
    pool = poolFragments.pop();
  else
    pool = Buffer.allocUnsafe(poolSize);
  pool.used = 0;
}

// Check the `this.start` and `this.end` of stream.
function checkPosition(pos, name) {
  if (!NumberIsSafeInteger(pos)) {
    validateNumber(pos, name);
    if (!NumberIsInteger(pos))
      throw new ERR_OUT_OF_RANGE(name, 'an integer', pos);
    throw new ERR_OUT_OF_RANGE(name, '>= 0 and <= 2 ** 53 - 1', pos);
  }
  if (pos < 0) {
    throw new ERR_OUT_OF_RANGE(name, '>= 0 and <= 2 ** 53 - 1', pos);
  }
}

function roundUpToMultipleOf8(n) {
  return (n + 7) & ~7;  // Align to 8 byte boundary.
}

function ReadStream(path, options) {
  if (!(this instanceof ReadStream))
    return new ReadStream(path, options);

  // A little bit bigger buffer and water marks by default
  options = copyObject(getOptions(options, {}));
  if (options.highWaterMark === undefined)
    options.highWaterMark = 64 * 1024;

  // For backwards compat do not emit close on destroy.
  if (options.emitClose === undefined) {
    options.emitClose = false;
  }

  Readable.call(this, options);

  // Path will be ignored when fd is specified, so it can be falsy
  this.path = toPathIfFileURL(path);
  this.fd = options.fd === undefined ? null : options.fd;
  this.flags = options.flags === undefined ? 'r' : options.flags;
  this.mode = options.mode === undefined ? 0o666 : options.mode;

  this.start = options.start;
  this.end = options.end;
  this.autoClose = options.autoClose === undefined ? true : options.autoClose;
  this.pos = undefined;
  this.bytesRead = 0;
  this.closed = false;
  this[kIsPerformingIO] = false;

  if (this.start !== undefined) {
    checkPosition(this.start, 'start');

    this.pos = this.start;
  }

  if (this.end === undefined) {
    this.end = Infinity;
  } else if (this.end !== Infinity) {
    checkPosition(this.end, 'end');

    if (this.start !== undefined && this.start > this.end) {
      throw new ERR_OUT_OF_RANGE(
        'start',
        `<= "end" (here: ${this.end})`,
        this.start
      );
    }
  }

  if (typeof this.fd !== 'number')
    this.open();

  this.on('end', function() {
    if (this.autoClose) {
      this.destroy();
    }
  });
}
ObjectSetPrototypeOf(ReadStream.prototype, Readable.prototype);
ObjectSetPrototypeOf(ReadStream, Readable);

ReadStream.prototype.open = function() {
  fs.open(this.path, this.flags, this.mode, (er, fd) => {
    if (er) {
      if (this.autoClose) {
        this.destroy();
      }
      this.emit('error', er);
      return;
    }

    this.fd = fd;
    this.emit('open', fd);
    this.emit('ready');
    // Start the flow of data.
    this.read();
  });
};

ReadStream.prototype._read = function(n) {
  if (typeof this.fd !== 'number') {
    return this.once('open', function() {
      this._read(n);
    });
  }

  if (this.destroyed) return;

  if (!pool || pool.length - pool.used < kMinPoolSpace) {
    // Discard the old pool.
    allocNewPool(this.readableHighWaterMark);
  }

  // Grab another reference to the pool in the case that while we're
  // in the thread pool another read() finishes up the pool, and
  // allocates a new one.
  const thisPool = pool;
  let toRead = MathMin(pool.length - pool.used, n);
  const start = pool.used;

  if (this.pos !== undefined)
    toRead = MathMin(this.end - this.pos + 1, toRead);
  else
    toRead = MathMin(this.end - this.bytesRead + 1, toRead);

  // Already read everything we were supposed to read!
  // treat as EOF.
  if (toRead <= 0)
    return this.push(null);

  // the actual read.
  this[kIsPerformingIO] = true;
  fs.read(this.fd, pool, pool.used, toRead, this.pos, (er, bytesRead) => {
    this[kIsPerformingIO] = false;
    // Tell ._destroy() that it's safe to close the fd now.
    if (this.destroyed) return this.emit(kIoDone, er);

    if (er) {
      if (this.autoClose) {
        this.destroy();
      }
      this.emit('error', er);
    } else {
      let b = null;
      // Now that we know how much data we have actually read, re-wind the
      // 'used' field if we can, and otherwise allow the remainder of our
      // reservation to be used as a new pool later.
      if (start + toRead === thisPool.used && thisPool === pool) {
        const newUsed = thisPool.used + bytesRead - toRead;
        thisPool.used = roundUpToMultipleOf8(newUsed);
      } else {
        // Round down to the next lowest multiple of 8 to ensure the new pool
        // fragment start and end positions are aligned to an 8 byte boundary.
        const alignedEnd = (start + toRead) & ~7;
        const alignedStart = roundUpToMultipleOf8(start + bytesRead);
        if (alignedEnd - alignedStart >= kMinPoolSpace) {
          poolFragments.push(thisPool.slice(alignedStart, alignedEnd));
        }
      }

      if (bytesRead > 0) {
        this.bytesRead += bytesRead;
        b = thisPool.slice(start, start + bytesRead);
      }

      this.push(b);
    }
  });

  // Move the pool positions, and internal position for reading.
  if (this.pos !== undefined)
    this.pos += toRead;

  pool.used = roundUpToMultipleOf8(pool.used + toRead);
};

ReadStream.prototype._destroy = function(err, cb) {
  if (typeof this.fd !== 'number') {
    this.once('open', closeFsStream.bind(null, this, cb, err));
    return;
  }

  if (this[kIsPerformingIO]) {
    this.once(kIoDone, (er) => closeFsStream(this, cb, err || er));
    return;
  }

  closeFsStream(this, cb, err);
};

function closeFsStream(stream, cb, err) {
  fs.close(stream.fd, (er) => {
    er = er || err;
    cb(er);
    stream.closed = true;
    const s = stream._writableState || stream._readableState;
    if (!er && !s.emitClose)
      stream.emit('close');
  });

  stream.fd = null;
}

ReadStream.prototype.close = function(cb) {
  this.destroy(null, cb);
};

ObjectDefineProperty(ReadStream.prototype, 'pending', {
  get() { return this.fd === null; },
  configurable: true
});

function WriteStream(path, options) {
  if (!(this instanceof WriteStream))
    return new WriteStream(path, options);

  options = copyObject(getOptions(options, {}));

  // Only buffers are supported.
  options.decodeStrings = true;

  // For backwards compat do not emit close on destroy.
  if (options.emitClose === undefined) {
    options.emitClose = false;
  }

  Writable.call(this, options);

  // Path will be ignored when fd is specified, so it can be falsy
  this.path = toPathIfFileURL(path);
  this.fd = options.fd === undefined ? null : options.fd;
  this.flags = options.flags === undefined ? 'w' : options.flags;
  this.mode = options.mode === undefined ? 0o666 : options.mode;

  this.start = options.start;
  this.autoClose = options.autoClose === undefined ? true : !!options.autoClose;
  this.pos = undefined;
  this.bytesWritten = 0;
  this.closed = false;
  this[kIsPerformingIO] = false;

  if (this.start !== undefined) {
    checkPosition(this.start, 'start');

    this.pos = this.start;
  }

  if (options.encoding)
    this.setDefaultEncoding(options.encoding);

  if (typeof this.fd !== 'number')
    this.open();
}
ObjectSetPrototypeOf(WriteStream.prototype, Writable.prototype);
ObjectSetPrototypeOf(WriteStream, Writable);

WriteStream.prototype._final = function(callback) {
  if (typeof this.fd !== 'number') {
    return this.once('open', function() {
      this._final(callback);
    });
  }

  if (this.autoClose) {
    this.destroy();
  }

  callback();
};

WriteStream.prototype.open = function() {
  fs.open(this.path, this.flags, this.mode, (er, fd) => {
    if (er) {
      if (this.autoClose) {
        this.destroy();
      }
      this.emit('error', er);
      return;
    }

    this.fd = fd;
    this.emit('open', fd);
    this.emit('ready');
  });
};


WriteStream.prototype._write = function(data, encoding, cb) {
  if (typeof this.fd !== 'number') {
    return this.once('open', function() {
      this._write(data, encoding, cb);
    });
  }

  if (this.destroyed) return cb(new ERR_STREAM_DESTROYED('write'));

  this[kIsPerformingIO] = true;
  fs.write(this.fd, data, 0, data.length, this.pos, (er, bytes) => {
    this[kIsPerformingIO] = false;
    // Tell ._destroy() that it's safe to close the fd now.
    if (this.destroyed) {
      cb(er);
      return this.emit(kIoDone, er);
    }

    if (er) {
      if (this.autoClose) {
        this.destroy();
      }
      return cb(er);
    }
    this.bytesWritten += bytes;
    cb();
  });

  if (this.pos !== undefined)
    this.pos += data.length;
};


WriteStream.prototype._writev = function(data, cb) {
  if (typeof this.fd !== 'number') {
    return this.once('open', function() {
      this._writev(data, cb);
    });
  }

  if (this.destroyed) return cb(new ERR_STREAM_DESTROYED('write'));

  const len = data.length;
  const chunks = new Array(len);
  let size = 0;

  for (let i = 0; i < len; i++) {
    const chunk = data[i].chunk;

    chunks[i] = chunk;
    size += chunk.length;
  }

  this[kIsPerformingIO] = true;
  fs.writev(this.fd, chunks, this.pos, (er, bytes) => {
    this[kIsPerformingIO] = false;
    // Tell ._destroy() that it's safe to close the fd now.
    if (this.destroyed) {
      cb(er);
      return this.emit(kIoDone, er);
    }

    if (er) {
      if (this.autoClose) {
        this.destroy();
      }
      return cb(er);
    }
    this.bytesWritten += bytes;
    cb();
  });

  if (this.pos !== undefined)
    this.pos += size;
};


WriteStream.prototype._destroy = ReadStream.prototype._destroy;
WriteStream.prototype.close = function(cb) {
  if (cb) {
    if (this.closed) {
      process.nextTick(cb);
      return;
    } else {
      this.on('close', cb);
    }
  }

  // If we are not autoClosing, we should call
  // destroy on 'finish'.
  if (!this.autoClose) {
    this.on('finish', this.destroy);
  }

  // We use end() instead of destroy() because of
  // https://github.com/nodejs/node/issues/2006
  this.end();
};

// There is no shutdown() for files.
WriteStream.prototype.destroySoon = WriteStream.prototype.end;

ObjectDefineProperty(WriteStream.prototype, 'pending', {
  get() { return this.fd === null; },
  configurable: true
});

module.exports = {
  ReadStream,
  WriteStream
};
