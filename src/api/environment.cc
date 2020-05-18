#include "node.h"
#include "node_context_data.h"
#include "node_errors.h"
#include "node_internals.h"
#include "node_native_module_env.h"
#include "node_platform.h"
#include "node_v8_platform-inl.h"
#include "uv.h"

namespace node {
using errors::TryCatchScope;
using v8::Array;
using v8::Context;
using v8::EscapableHandleScope;
using v8::FinalizationGroup;
using v8::Function;
using v8::HandleScope;
using v8::Isolate;
using v8::Local;
using v8::MaybeLocal;
using v8::MicrotasksPolicy;
using v8::Null;
using v8::Object;
using v8::ObjectTemplate;
using v8::Private;
using v8::String;
using v8::Value;

static bool AllowWasmCodeGenerationCallback(Local<Context> context,
                                            Local<String>) {
  Local<Value> wasm_code_gen =
      context->GetEmbedderData(ContextEmbedderIndex::kAllowWasmCodeGeneration);
  return wasm_code_gen->IsUndefined() || wasm_code_gen->IsTrue();
}

static bool ShouldAbortOnUncaughtException(Isolate* isolate) {
  DebugSealHandleScope scope(isolate);
  Environment* env = Environment::GetCurrent(isolate);
  return env != nullptr &&
         (env->is_main_thread() || !env->is_stopping()) &&
         env->should_abort_on_uncaught_toggle()[0] &&
         !env->inside_should_not_abort_on_uncaught_scope();
}

static MaybeLocal<Value> PrepareStackTraceCallback(Local<Context> context,
                                      Local<Value> exception,
                                      Local<Array> trace) {
  Environment* env = Environment::GetCurrent(context);
  if (env == nullptr) {
    MaybeLocal<String> s = exception->ToString(context);
    return s.IsEmpty() ?
      MaybeLocal<Value>() :
      MaybeLocal<Value>(s.ToLocalChecked());
  }
  Local<Function> prepare = env->prepare_stack_trace_callback();
  if (prepare.IsEmpty()) {
    MaybeLocal<String> s = exception->ToString(context);
    return s.IsEmpty() ?
      MaybeLocal<Value>() :
      MaybeLocal<Value>(s.ToLocalChecked());
  }
  Local<Value> args[] = {
      context->Global(),
      exception,
      trace,
  };
  // This TryCatch + Rethrow is required by V8 due to details around exception
  // handling there. For C++ callbacks, V8 expects a scheduled exception (which
  // is what ReThrow gives us). Just returning the empty MaybeLocal would leave
  // us with a pending exception.
  TryCatchScope try_catch(env);
  MaybeLocal<Value> result = prepare->Call(
      context, Undefined(env->isolate()), arraysize(args), args);
  if (try_catch.HasCaught() && !try_catch.HasTerminated()) {
    try_catch.ReThrow();
  }
  return result;
}

static void HostCleanupFinalizationGroupCallback(
    Local<Context> context, Local<FinalizationGroup> group) {
  Environment* env = Environment::GetCurrent(context);
  if (env == nullptr) {
    return;
  }
  env->RegisterFinalizationGroupForCleanup(group);
}

void* NodeArrayBufferAllocator::Allocate(size_t size) {
  if (zero_fill_field_ || per_process::cli_options->zero_fill_all_buffers)
    return UncheckedCalloc(size);
  else
    return UncheckedMalloc(size);
}

DebuggingArrayBufferAllocator::~DebuggingArrayBufferAllocator() {
  CHECK(allocations_.empty());
}

void* DebuggingArrayBufferAllocator::Allocate(size_t size) {
  Mutex::ScopedLock lock(mutex_);
  void* data = NodeArrayBufferAllocator::Allocate(size);
  RegisterPointerInternal(data, size);
  return data;
}

void* DebuggingArrayBufferAllocator::AllocateUninitialized(size_t size) {
  Mutex::ScopedLock lock(mutex_);
  void* data = NodeArrayBufferAllocator::AllocateUninitialized(size);
  RegisterPointerInternal(data, size);
  return data;
}

void DebuggingArrayBufferAllocator::Free(void* data, size_t size) {
  Mutex::ScopedLock lock(mutex_);
  UnregisterPointerInternal(data, size);
  NodeArrayBufferAllocator::Free(data, size);
}

void* DebuggingArrayBufferAllocator::Reallocate(void* data,
                                                size_t old_size,
                                                size_t size) {
  Mutex::ScopedLock lock(mutex_);
  void* ret = NodeArrayBufferAllocator::Reallocate(data, old_size, size);
  if (ret == nullptr) {
    if (size == 0)  // i.e. equivalent to free().
      UnregisterPointerInternal(data, old_size);
    return nullptr;
  }

  if (data != nullptr) {
    auto it = allocations_.find(data);
    CHECK_NE(it, allocations_.end());
    allocations_.erase(it);
  }

  RegisterPointerInternal(ret, size);
  return ret;
}

void DebuggingArrayBufferAllocator::RegisterPointer(void* data, size_t size) {
  Mutex::ScopedLock lock(mutex_);
  RegisterPointerInternal(data, size);
}

void DebuggingArrayBufferAllocator::UnregisterPointer(void* data, size_t size) {
  Mutex::ScopedLock lock(mutex_);
  UnregisterPointerInternal(data, size);
}

void DebuggingArrayBufferAllocator::UnregisterPointerInternal(void* data,
                                                              size_t size) {
  if (data == nullptr) return;
  auto it = allocations_.find(data);
  CHECK_NE(it, allocations_.end());
  if (size > 0) {
    // We allow allocations with size 1 for 0-length buffers to avoid having
    // to deal with nullptr values.
    CHECK_EQ(it->second, size);
  }
  allocations_.erase(it);
}

void DebuggingArrayBufferAllocator::RegisterPointerInternal(void* data,
                                                            size_t size) {
  if (data == nullptr) return;
  CHECK_EQ(allocations_.count(data), 0);
  allocations_[data] = size;
}

std::unique_ptr<ArrayBufferAllocator> ArrayBufferAllocator::Create(bool debug) {
  if (debug || per_process::cli_options->debug_arraybuffer_allocations)
    return std::make_unique<DebuggingArrayBufferAllocator>();
  else
    return std::make_unique<NodeArrayBufferAllocator>();
}

ArrayBufferAllocator* CreateArrayBufferAllocator() {
  return ArrayBufferAllocator::Create().release();
}

void FreeArrayBufferAllocator(ArrayBufferAllocator* allocator) {
  delete allocator;
}

void SetIsolateCreateParamsForNode(Isolate::CreateParams* params) {
  const uint64_t constrained_memory = uv_get_constrained_memory();
  const uint64_t total_memory = constrained_memory > 0 ?
      std::min(uv_get_total_memory(), constrained_memory) :
      uv_get_total_memory();
  if (total_memory > 0) {
    // V8 defaults to 700MB or 1.4GB on 32 and 64 bit platforms respectively.
    // This default is based on browser use-cases. Tell V8 to configure the
    // heap based on the actual physical memory.
    params->constraints.ConfigureDefaults(total_memory, 0);
  }
}

void SetIsolateErrorHandlers(v8::Isolate* isolate, const IsolateSettings& s) {
  if (s.flags & MESSAGE_LISTENER_WITH_ERROR_LEVEL)
    isolate->AddMessageListenerWithErrorLevel(
            errors::PerIsolateMessageListener,
            Isolate::MessageErrorLevel::kMessageError |
                Isolate::MessageErrorLevel::kMessageWarning);

  auto* abort_callback = s.should_abort_on_uncaught_exception_callback ?
      s.should_abort_on_uncaught_exception_callback :
      ShouldAbortOnUncaughtException;
  isolate->SetAbortOnUncaughtExceptionCallback(abort_callback);

  auto* fatal_error_cb = s.fatal_error_callback ?
      s.fatal_error_callback : OnFatalError;
  isolate->SetFatalErrorHandler(fatal_error_cb);

  auto* prepare_stack_trace_cb = s.prepare_stack_trace_callback ?
      s.prepare_stack_trace_callback : PrepareStackTraceCallback;
  isolate->SetPrepareStackTraceCallback(prepare_stack_trace_cb);
}

void SetIsolateMiscHandlers(v8::Isolate* isolate, const IsolateSettings& s) {
  isolate->SetMicrotasksPolicy(s.policy);

  auto* allow_wasm_codegen_cb = s.allow_wasm_code_generation_callback ?
    s.allow_wasm_code_generation_callback : AllowWasmCodeGenerationCallback;
  isolate->SetAllowWasmCodeGenerationCallback(allow_wasm_codegen_cb);

  auto* promise_reject_cb = s.promise_reject_callback ?
    s.promise_reject_callback : task_queue::PromiseRejectCallback;
  isolate->SetPromiseRejectCallback(promise_reject_cb);

  auto* host_cleanup_cb = s.host_cleanup_finalization_group_callback ?
    s.host_cleanup_finalization_group_callback :
    HostCleanupFinalizationGroupCallback;
  isolate->SetHostCleanupFinalizationGroupCallback(host_cleanup_cb);

  if (s.flags & DETAILED_SOURCE_POSITIONS_FOR_PROFILING)
    v8::CpuProfiler::UseDetailedSourcePositionsForProfiling(isolate);
}

void SetIsolateUpForNode(v8::Isolate* isolate,
                         const IsolateSettings& settings) {
  SetIsolateErrorHandlers(isolate, settings);
  SetIsolateMiscHandlers(isolate, settings);
}

void SetIsolateUpForNode(v8::Isolate* isolate) {
  IsolateSettings settings;
  SetIsolateUpForNode(isolate, settings);
}

Isolate* NewIsolate(ArrayBufferAllocator* allocator, uv_loop_t* event_loop) {
  return NewIsolate(allocator, event_loop, GetMainThreadMultiIsolatePlatform());
}

// TODO(joyeecheung): we may want to expose this, but then we need to be
// careful about what we override in the params.
Isolate* NewIsolate(Isolate::CreateParams* params,
                    uv_loop_t* event_loop,
                    MultiIsolatePlatform* platform) {
  Isolate* isolate = Isolate::Allocate();
  if (isolate == nullptr) return nullptr;

  // Register the isolate on the platform before the isolate gets initialized,
  // so that the isolate can access the platform during initialization.
  platform->RegisterIsolate(isolate, event_loop);

  SetIsolateCreateParamsForNode(params);
  Isolate::Initialize(isolate, *params);
  SetIsolateUpForNode(isolate);

  return isolate;
}

Isolate* NewIsolate(ArrayBufferAllocator* allocator,
                    uv_loop_t* event_loop,
                    MultiIsolatePlatform* platform) {
  Isolate::CreateParams params;
  if (allocator != nullptr) params.array_buffer_allocator = allocator;
  return NewIsolate(&params, event_loop, platform);
}

IsolateData* CreateIsolateData(Isolate* isolate,
                               uv_loop_t* loop,
                               MultiIsolatePlatform* platform,
                               ArrayBufferAllocator* allocator) {
  return new IsolateData(isolate, loop, platform, allocator);
}

void FreeIsolateData(IsolateData* isolate_data) {
  delete isolate_data;
}

Environment* CreateEnvironment(IsolateData* isolate_data,
                               Local<Context> context,
                               int argc,
                               const char* const* argv,
                               int exec_argc,
                               const char* const* exec_argv) {
  Isolate* isolate = context->GetIsolate();
  HandleScope handle_scope(isolate);
  Context::Scope context_scope(context);
  // TODO(addaleax): This is a much better place for parsing per-Environment
  // options than the global parse call.
  std::vector<std::string> args(argv, argv + argc);
  std::vector<std::string> exec_args(exec_argv, exec_argv + exec_argc);
  // TODO(addaleax): Provide more sensible flags, in an embedder-accessible way.
  Environment* env = new Environment(
      isolate_data,
      context,
      args,
      exec_args,
      static_cast<Environment::Flags>(Environment::kIsMainThread |
                                      Environment::kOwnsProcessState |
                                      Environment::kOwnsInspector));
  env->InitializeLibuv(per_process::v8_is_profiling);
  if (env->RunBootstrapping().IsEmpty())
    return nullptr;
  return env;
}

void FreeEnvironment(Environment* env) {
  env->RunCleanup();
  delete env;
}

Environment* GetCurrentEnvironment(Local<Context> context) {
  return Environment::GetCurrent(context);
}

MultiIsolatePlatform* GetMainThreadMultiIsolatePlatform() {
  return per_process::v8_platform.Platform();
}

MultiIsolatePlatform* CreatePlatform(
    int thread_pool_size,
    node::tracing::TracingController* tracing_controller) {
  return new NodePlatform(thread_pool_size, tracing_controller);
}

void FreePlatform(MultiIsolatePlatform* platform) {
  delete platform;
}

MaybeLocal<Object> GetPerContextExports(Local<Context> context) {
  Isolate* isolate = context->GetIsolate();
  EscapableHandleScope handle_scope(isolate);

  Local<Object> global = context->Global();
  Local<Private> key = Private::ForApi(isolate,
      FIXED_ONE_BYTE_STRING(isolate, "node:per_context_binding_exports"));

  Local<Value> existing_value;
  if (!global->GetPrivate(context, key).ToLocal(&existing_value))
    return MaybeLocal<Object>();
  if (existing_value->IsObject())
    return handle_scope.Escape(existing_value.As<Object>());

  Local<Object> exports = Object::New(isolate);
  if (context->Global()->SetPrivate(context, key, exports).IsNothing())
    return MaybeLocal<Object>();
  return handle_scope.Escape(exports);
}

// Any initialization logic should be performed in
// InitializeContext, because embedders don't necessarily
// call NewContext and so they will experience breakages.
Local<Context> NewContext(Isolate* isolate,
                          Local<ObjectTemplate> object_template) {
  auto context = Context::New(isolate, nullptr, object_template);
  if (context.IsEmpty()) return context;

  if (!InitializeContext(context)) {
    return Local<Context>();
  }

  return context;
}

// This runs at runtime, regardless of whether the context
// is created from a snapshot.
void InitializeContextRuntime(Local<Context> context) {
  Isolate* isolate = context->GetIsolate();
  HandleScope handle_scope(isolate);

  // Delete `Intl.v8BreakIterator`
  // https://github.com/nodejs/node/issues/14909
  Local<String> intl_string = FIXED_ONE_BYTE_STRING(isolate, "Intl");
  Local<String> break_iter_string =
    FIXED_ONE_BYTE_STRING(isolate, "v8BreakIterator");
  Local<Value> intl_v;
  if (context->Global()->Get(context, intl_string).ToLocal(&intl_v) &&
      intl_v->IsObject()) {
    Local<Object> intl = intl_v.As<Object>();
    intl->Delete(context, break_iter_string).FromJust();
  }

  // Delete `Atomics.wake`
  // https://github.com/nodejs/node/issues/21219
  Local<String> atomics_string = FIXED_ONE_BYTE_STRING(isolate, "Atomics");
  Local<String> wake_string = FIXED_ONE_BYTE_STRING(isolate, "wake");
  Local<Value> atomics_v;
  if (context->Global()->Get(context, atomics_string).ToLocal(&atomics_v) &&
      atomics_v->IsObject()) {
    Local<Object> atomics = atomics_v.As<Object>();
    atomics->Delete(context, wake_string).FromJust();
  }
}

bool InitializeContextForSnapshot(Local<Context> context) {
  Isolate* isolate = context->GetIsolate();
  HandleScope handle_scope(isolate);

  context->SetEmbedderData(ContextEmbedderIndex::kAllowWasmCodeGeneration,
                           True(isolate));

  {
    // Run per-context JS files.
    Context::Scope context_scope(context);
    Local<Object> exports;

    Local<String> primordials_string =
        FIXED_ONE_BYTE_STRING(isolate, "primordials");
    Local<String> global_string = FIXED_ONE_BYTE_STRING(isolate, "global");
    Local<String> exports_string = FIXED_ONE_BYTE_STRING(isolate, "exports");

    // Create primordials first and make it available to per-context scripts.
    Local<Object> primordials = Object::New(isolate);
    if (!primordials->SetPrototype(context, Null(isolate)).FromJust() ||
        !GetPerContextExports(context).ToLocal(&exports) ||
        !exports->Set(context, primordials_string, primordials).FromJust()) {
      return false;
    }

    static const char* context_files[] = {"internal/per_context/primordials",
                                          "internal/per_context/domexception",
                                          "internal/per_context/messageport",
                                          nullptr};

    for (const char** module = context_files; *module != nullptr; module++) {
      std::vector<Local<String>> parameters = {
          global_string, exports_string, primordials_string};
      Local<Value> arguments[] = {context->Global(), exports, primordials};
      MaybeLocal<Function> maybe_fn =
          native_module::NativeModuleEnv::LookupAndCompile(
              context, *module, &parameters, nullptr);
      if (maybe_fn.IsEmpty()) {
        return false;
      }
      Local<Function> fn = maybe_fn.ToLocalChecked();
      MaybeLocal<Value> result =
          fn->Call(context, Undefined(isolate),
                   arraysize(arguments), arguments);
      // Execution failed during context creation.
      // TODO(joyeecheung): deprecate this signature and return a MaybeLocal.
      if (result.IsEmpty()) {
        return false;
      }
    }
  }

  return true;
}

bool InitializeContext(Local<Context> context) {
  if (!InitializeContextForSnapshot(context)) {
    return false;
  }

  InitializeContextRuntime(context);
  return true;
}

uv_loop_t* GetCurrentEventLoop(Isolate* isolate) {
  HandleScope handle_scope(isolate);
  Local<Context> context = isolate->GetCurrentContext();
  if (context.IsEmpty()) return nullptr;
  Environment* env = Environment::GetCurrent(context);
  if (env == nullptr) return nullptr;
  return env->event_loop();
}

void AddLinkedBinding(Environment* env, const node_module& mod) {
  CHECK_NOT_NULL(env);
  Mutex::ScopedLock lock(env->extra_linked_bindings_mutex());

  node_module* prev_head = env->extra_linked_bindings_head();
  env->extra_linked_bindings()->push_back(mod);
  if (prev_head != nullptr)
    prev_head->nm_link = &env->extra_linked_bindings()->back();
}

void AddLinkedBinding(Environment* env,
                      const char* name,
                      addon_context_register_func fn,
                      void* priv) {
  node_module mod = {
    NODE_MODULE_VERSION,
    NM_F_LINKED,
    nullptr,  // nm_dso_handle
    nullptr,  // nm_filename
    nullptr,  // nm_register_func
    fn,
    name,
    priv,
    nullptr   // nm_link
  };
  AddLinkedBinding(env, mod);
}

}  // namespace node
