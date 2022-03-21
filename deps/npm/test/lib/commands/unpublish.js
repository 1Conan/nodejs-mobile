const t = require('tap')
const { fake: mockNpm } = require('../../fixtures/mock-npm')

let result = ''
const noop = () => null
const versions = async () => {
  return {
    versions: {
      '1.0.0': {},
      '1.0.1': {},
    },
  }
}

const singleVersion = async () => {
  return {
    versions: {
      '1.0.0': {},
    },
  }
}

const config = {
  force: false,
  loglevel: 'silly',
}

const testDir = t.testdir({
  'package.json': JSON.stringify({
    name: 'pkg',
    version: '1.0.0',
  }, null, 2),
})

const npm = mockNpm({
  localPrefix: testDir,
  config,
  output: (...msg) => {
    result += msg.join('\n')
  },
})

const mocks = {
  libnpmaccess: { lsPackages: noop },
  libnpmpublish: { unpublish: noop },
  'npm-registry-fetch': { json: versions },
  '../../../lib/utils/otplease.js': async (opts, fn) => fn(opts),
  '../../../lib/utils/get-identity.js': async () => 'foo',
  'proc-log': { silly () {}, verbose () {} },
}

t.afterEach(() => {
  npm.localPrefix = testDir
  result = ''
  config['dry-run'] = false
  config.force = false
  config.loglevel = 'silly'
})

t.test('no args --force', async t => {
  config.force = true

  const log = {
    silly (title) {
      t.equal(title, 'unpublish', 'should silly log args')
    },
    verbose (title, msg) {
      t.equal(title, 'unpublish', 'should have expected title')
      t.match(
        msg,
        { name: 'pkg', version: '1.0.0' },
        'should have msg printing package.json contents'
      )
    },
  }

  const libnpmpublish = {
    unpublish (spec, opts) {
      t.ok(opts.log, 'gets passed a logger')
      t.equal(spec.raw, 'pkg@1.0.0', 'should unpublish expected spec')
      t.match(
        opts,
        {
          publishConfig: undefined,
        },
        'should unpublish with expected opts'
      )
    },
  }

  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
    libnpmpublish,
    'proc-log': log,
  })

  const unpublish = new Unpublish(npm)

  await unpublish.exec([])

  t.equal(
    result,
    '- pkg@1.0.0',
    'should output removed pkg@version on success'
  )
})

t.test('no args --force missing package.json', async t => {
  config.force = true

  const testDir = t.testdir({})
  npm.localPrefix = testDir
  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
  })
  const unpublish = new Unpublish(npm)

  await t.rejects(
    unpublish.exec([]),
    /Usage: npm unpublish/,
    'should throw usage instructions on missing package.json'
  )
})

t.test('no args --force unknown error reading package.json', async t => {
  config.force = true

  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
    'read-package-json': (path, cb) => cb(new Error('ERR')),
  })
  const unpublish = new Unpublish(npm)

  await t.rejects(
    unpublish.exec([]),
    /ERR/,
    'should throw unknown error from reading package.json'
  )
})

t.test('no args', async t => {
  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
  })
  const unpublish = new Unpublish(npm)

  await t.rejects(
    unpublish.exec([]),
    /Refusing to delete entire project/,
    'should throw --force required error on no args'
  )
})

t.test('too many args', async t => {
  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
  })
  const unpublish = new Unpublish(npm)

  await t.rejects(
    unpublish.exec(['a', 'b']),
    /Usage: npm unpublish/,
    'should throw usage instructions if too many args'
  )
})

t.test('unpublish <pkg>@version', async t => {
  const log = {
    silly (title, key, value) {
      t.equal(title, 'unpublish', 'should silly log args')
      if (key === 'spec') {
        t.match(value, { name: 'pkg', rawSpec: '1.0.0' })
      } else {
        t.equal(value, 'pkg@1.0.0', 'should log originally passed arg')
      }
    },
  }

  const libnpmpublish = {
    unpublish (spec, opts) {
      t.ok(opts.log, 'gets passed a logger')
      t.equal(spec.raw, 'pkg@1.0.0', 'should unpublish expected parsed spec')
    },
  }

  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
    libnpmpublish,
    'proc-log': log,
  })
  const unpublish = new Unpublish(npm)

  await unpublish.exec(['pkg@1.0.0'])

  t.equal(
    result,
    '- pkg@1.0.0',
    'should output removed pkg@version on success'
  )
})

