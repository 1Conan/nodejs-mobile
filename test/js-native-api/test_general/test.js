'use strict';
// Flags: --expose-gc

const common = require('../../common');
const test_general = require(`./build/${common.buildType}/test_general`);
const assert = require('assert');

const val1 = '1';
const val2 = 1;
const val3 = 1;

class BaseClass {
}

class ExtendedClass extends BaseClass {
}

const baseObject = new BaseClass();
const extendedObject = new ExtendedClass();

// Test napi_strict_equals
assert.ok(test_general.testStrictEquals(val1, val1));
assert.strictEqual(test_general.testStrictEquals(val1, val2), false);
assert.ok(test_general.testStrictEquals(val2, val3));

// Test napi_get_prototype
assert.strictEqual(test_general.testGetPrototype(baseObject),
                   Object.getPrototypeOf(baseObject));
assert.strictEqual(test_general.testGetPrototype(extendedObject),
                   Object.getPrototypeOf(extendedObject));
// Prototypes for base and extended should be different.
assert.notStrictEqual(test_general.testGetPrototype(baseObject),
                      test_general.testGetPrototype(extendedObject));

// Test version management functions. The expected version is currently 4.
assert.strictEqual(test_general.testGetVersion(), 5);

[
  123,
  'test string',
  function() {},
  new Object(),
  true,
  undefined,
  Symbol()
].forEach((val) => {
  assert.strictEqual(test_general.testNapiTypeof(val), typeof val);
});

// Since typeof in js return object need to validate specific case
// for null
assert.strictEqual(test_general.testNapiTypeof(null), 'null');

// Ensure that garbage collecting an object with a wrapped native item results
// in the finalize callback being called.
let w = {};
test_general.wrap(w);
w = null;
global.gc();
const derefItemWasCalled = test_general.derefItemWasCalled();
assert.strictEqual(derefItemWasCalled, true,
                   'deref_item() was called upon garbage collecting a ' +
                   'wrapped object. test_general.derefItemWasCalled() ' +
                   `returned ${derefItemWasCalled}`);


// Assert that wrapping twice fails.
const x = {};
test_general.wrap(x);
assert.throws(() => test_general.wrap(x),
              { name: 'Error', message: 'Invalid argument' });

// Ensure that wrapping, removing the wrap, and then wrapping again works.
const y = {};
test_general.wrap(y);
test_general.removeWrap(y);
// Wrapping twice succeeds if a remove_wrap() separates the instances
test_general.wrap(y);

// Ensure that removing a wrap and garbage collecting does not fire the
// finalize callback.
let z = {};
test_general.testFinalizeWrap(z);
test_general.removeWrap(z);
z = null;
global.gc();
const finalizeWasCalled = test_general.finalizeWasCalled();
assert.strictEqual(finalizeWasCalled, false,
                   'finalize callback was not called upon garbage collection.' +
                   ' test_general.finalizeWasCalled() ' +
                   `returned ${finalizeWasCalled}`);

// Test napi_adjust_external_memory
const adjustedValue = test_general.testAdjustExternalMemory();
assert.strictEqual(typeof adjustedValue, 'number');
assert(adjustedValue > 0);
