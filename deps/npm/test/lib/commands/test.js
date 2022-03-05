const t = require('tap')
const spawk = require('spawk')
const { load: loadMockNpm } = require('../../fixtures/mock-npm')

spawk.preventUnmatched()
t.teardown(() => {
  spawk.unload()
})

// TODO this ... smells.  npm "script-shell" config mentions defaults but those
// are handled by run-script, not npm.  So for now we have to tie tests to some
// pretty specific internals of runScript
const makeSpawnArgs = require('@npmcli/run-script/lib/make-spawn-args.js')

t.test('should run test script from package.json', async t => {
  const { npm } = await loadMockNpm(t, {
    testdir: {
      'package.json': JSON.stringify({
        name: 'x',
        version: '1.2.3',
        scripts: {
          test: 'node ./test-test.js',
        },
      }),
    },
    config: {
      loglevel: 'silent',
    },
  })
  const [scriptShell] = makeSpawnArgs({ path: npm.prefix })
  const script = spawk.spawn(scriptShell, (args) => {
    t.ok(args.includes('node ./test-test.js "foo"'), 'ran test script with extra args')
    return true
  })
  await npm.exec('test', ['foo'])
  t.ok(script.called, 'script ran')
})
