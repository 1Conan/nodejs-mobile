const os = require('os')
const fs = require('fs').promises
const path = require('path')
const mockLogs = require('./mock-logs')
const mockGlobals = require('./mock-globals')
const log = require('../../lib/utils/log-shim')

const RealMockNpm = (t, otherMocks = {}) => {
  const mock = {
    ...mockLogs(otherMocks),
    outputs: [],
    joinedOutput: () => mock.outputs.map(o => o.join(' ')).join('\n'),
  }

  const Npm = t.mock('../../lib/npm.js', {
    ...otherMocks,
    ...mock.logMocks,
  })

  mock.Npm = class MockNpm extends Npm {
    // lib/npm.js tests needs this to actually test the function!
    originalOutput (...args) {
      super.output(...args)
    }

    output (...args) {
      mock.outputs.push(args)
    }
  }

  return mock
}

// Resolve some options to a function call with supplied args
const result = (fn, ...args) => typeof fn === 'function' ? fn(...args) : fn

const LoadMockNpm = async (t, {
  init = true,
  load = init,
  testdir = {},
  config = {},
  mocks = {},
  globals = null,
} = {}) => {
  // Mock some globals with their original values so they get torn down
  // back to the original at the end of the test since they are manipulated
  // by npm itself
  mockGlobals(t, {
    process: {
      title: process.title,
      execPath: process.execPath,
      env: {
        npm_command: process.env.npm_command,
        COLOR: process.env.COLOR,
      },
    },
  })

  const { Npm, ...rest } = RealMockNpm(t, mocks)

  if (!init && load) {
    throw new Error('cant `load` without `init`')
  }

  const _level = log.level
  t.teardown(() => log.level = _level)

  if (config.loglevel) {
    // Set log level as early as possible since it is set
    // on the npmlog singleton and shared across everything
    log.level = config.loglevel
  }

  const dir = t.testdir({ root: testdir, cache: {} })
  const prefix = path.join(dir, 'root')
  const cache = path.join(dir, 'cache')

  // Set cache to testdir via env var so it is available when load is run
  // XXX: remove this for a solution where cache argv is passed in
  mockGlobals(t, {
    'process.env.npm_config_cache': cache,
  })

  if (globals) {
    mockGlobals(t, result(globals, { prefix, cache }))
  }

  const npm = init ? new Npm() : null
  t.teardown(() => npm && npm.unload())

  if (load) {
    await npm.load()
    for (const [k, v] of Object.entries(result(config, { npm, prefix, cache }))) {
      npm.config.set(k, v)
    }
    if (config.loglevel) {
      // Set global loglevel *again* since it possibly got reset during load
      // XXX: remove with npmlog
      log.level = config.loglevel
    }
    npm.prefix = prefix
    npm.cache = cache
  }

  return {
    ...rest,
    Npm,
    npm,
    prefix,
    cache,
    debugFile: async () => {
      const readFiles = npm.logFiles.map(f => fs.readFile(f))
      const logFiles = await Promise.all(readFiles)
      return logFiles
        .flatMap((d) => d.toString().trim().split(os.EOL))
        .filter(Boolean)
        .join('\n')
    },
    timingFile: async () => {
      const data = await fs.readFile(path.resolve(cache, '_timing.json'), 'utf8')
      return JSON.parse(data) // XXX: this fails if multiple timings are written
    },
  }
}

const realConfig = require('../../lib/utils/config')

// Basic npm fixture that you can give a config object that acts like
// npm.config You still need a separate flatOptions. Tests should migrate to
// using the real npm mock above
class MockNpm {
  constructor (base = {}) {
    this._mockOutputs = []
    this.isMockNpm = true
    this.base = base

    const config = base.config || {}

    for (const attr in base) {
      if (attr !== 'config') {
        this[attr] = base[attr]
      }
    }

    this.flatOptions = base.flatOptions || {}
    this.config = {
      // for now just set `find` to what config.find should return
      // this works cause `find` is not an existing config entry
      find: (k) => ({ ...realConfig.defaults, ...config })[k],
      get: (k) => ({ ...realConfig.defaults, ...config })[k],
      set: (k, v) => config[k] = v,
      list: [{ ...realConfig.defaults, ...config }],
    }
  }

  output (...msg) {
    if (this.base.output) {
      return this.base.output(msg)
    }
    this._mockOutputs.push(msg)
  }
}

const FakeMockNpm = (base = {}) => {
  return new MockNpm(base)
}

module.exports = {
  fake: FakeMockNpm,
  load: LoadMockNpm,
}
