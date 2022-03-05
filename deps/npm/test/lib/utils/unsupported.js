const t = require('tap')
const unsupported = require('../../../lib/utils/unsupported.js')
const mockGlobals = require('../../fixtures/mock-globals.js')

const versions = [
  //          broken unsupported
  ['v0.1.103', true, true],
  ['v0.2.0', true, true],
  ['v0.3.5', true, true],
  ['v0.4.7', true, true],
  ['v0.5.3', true, true],
  ['v0.6.17', true, true],
  ['v0.7.8', true, true],
  ['v0.8.28', true, true],
  ['v0.9.6', true, true],
  ['v0.10.48', true, true],
  ['v0.11.16', true, true],
  ['v0.12.9', true, true],
  ['v1.0.1', true, true],
  ['v1.6.0', true, true],
  ['v2.3.1', true, true],
  ['v3.0.0', true, true],
  ['v4.5.0', true, true],
  ['v4.8.4', true, true],
  ['v5.7.1', true, true],
  ['v6.8.1', false, true],
  ['v7.0.0-beta23', false, true],
  ['v7.2.3', false, true],
  ['v8.4.0', false, true],
  ['v9.3.0', false, true],
  ['v10.0.0-0', false, true],
  ['v11.0.0-0', false, true],
  ['v12.0.0-0', false, true],
  ['v12.13.0-0', false, false],
  ['v13.0.0-0', false, true],
  ['v14.0.0-0', false, true],
  ['v14.15.0-0', false, false],
  ['v15.0.0-0', false, true],
  ['v16.0.0-0', false, false],
]

t.test('versions', function (t) {
  t.plan(versions.length * 2)
  versions.forEach(function (verinfo) {
    const version = verinfo[0]
    const broken = verinfo[1]
    const unsupp = verinfo[2]
    const nodejs = unsupported.checkVersion(version)
    t.equal(nodejs.broken, broken, version + ' ' + (broken ? '' : 'not ') + 'broken')
    t.equal(nodejs.unsupported, unsupp, version + ' ' + (unsupp ? 'unsupported' : 'supported'))
  })
  t.end()
})

t.test('checkForBrokenNode', t => {
  // run it once to not fail
  unsupported.checkForBrokenNode()

  const logs = []
  const expectLogs = [
    'ERROR: npm is known not to run on Node.js 1.2.3',
    "You'll need to upgrade to a newer Node.js version in order to use this",
    'version of npm. You can find the latest version at https://nodejs.org/',
  ]

  // then make it a thing that fails
  mockGlobals(t, {
    'console.error': msg => logs.push(msg),
    'process.version': '1.2.3',
    'process.exit': (code) => {
      t.equal(code, 1)
      t.strictSame(logs, expectLogs)
      t.end()
    },
  })

  unsupported.checkForBrokenNode()
})

t.test('checkForUnsupportedNode', t => {
  // run it once to not fail or warn
  unsupported.checkForUnsupportedNode()

  const logs = []
  const expectLogs = [
    'npm does not support Node.js 8.0.0',
    'You should probably upgrade to a newer version of node as we',
    "can't make any promises that npm will work with this version.",
    'You can find the latest version at https://nodejs.org/',
  ]

  // then make it a thing that fails
  mockGlobals(t, {
    'console.error': msg => logs.push(msg),
    'process.version': '8.0.0',
  })

  unsupported.checkForUnsupportedNode()

  t.strictSame(logs, expectLogs)
  t.end()
})
