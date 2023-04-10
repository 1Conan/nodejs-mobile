'use strict';
// Flags: --expose-internals

require('../common');
const assert = require('assert');

const { TapParser } = require('internal/test_runner/tap_parser');

function TAPParser(input) {
  const parser = new TapParser();
  const ast = parser.parseSync(input);
  return ast;
}

// Comment

{
  const ast = TAPParser('# comment');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'Comment',
      node: { comment: 'comment' },
      lexeme: '# comment',
    },
  ]);
}

{
  const ast = TAPParser('#');
  assert.deepStrictEqual(ast, [
    {
      kind: 'Comment',
      nesting: 0,
      node: {
        comment: '',
      },
      lexeme: '#',
    },
  ]);
}

{
  const ast = TAPParser('####');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'Comment',
      node: { comment: '###' },
      lexeme: '####',
    },
  ]);
}

// Empty input

{
  const ast = TAPParser('');
  assert.deepStrictEqual(ast, []);
}

// TAP version

{
  const ast = TAPParser('TAP version 14');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'VersionKeyword',
      node: { version: '14' },
      lexeme: 'TAP version 14',
    },
  ]);
}

// Test plan

{
  const ast = TAPParser('1..5 # reason');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'PlanKeyword',
      node: { start: '1', end: '5', reason: 'reason' },
      lexeme: '1..5 # reason',
    },
  ]);
}

{
  const ast = TAPParser(
    '1..5 # reason "\\ !"\\#$%&\'()*+,\\-./:;<=>?@[]^_`{|}~'
  );
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'PlanKeyword',
      node: {
        start: '1',
        end: '5',
        reason: 'reason " !"\\#$%&\'()*+,-./:;<=>?@[]^_`{|}~',
      },
      lexeme: '1..5 # reason "\\ !"\\#$%&\'()*+,\\-./:;<=>?@[]^_`{|}~',
    },
  ]);
}

// Test point

{
  const ast = TAPParser('ok');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '',
        description: '',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok',
    },
  ]);
}

{
  const ast = TAPParser('not ok');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: true, pass: false, todo: false, skip: false },
        id: '',
        description: '',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'not ok',
    },
  ]);
}

{
  const ast = TAPParser('ok 1');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '1',
        description: '',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 1',
    },
  ]);
}

{
  const ast = TAPParser(`
ok 111
not ok 222
`);
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '111',
        description: '',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 111',
    },
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: true, pass: false, todo: false, skip: false },
        id: '222',
        description: '',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'not ok 222',
    },
  ]);
}

{
  // Nested tests
  const ast = TAPParser(`
ok 1 - parent
    ok 2 - child
`);
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '1',
        description: 'parent',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 1 - parent',
    },
    {
      nesting: 1,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '2',
        description: 'child',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '    ok 2 - child',
    },
  ]);
}

{
  const ast = TAPParser(`
# Subtest: nested1
    ok 1

    # Subtest: nested2
    ok 2 - nested2

    # Subtest: nested3
    ok 3 - nested3

    # Subtest: nested4
    ok 4 - nested4

ok 1 - nested1
`);
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'SubTestPointKeyword',
      node: { name: 'nested1' },
      lexeme: '# Subtest: nested1',
    },
    {
      nesting: 1,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '1',
        description: '',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '    ok 1',
    },
    {
      nesting: 1,
      kind: 'SubTestPointKeyword',
      node: { name: 'nested2' },
      lexeme: '    # Subtest: nested2',
    },
    {
      nesting: 1,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '2',
        description: 'nested2',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '    ok 2 - nested2',
    },
    {
      nesting: 1,
      kind: 'SubTestPointKeyword',
      node: { name: 'nested3' },
      lexeme: '    # Subtest: nested3',
    },
    {
      nesting: 1,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '3',
        description: 'nested3',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '    ok 3 - nested3',
    },
    {
      nesting: 1,
      kind: 'SubTestPointKeyword',
      node: { name: 'nested4' },
      lexeme: '    # Subtest: nested4',
    },
    {
      nesting: 1,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '4',
        description: 'nested4',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '    ok 4 - nested4',
    },
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '1',
        description: 'nested1',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 1 - nested1',
    },
  ]);
}

// Nested tests as comment

