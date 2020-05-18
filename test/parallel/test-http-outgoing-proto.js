'use strict';
const common = require('../common');
const assert = require('assert');

const http = require('http');
const OutgoingMessage = http.OutgoingMessage;
const ClientRequest = http.ClientRequest;
const ServerResponse = http.ServerResponse;

assert.strictEqual(
  typeof ClientRequest.prototype._implicitHeader, 'function');
assert.strictEqual(
  typeof ServerResponse.prototype._implicitHeader, 'function');

// validateHeader
assert.throws(() => {
  const outgoingMessage = new OutgoingMessage();
  outgoingMessage.setHeader();
}, {
  code: 'ERR_INVALID_HTTP_TOKEN',
  name: 'TypeError',
  message: 'Header name must be a valid HTTP token ["undefined"]'
});

assert.throws(() => {
  const outgoingMessage = new OutgoingMessage();
  outgoingMessage.setHeader('test');
}, {
  code: 'ERR_HTTP_INVALID_HEADER_VALUE',
  name: 'TypeError',
  message: 'Invalid value "undefined" for header "test"'
});

assert.throws(() => {
  const outgoingMessage = new OutgoingMessage();
  outgoingMessage.setHeader(404);
}, {
  code: 'ERR_INVALID_HTTP_TOKEN',
  name: 'TypeError',
  message: 'Header name must be a valid HTTP token ["404"]'
});

assert.throws(() => {
  const outgoingMessage = new OutgoingMessage();
  outgoingMessage.setHeader.call({ _header: 'test' }, 'test', 'value');
}, {
  code: 'ERR_HTTP_HEADERS_SENT',
  name: 'Error',
  message: 'Cannot set headers after they are sent to the client'
});

assert.throws(() => {
  const outgoingMessage = new OutgoingMessage();
  outgoingMessage.setHeader('200', 'あ');
}, {
  code: 'ERR_INVALID_CHAR',
  name: 'TypeError',
  message: 'Invalid character in header content ["200"]'
});

// write
{
  const outgoingMessage = new OutgoingMessage();

  outgoingMessage.on('error', common.expectsError({
    code: 'ERR_METHOD_NOT_IMPLEMENTED',
    name: 'Error',
    message: 'The _implicitHeader() method is not implemented'
  }));

  outgoingMessage.write('');
}

assert(OutgoingMessage.prototype.write.call({ _header: 'test' }));

assert.throws(() => {
  const outgoingMessage = new OutgoingMessage();
  outgoingMessage.write.call({ _header: 'test', _hasBody: 'test' });
}, {
  code: 'ERR_INVALID_ARG_TYPE',
  name: 'TypeError',
  message: 'The first argument must be of type string or an instance of ' +
           'Buffer. Received undefined'
});

assert.throws(() => {
  const outgoingMessage = new OutgoingMessage();
  outgoingMessage.write.call({ _header: 'test', _hasBody: 'test' }, 1);
}, {
  code: 'ERR_INVALID_ARG_TYPE',
  name: 'TypeError',
  message: 'The first argument must be of type string or an instance of ' +
           'Buffer. Received type number (1)'
});

// addTrailers()
// The `Error` comes from the JavaScript engine so confirm that it is a
// `TypeError` but do not check the message. It will be different in different
// JavaScript engines.
assert.throws(() => {
  const outgoingMessage = new OutgoingMessage();
  outgoingMessage.addTrailers();
}, TypeError);

assert.throws(() => {
  const outgoingMessage = new OutgoingMessage();
  outgoingMessage.addTrailers({ 'あ': 'value' });
}, {
  code: 'ERR_INVALID_HTTP_TOKEN',
  name: 'TypeError',
  message: 'Trailer name must be a valid HTTP token ["あ"]'
});

assert.throws(() => {
  const outgoingMessage = new OutgoingMessage();
  outgoingMessage.addTrailers({ 404: 'あ' });
}, {
  code: 'ERR_INVALID_CHAR',
  name: 'TypeError',
  message: 'Invalid character in trailer content ["404"]'
});
