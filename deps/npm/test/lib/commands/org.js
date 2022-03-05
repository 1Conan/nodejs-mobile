const t = require('tap')
const ansiTrim = require('../../../lib/utils/ansi-trim.js')

const output = []
const npm = {
  flatOptions: {
    json: false,
    parseable: false,
    silent: false,
    loglevel: 'info',
  },
  output: msg => {
    output.push(msg)
  },
}

let orgSize = 1
let orgSetArgs = null
let orgRmArgs = null
let orgLsArgs = null
let orgList = {}
const libnpmorg = {
  set: async (org, user, role, opts) => {
    orgSetArgs = { org, user, role, opts }
    return {
      org: {
        name: org,
        size: orgSize,
      },
      user,
      role,
    }
  },
  rm: async (org, user, opts) => {
    orgRmArgs = { org, user, opts }
  },
  ls: async (org, opts) => {
    orgLsArgs = { org, opts }
    return orgList
  },
}

const Org = t.mock('../../../lib/commands/org.js', {
  '../../../lib/utils/otplease.js': async (opts, fn) => fn(opts),
  libnpmorg,
})
const org = new Org(npm)

t.test('completion', async t => {
  const completion = argv => org.completion({ conf: { argv: { remain: argv } } })

  const assertions = [
    [
      ['npm', 'org'],
      ['set', 'rm', 'ls'],
    ],
    [['npm', 'org', 'ls'], []],
    [['npm', 'org', 'add'], []],
    [['npm', 'org', 'rm'], []],
    [['npm', 'org', 'set'], []],
  ]

  for (const [argv, expected] of assertions) {
    t.resolveMatch(completion(argv), expected, `completion for: ${argv.join(', ')}`)
  }

  t.rejects(
    completion(['npm', 'org', 'flurb']),
    /flurb not recognized/,
    'errors for unknown subcommand'
  )
})

t.test('npm org - invalid subcommand', async t => {
  await t.rejects(org.exec(['foo']), org.usage)
})

t.test('npm org add', async t => {
  t.teardown(() => {
    orgSetArgs = null
    output.length = 0
  })

  await org.exec(['add', 'orgname', 'username'])

  t.strictSame(
    orgSetArgs,
    {
      org: 'orgname',
      user: 'username',
      role: 'developer',
      opts: npm.flatOptions,
    },
    'received the correct arguments'
  )
  t.equal(
    output[0],
    'Added username as developer to orgname. You now have 1 member in this org.',
    'printed the correct output'
  )
})

t.test('npm org add - no org', async t => {
  t.teardown(() => {
    orgSetArgs = null
    output.length = 0
  })

  await t.rejects(
    org.exec(['add', '', 'username']),
    /`orgname` is required/,
    'returns the correct error'
  )
})

t.test('npm org add - no user', async t => {
  t.teardown(() => {
    orgSetArgs = null
    output.length = 0
  })

  await t.rejects(
    org.exec(['add', 'orgname', '']),
    /`username` is required/,
    'returns the correct error'
  )
})

t.test('npm org add - invalid role', async t => {
  t.teardown(() => {
    orgSetArgs = null
    output.length = 0
  })

  await t.rejects(
    org.exec(['add', 'orgname', 'username', 'person']),
    /`role` must be one of/,
    'returns the correct error'
  )
})

t.test('npm org add - more users', async t => {
  orgSize = 5
  t.teardown(() => {
    orgSize = 1
    orgSetArgs = null
    output.length = 0
  })

  await org.exec(['add', 'orgname', 'username'])
  t.strictSame(
    orgSetArgs,
    {
      org: 'orgname',
      user: 'username',
      role: 'developer',
      opts: npm.flatOptions,
    },
    'received the correct arguments'
  )
  t.equal(
    output[0],
    'Added username as developer to orgname. You now have 5 members in this org.',
    'printed the correct output'
  )
})

t.test('npm org add - json output', async t => {
  npm.flatOptions.json = true
  t.teardown(() => {
    npm.flatOptions.json = false
    orgSetArgs = null
    output.length = 0
  })

  await org.exec(['add', 'orgname', 'username'])

  t.strictSame(
    orgSetArgs,
    {
      org: 'orgname',
      user: 'username',
      role: 'developer',
      opts: npm.flatOptions,
    },
    'received the correct arguments'
  )
  t.strictSame(
    JSON.parse(output[0]),
    {
      org: {
        name: 'orgname',
        size: 1,
      },
      user: 'username',
      role: 'developer',
    },
    'printed the correct output'
  )
})