{
  const ast = TAPParser(`
# Subtest: nested1
    ok 1 - test nested1

    # Subtest: nested2
        ok 2 - test nested2

    ok 3 - nested2

ok 4 - nested1
`);
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'SubTestPointKeyword',
      node: { name: 'nested1' },
      lexeme: '# Subtest: nested1',
    },
    {
      nesting: 1,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '1',
        description: 'test nested1',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '    ok 1 - test nested1',
    },
    {
      nesting: 1,
      kind: 'SubTestPointKeyword',
      node: { name: 'nested2' },
      lexeme: '    # Subtest: nested2',
    },
    {
      nesting: 2,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '2',
        description: 'test nested2',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '        ok 2 - test nested2',
    },
    {
      nesting: 1,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '3',
        description: 'nested2',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '    ok 3 - nested2',
    },
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '4',
        description: 'nested1',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 4 - nested1',
    },
  ]);
}

// Multiple nested tests as comment

{
  const ast = TAPParser(`
# Subtest: nested1
    ok 1 - test nested1

    # Subtest: nested2a
        ok 2 - test nested2a

    ok 3 - nested2a

    # Subtest: nested2b
        ok 4 - test nested2b

    ok 5 - nested2b

ok 6 - nested1
`);
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'SubTestPointKeyword',
      node: { name: 'nested1' },
      lexeme: '# Subtest: nested1',
    },
    {
      nesting: 1,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '1',
        description: 'test nested1',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '    ok 1 - test nested1',
    },
    {
      nesting: 1,
      kind: 'SubTestPointKeyword',
      node: { name: 'nested2a' },
      lexeme: '    # Subtest: nested2a',
    },
    {
      nesting: 2,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '2',
        description: 'test nested2a',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '        ok 2 - test nested2a',
    },
    {
      nesting: 1,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '3',
        description: 'nested2a',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '    ok 3 - nested2a',
    },
    {
      nesting: 1,
      kind: 'SubTestPointKeyword',
      node: { name: 'nested2b' },
      lexeme: '    # Subtest: nested2b',
    },
    {
      nesting: 2,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '4',
        description: 'test nested2b',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '        ok 4 - test nested2b',
    },
    {
      nesting: 1,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '5',
        description: 'nested2b',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: '    ok 5 - nested2b',
    },
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '6',
        description: 'nested1',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 6 - nested1',
    },
  ]);
}

{
  const ast = TAPParser('ok 1 description');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '1',
        description: 'description',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 1 description',
    },
  ]);
}

{
  const ast = TAPParser('ok 1 - description');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '1',
        description: 'description',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 1 - description',
    },
  ]);
}

{
  const ast = TAPParser('ok 1 - description # todo');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: true, skip: false },
        id: '1',
        description: 'description',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 1 - description # todo',
    },
  ]);
}

{
  const ast = TAPParser('ok 1 - description \\# todo');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '1',
        description: 'description # todo',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 1 - description \\# todo',
    },
  ]);
}

{
  const ast = TAPParser('ok 1 - description \\ # todo');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: true, skip: false },
        id: '1',
        description: 'description',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 1 - description \\ # todo',
    },
  ]);
}

{
  const ast = TAPParser(
    'ok 1 description \\# \\\\ world # TODO escape \\# characters with \\\\'
  );
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: true, skip: false },
        id: '1',
        description: 'description # \\ world',
        reason: 'escape # characters with \\',
        time: 0,
        diagnostics: [],
      },
      lexeme:
        'ok 1 description \\# \\\\ world # TODO escape \\# characters with \\\\',
    },
  ]);
}

{
  const ast = TAPParser('ok 1 - description # ##');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '1',
        description: 'description',
        reason: '##',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 1 - description # ##',
    },
  ]);
}

{
  const ast = TAPParser(
    'ok 2 not skipped: https://example.com/page.html#skip is a url'
  );
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '2',
        description: 'not skipped: https://example.com/page.html#skip is a url',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 2 not skipped: https://example.com/page.html#skip is a url',
    },
  ]);
}

{
  const ast = TAPParser('ok 3 - #SkIp case insensitive, so this is skipped');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: true },
        id: '3',
        description: '',
        reason: 'case insensitive, so this is skipped',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 3 - #SkIp case insensitive, so this is skipped',
    },
  ]);
}

{
  const ast = TAPParser('ok ok ok');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '',
        description: 'ok ok',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok ok ok',
    },
  ]);
}

{
  const ast = TAPParser('ok not ok');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '',
        description: 'not ok',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok not ok',
    },
  ]);
}

{
  const ast = TAPParser('ok 1..1');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '1',
        description: '',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      lexeme: 'ok 1..1',
    },
  ]);
}

// Diagnostic

{
  // Note the leading 2 valid spaces
  const ast = TAPParser(`
  ---
  message: 'description'
  property: 'value'
  ...
`);
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'YamlEndKeyword',
      node: {
        diagnostics: ["message: 'description'", "property: 'value'"],
      },
      lexeme: '  ...',
    },
  ]);
}

