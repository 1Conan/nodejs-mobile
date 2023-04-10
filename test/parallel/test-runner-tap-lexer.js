'use strict';
// Flags: --expose-internals

require('../common');
const assert = require('assert');

const { TapLexer, TokenKind } = require('internal/test_runner/tap_lexer');

function TAPLexer(input) {
  const lexer = new TapLexer(input);
  return lexer.scan().flat();
}

{
  const tokens = TAPLexer('');

  assert.strictEqual(tokens[0].kind, TokenKind.EOF);
  assert.strictEqual(tokens[0].value, '');
}

{
  const tokens = TAPLexer('TAP version 14');

  [
    { kind: TokenKind.TAP, value: 'TAP' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.TAP_VERSION, value: 'version' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '14' },
    { kind: TokenKind.EOL, value: '' },
    { kind: TokenKind.EOF, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('1..5 # reason');

  [
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.TAP_PLAN, value: '..' },
    { kind: TokenKind.NUMERIC, value: '5' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.HASH, value: '#' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'reason' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer(
    '1..5 # reason "\\ !"\\#$%&\'()*+,\\-./:;<=>?@[]^_`{|}~'
  );

  [
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.TAP_PLAN, value: '..' },
    { kind: TokenKind.NUMERIC, value: '5' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.HASH, value: '#' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'reason' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: '"' },
    { kind: TokenKind.ESCAPE, value: '\\' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: '!"' },
    { kind: TokenKind.LITERAL, value: '\\' },
    { kind: TokenKind.LITERAL, value: '#' },
    { kind: TokenKind.LITERAL, value: "$%&'()*" },
    { kind: TokenKind.PLUS, value: '+' },
    { kind: TokenKind.LITERAL, value: ',' },
    { kind: TokenKind.ESCAPE, value: '\\' },
    { kind: TokenKind.DASH, value: '-' },
    { kind: TokenKind.LITERAL, value: './:;<=>?@[]^_`{|}~' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('ok');

  [
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('not ok');

  [
    { kind: TokenKind.TAP_TEST_NOTOK, value: 'not' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('ok 1');

  [
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer(`
ok 1
not ok 2
`);

  [
    { kind: TokenKind.NEWLINE, value: '\n' },
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.NEWLINE, value: '\n' },
    { kind: TokenKind.TAP_TEST_NOTOK, value: 'not' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '2' },
    { kind: TokenKind.NEWLINE, value: '\n' },
    { kind: TokenKind.EOF, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer(`
ok 1
    ok 1
`);

  [
    { kind: TokenKind.NEWLINE, value: '\n' },
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.NEWLINE, value: '\n' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.NEWLINE, value: '\n' },
    { kind: TokenKind.EOF, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('ok 1 description');

  [
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'description' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('ok 1 - description');

  [
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.DASH, value: '-' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'description' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('ok 1 - description # todo');

  [
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.DASH, value: '-' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'description' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.HASH, value: '#' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'todo' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('ok 1 - description \\# todo');

  [
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.DASH, value: '-' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'description' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.ESCAPE, value: '\\' },
    { kind: TokenKind.LITERAL, value: '#' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'todo' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('ok 1 - description \\ # todo');

  [
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.DASH, value: '-' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'description' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.ESCAPE, value: '\\' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.HASH, value: '#' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'todo' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer(
    'ok 1 description \\# \\\\ world # TODO escape \\# characters with \\\\'
  );
  [
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'description' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.ESCAPE, value: '\\' },
    { kind: TokenKind.LITERAL, value: '#' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.ESCAPE, value: '\\' },
    { kind: TokenKind.LITERAL, value: '\\' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'world' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.HASH, value: '#' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'TODO' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'escape' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.ESCAPE, value: '\\' },
    { kind: TokenKind.LITERAL, value: '#' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'characters' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'with' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.ESCAPE, value: '\\' },
    { kind: TokenKind.LITERAL, value: '\\' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('ok 1 - description # ##');

  [
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.DASH, value: '-' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'description' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.HASH, value: '#' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: '#' },
    { kind: TokenKind.LITERAL, value: '#' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('# comment');
  [
    { kind: TokenKind.COMMENT, value: '#' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'comment' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('#');

  [
    { kind: TokenKind.COMMENT, value: '#' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer(`
  ---
    message: "description"
    severity: fail
  ...
`);

  [
    { kind: TokenKind.NEWLINE, value: '\n' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.TAP_YAML_START, value: '---' },
    { kind: TokenKind.NEWLINE, value: '\n' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'message:' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: '"description"' },
    { kind: TokenKind.NEWLINE, value: '\n' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'severity:' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'fail' },
    { kind: TokenKind.NEWLINE, value: '\n' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.TAP_YAML_END, value: '...' },
    { kind: TokenKind.NEWLINE, value: '\n' },
    { kind: TokenKind.EOF, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('pragma +strict -warnings');

  [
    { kind: TokenKind.TAP_PRAGMA, value: 'pragma' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.PLUS, value: '+' },
    { kind: TokenKind.LITERAL, value: 'strict' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.DASH, value: '-' },
    { kind: TokenKind.LITERAL, value: 'warnings' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('Bail out! Error');

  [
    { kind: TokenKind.LITERAL, value: 'Bail' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'out!' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'Error' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

// Test isLiteralSymbol method
{
  const tokens = TAPLexer('ok 1 - description أتث讲演講👍🔥');

  [
    { kind: TokenKind.TAP_TEST_OK, value: 'ok' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.NUMERIC, value: '1' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.DASH, value: '-' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'description' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'أتث讲演講👍🔥' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}

{
  const tokens = TAPLexer('# comment أتث讲演講👍🔥');
  [
    { kind: TokenKind.COMMENT, value: '#' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'comment' },
    { kind: TokenKind.WHITESPACE, value: ' ' },
    { kind: TokenKind.LITERAL, value: 'أتث讲演講👍🔥' },
    { kind: TokenKind.EOL, value: '' },
  ].forEach((token, index) => {
    assert.strictEqual(tokens[index].kind, token.kind);
    assert.strictEqual(tokens[index].value, token.value);
  });
}