t.test('npm org add - parseable output', async t => {
  npm.flatOptions.parseable = true
  t.teardown(() => {
    npm.flatOptions.parseable = false
    orgSetArgs = null
    output.length = 0
  })

  await org.exec(['add', 'orgname', 'username'])

  t.strictSame(
    orgSetArgs,
    {
      org: 'orgname',
      user: 'username',
      role: 'developer',
      opts: npm.flatOptions,
    },
    'received the correct arguments'
  )
  t.strictSame(
    output.map(line => line.split(/\t/)),
    [
      ['org', 'orgsize', 'user', 'role'],
      ['orgname', '1', 'username', 'developer'],
    ],
    'printed the correct output'
  )
})

t.test('npm org add - silent output', async t => {
  npm.flatOptions.silent = true
  t.teardown(() => {
    npm.flatOptions.silent = false
    orgSetArgs = null
    output.length = 0
  })

  await org.exec(['add', 'orgname', 'username'])

  t.strictSame(
    orgSetArgs,
    {
      org: 'orgname',
      user: 'username',
      role: 'developer',
      opts: npm.flatOptions,
    },
    'received the correct arguments'
  )
  t.strictSame(output, [], 'prints no output')
})

t.test('npm org rm', async t => {
  t.teardown(() => {
    orgRmArgs = null
    orgLsArgs = null
    output.length = 0
  })

  await org.exec(['rm', 'orgname', 'username'])

  t.strictSame(
    orgRmArgs,
    {
      org: 'orgname',
      user: 'username',
      opts: npm.flatOptions,
    },
    'libnpmorg.rm received the correct args'
  )
  t.strictSame(
    orgLsArgs,
    {
      org: 'orgname',
      opts: npm.flatOptions,
    },
    'libnpmorg.ls received the correct args'
  )
  t.equal(
    output[0],
    'Successfully removed username from orgname. You now have 0 members in this org.',
    'printed the correct output'
  )
})

t.test('npm org rm - no org', async t => {
  t.teardown(() => {
    orgRmArgs = null
    orgLsArgs = null
    output.length = 0
  })

  await t.rejects(
    org.exec(['rm', '', 'username']),
    /`orgname` is required/,
    'threw the correct error'
  )
})

t.test('npm org rm - no user', async t => {
  t.teardown(() => {
    orgRmArgs = null
    orgLsArgs = null
    output.length = 0
  })

  await t.rejects(org.exec(['rm', 'orgname']), /`username` is required/, 'threw the correct error')
})

t.test('npm org rm - one user left', async t => {
  orgList = {
    one: 'developer',
  }

  t.teardown(() => {
    orgList = {}
    orgRmArgs = null
    orgLsArgs = null
    output.length = 0
  })

  await org.exec(['rm', 'orgname', 'username'])

  t.strictSame(
    orgRmArgs,
    {
      org: 'orgname',
      user: 'username',
      opts: npm.flatOptions,
    },
    'libnpmorg.rm received the correct args'
  )
  t.strictSame(
    orgLsArgs,
    {
      org: 'orgname',
      opts: npm.flatOptions,
    },
    'libnpmorg.ls received the correct args'
  )
  t.equal(
    output[0],
    'Successfully removed username from orgname. You now have 1 member in this org.',
    'printed the correct output'
  )
})

t.test('npm org rm - json output', async t => {
  npm.flatOptions.json = true
  t.teardown(() => {
    npm.flatOptions.json = false
    orgRmArgs = null
    orgLsArgs = null
    output.length = 0
  })

  await org.exec(['rm', 'orgname', 'username'])

  t.strictSame(
    orgRmArgs,
    {
      org: 'orgname',
      user: 'username',
      opts: npm.flatOptions,
    },
    'libnpmorg.rm received the correct args'
  )
  t.strictSame(
    orgLsArgs,
    {
      org: 'orgname',
      opts: npm.flatOptions,
    },
    'libnpmorg.ls received the correct args'
  )
  t.strictSame(
    JSON.parse(output[0]),
    {
      user: 'username',
      org: 'orgname',
      userCount: 0,
      deleted: true,
    },
    'printed the correct output'
  )
})

t.test('npm org rm - parseable output', async t => {
  npm.flatOptions.parseable = true
  t.teardown(() => {
    npm.flatOptions.parseable = false
    orgRmArgs = null
    orgLsArgs = null
    output.length = 0
  })

  await org.exec(['rm', 'orgname', 'username'])

  t.strictSame(
    orgRmArgs,
    {
      org: 'orgname',
      user: 'username',
      opts: npm.flatOptions,
    },
    'libnpmorg.rm received the correct args'
  )
  t.strictSame(
    orgLsArgs,
    {
      org: 'orgname',
      opts: npm.flatOptions,
    },
    'libnpmorg.ls received the correct args'
  )
  t.strictSame(
    output.map(line => line.split(/\t/)),
    [
      ['user', 'org', 'userCount', 'deleted'],
      ['username', 'orgname', '0', 'true'],
    ],
    'printed the correct output'
  )
})