{
  // Note the leading 2 valid spaces
  const ast = TAPParser(`
  ---
  message: "Board layout"
  severity: comment
  dump:
    board:
      - '      16G         05C        '
      - '      G N C       C C G      '
      - '        G           C  +     '
      - '10C   01G         03C        '
      - 'R N G G A G       C C C      '
      - '  R     G           C  +     '
      - '      01G   17C   00C        '
      - '      G A G G N R R N R      '
      - '        G     R     G        '
  ...
`);
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'YamlEndKeyword',
      node: {
        diagnostics: [
          'message: "Board layout"',
          'severity: comment',
          'dump:',
          '  board:',
          "    - '      16G         05C        '",
          "    - '      G N C       C C G      '",
          "    - '        G           C  +     '",
          "    - '10C   01G         03C        '",
          "    - 'R N G G A G       C C C      '",
          "    - '  R     G           C  +     '",
          "    - '      01G   17C   00C        '",
          "    - '      G A G G N R R N R      '",
          "    - '        G     R     G        '",
        ],
      },
      lexeme: '  ...',
    },
  ]);
}

{
  const ast = TAPParser(`
  ---
  ...
`);
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'YamlEndKeyword',
      node: { diagnostics: [] },
      lexeme: '  ...',
    },
  ]);
}

{
  assert.throws(
    () =>
      TAPParser(
        `
  ---
  message: 'description'
  property: 'value'`
      ),
    {
      name: 'SyntaxError',
      code: 'ERR_TAP_PARSER_ERROR',
      message:
        'Expected end of YAML block, received "\'value\'" (Literal) at line 4, column 13 (start 44, end 50)',
    }
  );
}

{
  assert.throws(
    () =>
      // Note the leading 5 spaces before ---
      // This is a special case because the YAML block is indented by 1 space
      // the extra 4 spaces are those of the subtest nesting level.
      // However, the remaining content of the YAML block is indented by 2 spaces
      // making it belong to the parent level.
      TAPParser(
        `
     ---
  message: 'description'
  property: 'value'
  ...
  `
      ),
    {
      name: 'SyntaxError',
      code: 'ERR_TAP_PARSER_ERROR',
      message:
        'Expected end of YAML block, received "\'value\'" (Literal) at line 4, column 13 (start 47, end 53)',
    }
  );
}

{
  assert.throws(
    () =>
      // Note the leading 4 spaces before ...
      TAPParser(
        `
  ---
  message: 'description'
  property: 'value'
    ...
  `
      ),
    {
      name: 'SyntaxError',
      code: 'ERR_TAP_PARSER_ERROR',
      message:
        'Expected end of YAML block, received " " (Whitespace) at line 6, column 2 (start 61, end 61)',
    }
  );
}

// Pragma

{
  const ast = TAPParser('pragma +strict, -warnings');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'PragmaKeyword',
      node: {
        pragmas: { strict: true, warnings: false },
      },
      lexeme: 'pragma +strict, -warnings',
    },
  ]);
}

// Bail out

{
  const ast = TAPParser('Bail out! Error');
  assert.deepStrictEqual(ast, [
    {
      nesting: 0,
      kind: 'BailOutKeyword',
      node: { bailout: true, reason: 'Error' },
      lexeme: 'Bail out! Error',
    },
  ]);
}

// TAP document (with diagnostics)

