'use strict';

const {
  ArrayPrototypeJoin,
  ObjectSetPrototypeOf,
  PromiseAll,
  SafeSet,
  SafePromise,
  StringPrototypeIncludes,
  StringPrototypeMatch,
  StringPrototypeReplace,
  StringPrototypeSplit,
} = primordials;

const { ModuleWrap } = internalBinding('module_wrap');

const { decorateErrorStack } = require('internal/util');
const assert = require('internal/assert');
const resolvedPromise = SafePromise.resolve();

function noop() {}

let hasPausedEntry = false;

/* A ModuleJob tracks the loading of a single Module, and the ModuleJobs of
 * its dependencies, over time. */
class ModuleJob {
  // `loader` is the Loader instance used for loading dependencies.
  // `moduleProvider` is a function
  constructor(loader, url, moduleProvider, isMain, inspectBrk) {
    this.loader = loader;
    this.isMain = isMain;
    this.inspectBrk = inspectBrk;

    // This is a Promise<{ module, reflect }>, whose fields will be copied
    // onto `this` by `link()` below once it has been resolved.
    this.modulePromise = moduleProvider.call(loader, url, isMain);
    this.module = undefined;

    // Wait for the ModuleWrap instance being linked with all dependencies.
    const link = async () => {
      this.module = await this.modulePromise;
      assert(this.module instanceof ModuleWrap);

      const dependencyJobs = [];
      const promises = this.module.link(async (specifier) => {
        const jobPromise = this.loader.getModuleJob(specifier, url);
        dependencyJobs.push(jobPromise);
        return (await jobPromise).modulePromise;
      });

      if (promises !== undefined)
        await SafePromise.all(promises);

      return SafePromise.all(dependencyJobs);
    };
    // Promise for the list of all dependencyJobs.
    this.linked = link();
    // This promise is awaited later anyway, so silence
    // 'unhandled rejection' warnings.
    this.linked.catch(noop);

    // instantiated == deep dependency jobs wrappers instantiated,
    // module wrapper instantiated
    this.instantiated = undefined;
  }

  async instantiate() {
    if (!this.instantiated) {
      return this.instantiated = this._instantiate();
    }
    await this.instantiated;
    return this.module;
  }

  // This method instantiates the module associated with this job and its
  // entire dependency graph, i.e. creates all the module namespaces and the
  // exported/imported variables.
  async _instantiate() {
    const jobsInGraph = new SafeSet();

    const addJobsToDependencyGraph = async (moduleJob) => {
      if (jobsInGraph.has(moduleJob)) {
        return;
      }
      jobsInGraph.add(moduleJob);
      const dependencyJobs = await moduleJob.linked;
      return PromiseAll(dependencyJobs.map(addJobsToDependencyGraph));
    };
    await addJobsToDependencyGraph(this);
    try {
      if (!hasPausedEntry && this.inspectBrk) {
        hasPausedEntry = true;
        const initWrapper = internalBinding('inspector').callAndPauseOnStart;
        initWrapper(this.module.instantiate, this.module);
      } else {
        this.module.instantiate();
      }
    } catch (e) {
      decorateErrorStack(e);
      if (StringPrototypeIncludes(e.message,
                                  ' does not provide an export named')) {
        const splitStack = StringPrototypeSplit(e.stack, '\n');
        const parentFileUrl = splitStack[0];
        const childSpecifier = StringPrototypeMatch(e.message, /module '(.*)' does/)[1];
        const childFileURL =
              await this.loader.resolve(childSpecifier, parentFileUrl);
        const format = await this.loader.getFormat(childFileURL);
        if (format === 'commonjs') {
          e.message = `The requested module '${childSpecifier}' is expected ` +
            'to be of type CommonJS, which does not support named exports. ' +
            'CommonJS modules can be imported by importing the default ' +
            'export.';
          // TODO(@ctavan): The original error stack only provides the single
          // line which causes the error. For multi-line import statements we
          // cannot generate an equivalent object descructuring assignment by
          // just parsing the error stack.
          const importStatement = splitStack[1];
          const oneLineNamedImports = StringPrototypeMatch(importStatement, /{.*}/);
          if (oneLineNamedImports) {
            const destructuringAssignment =
              StringPrototypeReplace(oneLineNamedImports[0], /\s+as\s+/g, ': ');
            e.message += '\nFor example:\n' +
              `import pkg from '${childSpecifier}';\n` +
              `const ${destructuringAssignment} = pkg;`;
          }
          const newStack = StringPrototypeSplit(e.stack, '\n');
          newStack[3] = `SyntaxError: ${e.message}`;
          e.stack = ArrayPrototypeJoin(newStack, '\n');
        }
      }
      throw e;
    }
    for (const dependencyJob of jobsInGraph) {
      // Calling `this.module.instantiate()` instantiates not only the
      // ModuleWrap in this module, but all modules in the graph.
      dependencyJob.instantiated = resolvedPromise;
    }
    return this.module;
  }

  async run() {
    const module = await this.instantiate();
    const timeout = -1;
    const breakOnSigint = false;
    return { module, result: module.evaluate(timeout, breakOnSigint) };
  }
}
ObjectSetPrototypeOf(ModuleJob.prototype, null);
module.exports = ModuleJob;