t.test('npm org rm - silent output', async t => {
  npm.flatOptions.silent = true
  t.teardown(() => {
    npm.flatOptions.silent = false
    orgRmArgs = null
    orgLsArgs = null
    output.length = 0
  })

  await org.exec(['rm', 'orgname', 'username'])

  t.strictSame(
    orgRmArgs,
    {
      org: 'orgname',
      user: 'username',
      opts: npm.flatOptions,
    },
    'libnpmorg.rm received the correct args'
  )
  t.strictSame(
    orgLsArgs,
    {
      org: 'orgname',
      opts: npm.flatOptions,
    },
    'libnpmorg.ls received the correct args'
  )
  t.strictSame(output, [], 'printed no output')
})

t.test('npm org ls', async t => {
  orgList = {
    one: 'developer',
    two: 'admin',
    three: 'owner',
  }
  t.teardown(() => {
    orgList = {}
    orgLsArgs = null
    output.length = 0
  })

  await org.exec(['ls', 'orgname'])

  t.strictSame(
    orgLsArgs,
    {
      org: 'orgname',
      opts: npm.flatOptions,
    },
    'receieved the correct args'
  )
  const out = ansiTrim(output[0])
  t.match(out, /one.*developer/, 'contains the developer member')
  t.match(out, /two.*admin/, 'contains the admin member')
  t.match(out, /three.*owner/, 'contains the owner member')
})

t.test('npm org ls - user filter', async t => {
  orgList = {
    username: 'admin',
    missing: 'admin',
  }
  t.teardown(() => {
    orgList = {}
    orgLsArgs = null
    output.length = 0
  })

  await org.exec(['ls', 'orgname', 'username'])

  t.strictSame(
    orgLsArgs,
    {
      org: 'orgname',
      opts: npm.flatOptions,
    },
    'receieved the correct args'
  )
  const out = ansiTrim(output[0])
  t.match(out, /username.*admin/, 'contains the filtered member')
  t.notMatch(out, /missing.*admin/, 'does not contain other members')
})

t.test('npm org ls - user filter, missing user', async t => {
  orgList = {
    missing: 'admin',
  }
  t.teardown(() => {
    orgList = {}
    orgLsArgs = null
    output.length = 0
  })

  await org.exec(['ls', 'orgname', 'username'])

  t.strictSame(
    orgLsArgs,
    {
      org: 'orgname',
      opts: npm.flatOptions,
    },
    'receieved the correct args'
  )
  const out = ansiTrim(output[0])
  t.notMatch(out, /username/, 'does not contain the requested member')
  t.notMatch(out, /missing.*admin/, 'does not contain other members')
})

t.test('npm org ls - no org', async t => {
  t.teardown(() => {
    orgLsArgs = null
    output.length = 0
  })

  await t.rejects(org.exec(['ls']), /`orgname` is required/, 'throws the correct error')
})

t.test('npm org ls - json output', async t => {
  npm.flatOptions.json = true
  orgList = {
    one: 'developer',
    two: 'admin',
    three: 'owner',
  }
  t.teardown(() => {
    npm.flatOptions.json = false
    orgList = {}
    orgLsArgs = null
    output.length = 0
  })

  await org.exec(['ls', 'orgname'])

  t.strictSame(
    orgLsArgs,
    {
      org: 'orgname',
      opts: npm.flatOptions,
    },
    'receieved the correct args'
  )
  t.strictSame(JSON.parse(output[0]), orgList, 'prints the correct output')
})

t.test('npm org ls - parseable output', async t => {
  npm.flatOptions.parseable = true
  orgList = {
    one: 'developer',
    two: 'admin',
    three: 'owner',
  }
  t.teardown(() => {
    npm.flatOptions.parseable = false
    orgList = {}
    orgLsArgs = null
    output.length = 0
  })

  await org.exec(['ls', 'orgname'])

  t.strictSame(
    orgLsArgs,
    {
      org: 'orgname',
      opts: npm.flatOptions,
    },
    'receieved the correct args'
  )
  t.strictSame(
    output.map(line => line.split(/\t/)),
    [
      ['user', 'role'],
      ['one', 'developer'],
      ['two', 'admin'],
      ['three', 'owner'],
    ],
    'printed the correct output'
  )
})

t.test('npm org ls - silent output', async t => {
  npm.flatOptions.silent = true
  orgList = {
    one: 'developer',
    two: 'admin',
    three: 'owner',
  }
  t.teardown(() => {
    npm.flatOptions.silent = false
    orgList = {}
    orgLsArgs = null
    output.length = 0
  })

  await org.exec(['ls', 'orgname'])

  t.strictSame(
    orgLsArgs,
    {
      org: 'orgname',
      opts: npm.flatOptions,
    },
    'receieved the correct args'
  )
  t.strictSame(output, [], 'printed no output')
})
