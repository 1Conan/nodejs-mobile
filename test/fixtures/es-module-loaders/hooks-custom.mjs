import count from '../es-modules/stateful.mjs';


// Arbitrary instance of manipulating a module's internal state
// used to assert node-land and user-land have different contexts
count();

/**
 * @param {string} url A fully resolved file url.
 * @param {object} context Additional info.
 * @param {function} next for now, next is defaultLoad a wrapper for
 * defaultGetFormat + defaultGetSource
 * @returns {{ format: string, source: (string|SharedArrayBuffer|Uint8Array) }}
 */
export function load(url, context, next) {
  // Load all .js files as ESM, regardless of package scope
  if (url.endsWith('.js')) return next(url, {
    ...context,
    format: 'module',
  });

  if (url.endsWith('.ext')) return next(url, {
    ...context,
    format: 'module',
  });

  if (url === 'esmHook/badReturnVal.mjs') return 'export function returnShouldBeObject() {}';

  if (url === 'esmHook/badReturnFormatVal.mjs') return {
    format: Array(0),
    source: '',
  }
  if (url === 'esmHook/unsupportedReturnFormatVal.mjs') return {
    format: 'foo', // Not one of the allowable inputs: no translator named 'foo'
    source: '',
  }

  if (url === 'esmHook/badReturnSourceVal.mjs') return {
    format: 'module',
    source: Array(0),
  }

  if (url === 'esmHook/preknownFormat.pre') return {
    format: context.format,
    source: `const msg = 'hello world'; export default msg;`
  };

  if (url === 'esmHook/virtual.mjs') return {
    format: 'module',
    source: `export const message = 'Woohoo!'.toUpperCase();`,
  };

  return next(url, context, next);
}

export function resolve(specifier, context, next) {
  let format = '';

  if (specifier === 'esmHook/format.false') format = false;
  if (specifier === 'esmHook/format.true') format = true;
  if (specifier === 'esmHook/preknownFormat.pre') format = 'module';

  if (specifier.startsWith('esmHook')) return {
    format,
    url: specifier,
    importAssertions: context.importAssertions,
  };

  return next(specifier, context, next);
}