{
  const ast = TAPParser(`
# Comment on version 13
# Another comment on version 13

TAP version 13

# Subtest: /test.js
    # Subtest: level 0a
        # Subtest: level 1a
            # Comment test point 1a
            # Comment test point 1aa
            ok 1 - level 1a
              ---
              duration_ms: 1.676996
              ...
            # Comment plan 1a
            # Comment plan 1aa
            1..1
        # Comment closing test point 1a
        # Comment closing test point 1aa
        not ok 1 - level 1a
          ---
          duration_ms: 0.122839
          failureType: 'testCodeFailure'
          error: 'level 0b error'
          code: 'ERR_TEST_FAILURE'
          stack: |-
            TestContext.<anonymous> (/test.js:23:9)
          ...
        1..1
    not ok 1 - level 0a
      ---
      duration_ms: 84.920487
      failureType: 'subtestsFailed'
      exitCode: 1
      error: '3 subtests failed'
      code: 'ERR_TEST_FAILURE'
      ...
    # Comment plan 0a
    # Comment plan 0aa
    1..1

# Comment closing test point 0a

# Comment closing test point 0aa

not ok 1 - /test.js
# tests 1
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 87.077507
`);

  assert.deepStrictEqual(ast, [
    {
      kind: 'VersionKeyword',
      node: { version: '13' },
      nesting: 0,
      comments: ['Comment on version 13', 'Another comment on version 13'],
      lexeme: 'TAP version 13',
    },
    {
      kind: 'SubTestPointKeyword',
      node: { name: '/test.js' },
      nesting: 0,
      lexeme: '# Subtest: /test.js',
    },
    {
      kind: 'SubTestPointKeyword',
      node: { name: 'level 0a' },
      nesting: 1,
      lexeme: '    # Subtest: level 0a',
    },
    {
      kind: 'SubTestPointKeyword',
      node: { name: 'level 1a' },
      nesting: 2,
      lexeme: '        # Subtest: level 1a',
    },
    {
      kind: 'TestPointKeyword',
      node: {
        status: { fail: false, pass: true, todo: false, skip: false },
        id: '1',
        description: 'level 1a',
        reason: '',
        time: 1.676996,
        diagnostics: ['duration_ms: 1.676996'],
      },
      nesting: 3,
      comments: ['Comment test point 1a', 'Comment test point 1aa'],
      lexeme: '            ok 1 - level 1a',
    },
    {
      kind: 'PlanKeyword',
      node: { start: '1', end: '1' },
      nesting: 3,
      comments: ['Comment plan 1a', 'Comment plan 1aa'],
      lexeme: '            1..1',
    },
    {
      kind: 'TestPointKeyword',
      node: {
        status: { fail: true, pass: false, todo: false, skip: false },
        id: '1',
        description: 'level 1a',
        reason: '',
        time: 0.122839,
        diagnostics: [
          'duration_ms: 0.122839',
          "failureType: 'testCodeFailure'",
          "error: 'level 0b error'",
          "code: 'ERR_TEST_FAILURE'",
          'stack: |-',
          '  TestContext.<anonymous> (/test.js:23:9)',
        ],
      },
      nesting: 2,
      comments: [
        'Comment closing test point 1a',
        'Comment closing test point 1aa',
      ],
      lexeme: '        not ok 1 - level 1a',
    },
    {
      kind: 'PlanKeyword',
      node: { start: '1', end: '1' },
      nesting: 2,
      lexeme: '        1..1',
    },
    {
      kind: 'TestPointKeyword',
      node: {
        status: { fail: true, pass: false, todo: false, skip: false },
        id: '1',
        description: 'level 0a',
        reason: '',
        time: 84.920487,
        diagnostics: [
          'duration_ms: 84.920487',
          "failureType: 'subtestsFailed'",
          'exitCode: 1',
          "error: '3 subtests failed'",
          "code: 'ERR_TEST_FAILURE'",
        ],
      },
      nesting: 1,
      lexeme: '    not ok 1 - level 0a',
    },
    {
      kind: 'PlanKeyword',
      node: { start: '1', end: '1' },
      nesting: 1,
      comments: ['Comment plan 0a', 'Comment plan 0aa'],
      lexeme: '    1..1',
    },
    {
      kind: 'TestPointKeyword',
      node: {
        status: { fail: true, pass: false, todo: false, skip: false },
        id: '1',
        description: '/test.js',
        reason: '',
        time: 0,
        diagnostics: [],
      },
      nesting: 0,
      comments: [
        'Comment closing test point 0a',
        'Comment closing test point 0aa',
      ],
      lexeme: 'not ok 1 - /test.js',
    },
    {
      kind: 'Comment',
      node: { comment: 'tests 1' },
      nesting: 0,
      lexeme: '# tests 1',
    },
    {
      kind: 'Comment',
      node: { comment: 'pass 0' },
      nesting: 0,
      lexeme: '# pass 0',
    },
    {
      kind: 'Comment',
      node: { comment: 'fail 1' },
      nesting: 0,
      lexeme: '# fail 1',
    },
    {
      kind: 'Comment',
      node: { comment: 'cancelled 0' },
      nesting: 0,
      lexeme: '# cancelled 0',
    },
    {
      kind: 'Comment',
      node: { comment: 'skipped 0' },
      nesting: 0,
      lexeme: '# skipped 0',
    },
    {
      kind: 'Comment',
      node: { comment: 'todo 0' },
      nesting: 0,
      lexeme: '# todo 0',
    },
    {
      kind: 'Comment',
      node: { comment: 'duration_ms 87.077507' },
      nesting: 0,
      lexeme: '# duration_ms 87.077507',
    },
  ]);
}