t.test('no version found in package.json', async t => {
  config.force = true

  const testDir = t.testdir({
    'package.json': JSON.stringify({
      name: 'pkg',
    }, null, 2),
  })
  npm.localPrefix = testDir

  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
  })
  const unpublish = new Unpublish(npm)

  await unpublish.exec([])
  t.equal(
    result,
    '- pkg',
    'should output removed pkg on success'
  )
})

t.test('unpublish <pkg> --force no version set', async t => {
  config.force = true

  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
  })
  const unpublish = new Unpublish(npm)

  await unpublish.exec(['pkg'])

  t.equal(
    result,
    '- pkg',
    'should output pkg removed'
  )
})

t.test('silent', async t => {
  config.loglevel = 'silent'

  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
  })
  const unpublish = new Unpublish(npm)

  await unpublish.exec(['pkg@1.0.0'])

  t.equal(
    result,
    '',
    'should have no output'
  )
})

t.test('workspaces', async t => {
  const testDir = t.testdir({
    'package.json': JSON.stringify({
      name: 'my-cool-pkg',
      version: '1.0.0',
      workspaces: ['workspace-a', 'workspace-b', 'workspace-c'],
    }, null, 2),
    'workspace-a': {
      'package.json': JSON.stringify({
        name: 'workspace-a',
        version: '1.2.3-a',
        repository: 'http://repo.workspace-a/',
      }),
    },
    'workspace-b': {
      'package.json': JSON.stringify({
        name: 'workspace-b',
        version: '1.2.3-n',
        repository: 'https://github.com/npm/workspace-b',
      }),
    },
    'workspace-c': {
      'package.json': JSON.stringify({
        name: 'workspace-n',
        version: '1.2.3-n',
      }),
    },
  })
  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
  })
  const unpublish = new Unpublish(npm)

  t.test('no force', async t => {
    npm.localPrefix = testDir
    await t.rejects(
      unpublish.execWorkspaces([], []),
      /--force/,
      'should require force'
    )
  })

  t.test('all workspaces --force', async t => {
    npm.localPrefix = testDir
    config.force = true
    await unpublish.execWorkspaces([], [])
    t.matchSnapshot(result, 'should output all workspaces')
  })

  t.test('one workspace --force', async t => {
    npm.localPrefix = testDir
    config.force = true
    await unpublish.execWorkspaces([], ['workspace-a'])
    t.matchSnapshot(result, 'should output one workspaces')
  })
})

t.test('dryRun with spec', async t => {
  config['dry-run'] = true
  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
    libnpmpublish: { unpublish: () => {
      throw new Error('should not be called')
    } },
  })
  const unpublish = new Unpublish(npm)
  await unpublish.exec(['pkg@1.0.0'])

  t.equal(
    result,
    '- pkg@1.0.0',
    'should output removed pkg@version on success'
  )
})

t.test('dryRun with local package', async t => {
  config['dry-run'] = true
  config.force = true
  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
    libnpmpublish: { unpublish: () => {
      throw new Error('should not be called')
    } },
  })
  const unpublish = new Unpublish(npm)
  await unpublish.exec([])
  t.equal(
    result,
    '- pkg@1.0.0',
    'should output removed pkg@1.0.0 on success'
  )
})

t.test('completion', async t => {
  const testComp =
    async (t, { unpublish, argv, partialWord, expect, title }) => {
      const res = await unpublish.completion(
        { conf: { argv: { remain: argv } }, partialWord }
      )
      t.strictSame(res, expect, title || argv.join(' '))
    }

  t.test('completing with multiple versions from the registry', async t => {
    const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
      ...mocks,
      libnpmaccess: {
        async lsPackages () {
          return {
            pkg: 'write',
            bar: 'write',
          }
        },
      },
      'npm-registry-fetch': {
        async json () {
          return {
            versions: {
              '1.0.0': {},
              '1.0.1': {},
              '2.0.0': {},
            },
          }
        },
      },
    })
    const unpublish = new Unpublish(npm)

    await testComp(t, {
      unpublish,
      argv: ['npm', 'unpublish'],
      partialWord: 'pkg',
      expect: [
        'pkg@1.0.0',
        'pkg@1.0.1',
        'pkg@2.0.0',
      ],
    })
  })

  t.test('no versions retrieved', async t => {
    const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
      ...mocks,
      libnpmaccess: {
        async lsPackages () {
          return {
            pkg: 'write',
            bar: 'write',
          }
        },
      },
      'npm-registry-fetch': {
        async json () {
          return {
            versions: {},
          }
        },
      },
    })
    const unpublish = new Unpublish(npm)

    await testComp(t, {
      unpublish,
      argv: ['npm', 'unpublish'],
      partialWord: 'pkg',
      expect: [
        'pkg',
      ],
      title: 'should autocomplete package name only',
    })
  })

  t.test('packages starting with same letters', async t => {
    const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
      ...mocks,
      libnpmaccess: {
        async lsPackages () {
          return {
            pkg: 'write',
            pkga: 'write',
            pkgb: 'write',
          }
        },
      },
    })
    const unpublish = new Unpublish(npm)

    await testComp(t, {
      unpublish,
      argv: ['npm', 'unpublish'],
      partialWord: 'pkg',
      expect: [
        'pkg',
        'pkga',
        'pkgb',
      ],
    })
  })

  t.test('no packages retrieved', async t => {
    const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
      ...mocks,
      libnpmaccess: {
        async lsPackages () {
          return {}
        },
      },
    })
    const unpublish = new Unpublish(npm)

    await testComp(t, {
      unpublish,
      argv: ['npm', 'unpublish'],
      partialWord: 'pkg',
      expect: [],
      title: 'should have no autocompletion',
    })
  })

  t.test('no pkg name to complete', async t => {
    const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
      ...mocks,
      libnpmaccess: {
        async lsPackages () {
          return {
            pkg: {},
            bar: {},
          }
        },
      },
    })
    const unpublish = new Unpublish(npm)

    await testComp(t, {
      unpublish,
      argv: ['npm', 'unpublish'],
      partialWord: undefined,
      expect: ['pkg', 'bar'],
      title: 'should autocomplete with available package names from user',
    })
  })

  t.test('no pkg names retrieved from user account', async t => {
    const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
      ...mocks,
      libnpmaccess: {
        async lsPackages () {
          return null
        },
      },
    })
    const unpublish = new Unpublish(npm)

    await testComp(t, {
      unpublish,
      argv: ['npm', 'unpublish'],
      partialWord: 'pkg',
      expect: [],
      title: 'should have no autocomplete',
    })
  })

  t.test('logged out user', async t => {
    const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
      ...mocks,
      '../../../lib/utils/get-identity.js': () => Promise.reject(new Error('ERR')),
    })
    const unpublish = new Unpublish(npm)

    await testComp(t, {
      unpublish,
      argv: ['npm', 'unpublish'],
      partialWord: 'pkg',
      expect: [],
    })
  })

  t.test('too many args', async t => {
    const Unpublish = t.mock('../../../lib/commands/unpublish.js', mocks)
    const unpublish = new Unpublish(npm)

    await testComp(t, {
      unpublish,
      argv: ['npm', 'unpublish', 'foo'],
      partialWord: undefined,
      expect: [],
    })
  })
})

t.test('show error on unpublish <pkg>@version with package.json and the last version', async t => {
  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
    'npm-registry-fetch': { json: singleVersion },
    path: { resolve: () => testDir, join: () => testDir + '/package.json' },
  })
  const unpublish = new Unpublish(npm)
  await t.rejects(
    unpublish.exec(['pkg@1.0.0']),
    'Refusing to delete the last version of the package. ' +
      'It will block from republishing a new version for 24 hours.\n' +
      'Run with --force to do this.'
  )
})

t.test('show error on unpublish <pkg>@version when the last version', async t => {
  const Unpublish = t.mock('../../../lib/commands/unpublish.js', {
    ...mocks,
    'npm-registry-fetch': { json: singleVersion },
  })
  const unpublish = new Unpublish(npm)
  await t.rejects(
    unpublish.exec(['pkg@1.0.0']),
    'Refusing to delete the last version of the package. ' +
      'It will block from republishing a new version for 24 hours.\n' +
      'Run with --force to do this.'
  )
})
