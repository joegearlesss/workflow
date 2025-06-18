# Developer Guide - Workflow Library

## Getting Started

### Prerequisites
- Bun 1.0+ installed
- TypeScript knowledge
- Functional programming familiarity

### Library Installation

```bash
# In your TypeScript project
bun add @workflow/core

# Or with npm
npm install @workflow/core
```

### Basic Usage

```typescript
import { Workflow } from '@workflow/core';

// Define a workflow
Workflow.define("my-workflow", async (ctx) => {
    await ctx.step("step1", async () => {
        console.log("Executing step 1");
        return { data: "step1-result" };
    });
    
    await ctx.sleep("wait", 1000);
    
    await ctx.step("step2", async () => {
        console.log("Executing step 2");
    });
});

// Start execution
await Workflow.start("my-workflow", "execution-id-123");
```

### Development Setup

```bash
# Clone the workflow library repository
git clone <workflow-repo-url>
cd workflow

# Initialize workspace
bun install

# Create workspace structure
mkdir -p packages/{core,database,types,utils}
mkdir -p apps/{server,cli,dashboard}
mkdir -p tests/{unit,integration,e2e}

# Install shared dependencies at root
bun add -d typescript @types/node @types/bun

# Create root TypeScript configuration
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "composite": true,
    "strict": true,
    "downlevelIteration": true,
    "skipLibCheck": true,
    "jsx": "preserve",
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "allowJs": true,
    "types": ["bun-types"]
  }
}
EOF
```

## Library Structure

```
├── package.json                 # Root workspace configuration
├── packages/                    # Core library packages
│   ├── core/                    # Main workflow library
│   │   ├── src/
│   │   │   ├── workflow.ts      # Main Workflow class with fluent API
│   │   │   ├── workflow.test.ts # Unit tests for workflow
│   │   │   ├── context.ts       # WorkflowContext implementation
│   │   │   ├── context.test.ts  # Unit tests for context
│   │   │   ├── engine.ts        # Execution engine
│   │   │   ├── engine.test.ts   # Unit tests for engine
│   │   │   ├── state.ts         # State management
│   │   │   ├── state.test.ts    # Unit tests for state
│   │   │   └── index.ts         # Public exports
│   │   ├── package.json         # Publishable package
│   │   └── tsconfig.json
│   ├── database/                # SQLite persistence
│   │   ├── src/
│   │   │   ├── schema.ts        # Database schema
│   │   │   ├── schema.test.ts   # Unit tests for schema
│   │   │   ├── repository.ts    # Data access layer
│   │   │   ├── repository.test.ts # Unit tests for repository
│   │   │   ├── connection.ts    # Connection management
│   │   │   └── connection.test.ts # Unit tests for connection
│   │   └── package.json
│   ├── types/                   # TypeScript definitions
│   │   ├── src/
│   │   │   ├── workflow.ts      # Workflow types
│   │   │   ├── context.ts       # Context types
│   │   │   └── common.ts        # Common types
│   │   └── package.json
│   └── utils/                   # Utility functions
│       ├── src/
│       │   ├── logger.ts        # Logging utilities
│       │   ├── logger.test.ts   # Unit tests for logger
│       │   ├── validation.ts    # Validation helpers
│       │   └── validation.test.ts # Unit tests for validation
│       └── package.json
├── apps/                        # Development applications
│   ├── server/                  # Development server
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── index.test.ts    # Integration tests
│   ├── cli/                     # CLI tool for testing
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── index.test.ts    # CLI tests
│   └── dashboard/               # Web dashboard
│       ├── src/
│       │   ├── index.ts
│       │   └── index.test.ts    # Dashboard tests
└── tests/                       # End-to-end test suites
    └── e2e/                     # End-to-end tests
        ├── workflow-execution.test.ts
        ├── panic-recovery.test.ts
        └── integration.test.ts
```

## Development Guidelines

### 1. Core Library API

**Main Workflow Class (@workflow/core)**
```typescript
// packages/core/src/workflow.ts
import type { WorkflowDefinition, WorkflowContext, ExecutionResult } from '@workflow/types';
import { WorkflowEngine } from './engine';
import { createContext } from './context';

export namespace Workflow {
  const definitions = new Map<string, WorkflowDefinition>();
  
  export const define = (name: string, handler: (ctx: WorkflowContext) => Promise<void>): void => {
    definitions.set(name, { name, handler });
  };
  
  export const start = async (name: string, executionId: string, input?: any): Promise<ExecutionResult> => {
    const definition = definitions.get(name);
    if (!definition) {
      throw new Error(`Workflow "${name}" not found`);
    }
    
    const context = createContext(name, executionId, input);
    return await WorkflowEngine.execute(definition, context);
  };
  
  export const resume = async (executionId: string): Promise<ExecutionResult> => {
    return await WorkflowEngine.resume(executionId);
  };
  
  export const getStatus = async (executionId: string): Promise<ExecutionStatus> => {
    return await WorkflowEngine.getStatus(executionId);
  };
}
```

**Workflow Context Implementation**
```typescript
// packages/core/src/context.ts
import type { WorkflowContext, StepResult } from '@workflow/types';
import { StateManager } from './state';

export const createContext = (workflowName: string, executionId: string, input?: any): WorkflowContext => {
  const state = StateManager.load(executionId);
  
  return {
    workflowName,
    executionId,
    input,
    attempt: state.attempt || 1,
    
    step: async <T>(stepId: string, handler: () => Promise<T>): Promise<T> => {
      // Check if step already completed
      const existingResult = state.steps[stepId];
      if (existingResult?.status === 'completed') {
        return existingResult.result as T;
      }
      
      try {
        // Mark step as running
        await StateManager.updateStep(executionId, stepId, 'running');
        
        // Execute step
        const result = await handler();
        
        // Mark step as completed
        await StateManager.updateStep(executionId, stepId, 'completed', result);
        
        return result;
      } catch (error) {
        // Handle retry logic
        const maxRetries = 3;
        const currentAttempt = state.attempt || 1;
        
        if (currentAttempt < maxRetries) {
          // Increment attempt counter and retry
          await StateManager.incrementAttempt(executionId);
          await StateManager.updateStep(executionId, stepId, 'retrying', null, error);
          
          // Log retry attempt
          console.warn(`Step "${stepId}" failed on attempt ${currentAttempt}, retrying...`, error.message);
          
          // Re-throw error to trigger retry by engine
          throw error;
        }
        
        // Max retries exceeded - mark step as permanently failed
        await StateManager.updateStep(executionId, stepId, 'failed', null, error);
        
        // Log final failure
        console.error(`Step "${stepId}" failed permanently after ${maxRetries} attempts:`, error);
        
        // Re-throw to fail the entire workflow
        throw error;
      }
    },
    
    sleep: async (stepId: string, ms: number): Promise<void> => {
      // Check if sleep already completed
      const existingResult = state.steps[stepId];
      if (existingResult?.status === 'completed') {
        return;
      }
      
      // Store sleep end time
      const wakeTime = Date.now() + ms;
      await StateManager.updateStep(executionId, stepId, 'sleeping', { wakeTime });
      
      // Schedule resume
      setTimeout(async () => {
        await StateManager.updateStep(executionId, stepId, 'completed');
        await WorkflowEngine.resume(executionId);
      }, ms);
      
      // Pause execution
      throw new SleepInterrupt(wakeTime);
    }
  };
};
```

### 2. Type Definitions

**Core Types (@workflow/types)**
```typescript
// packages/types/src/workflow.ts
export interface WorkflowDefinition {
  readonly name: string;
  readonly handler: (ctx: WorkflowContext) => Promise<void>;
}

export interface WorkflowContext {
  readonly workflowName: string;
  readonly executionId: string;
  readonly input?: any;
  readonly attempt: number;
  readonly restartAttempt: number;
  
  step<T>(stepId: string, handler: () => Promise<T>): Promise<T>;
  sleep(stepId: string, ms: number): Promise<void>;
}

export interface ExecutionResult {
  readonly executionId: string;
  readonly status: ExecutionStatus;
  readonly startedAt: Date;
  readonly completedAt?: Date;
  readonly error?: Error;
  readonly steps: Record<string, StepResult>;
  readonly restartAttempt: number;
}

export type ExecutionStatus = 'running' | 'completed' | 'failed' | 'sleeping' | 'panicked' | 'restarting';

export interface StepResult {
  readonly stepId: string;
  readonly status: StepStatus;
  readonly result?: any;
  readonly error?: Error;
  readonly startedAt: Date;
  readonly completedAt?: Date;
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'sleeping' | 'retrying';

// packages/types/src/common.ts
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export class SleepInterrupt extends Error {
  constructor(public readonly wakeTime: number) {
    super('Workflow sleeping');
    this.name = 'SleepInterrupt';
  }
}

export class WorkflowError extends Error {
  constructor(
    message: string,
    public readonly stepId: string,
    public readonly attempt: number,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'WorkflowError';
  }
}

export class PanicError extends Error {
  constructor(
    message: string,
    public readonly stepId: string,
    public readonly attempt: number,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'PanicError';
  }
}

export interface RetryConfig {
  readonly maxAttempts: number;
  readonly backoffMs?: number;
  readonly exponentialBackoff?: boolean;
}

export interface PanicConfig {
  readonly maxRestartAttempts: number;
  readonly restartDelayMs: number;
  readonly enableAutoRestart: boolean;
}
```
### 4. Error Handling and Recovery

**Workflow Engine with Error Handling and Panic Recovery**
```typescript
// packages/core/src/engine.ts
import type { WorkflowDefinition, WorkflowContext, ExecutionResult } from '@workflow/types';
import { WorkflowError, SleepInterrupt, PanicError } from '@workflow/types';
import { StateManager } from './state';

export namespace WorkflowEngine {
  export const execute = async (
    definition: WorkflowDefinition, 
    context: WorkflowContext
  ): Promise<ExecutionResult> => {
    const { executionId } = context;
    
    try {
      // Mark workflow as running
      await StateManager.updateExecution(executionId, 'running');
      
      // Execute workflow handler with panic recovery
      await executeWithPanicRecovery(definition, context);
      
      // Mark workflow as completed
      await StateManager.updateExecution(executionId, 'completed');
      
      return await StateManager.getExecutionResult(executionId);
      
    } catch (error) {
      if (error instanceof SleepInterrupt) {
        // Workflow is sleeping - this is expected
        await StateManager.updateExecution(executionId, 'sleeping');
        return await StateManager.getExecutionResult(executionId);
      }
      
      if (error instanceof PanicError) {
        // Workflow panicked - mark for restart
        await StateManager.updateExecution(executionId, 'panicked', error);
        
        // Schedule automatic restart after panic recovery delay
        setTimeout(async () => {
          try {
            console.warn(`Restarting workflow ${executionId} after panic: ${error.message}`);
            await restart(executionId);
          } catch (restartError) {
            console.error(`Failed to restart workflow ${executionId}:`, restartError);
            await StateManager.updateExecution(executionId, 'failed', restartError);
          }
        }, 5000); // 5 second delay before restart
        
        throw error;
      }
      
      if (error instanceof WorkflowError) {
        // Workflow step failed permanently
        await StateManager.updateExecution(executionId, 'failed', error);
        throw error;
      }
      
      // Unexpected error - treat as panic
      const panicError = new PanicError(
        `Workflow execution panicked: ${error.message}`,
        'unknown',
        context.attempt,
        error instanceof Error ? error : new Error(String(error))
      );
      
      await StateManager.updateExecution(executionId, 'panicked', panicError);
      
      // Schedule automatic restart
      setTimeout(async () => {
        try {
          console.warn(`Restarting workflow ${executionId} after unexpected panic`);
          await restart(executionId);
        } catch (restartError) {
          console.error(`Failed to restart workflow ${executionId}:`, restartError);
          await StateManager.updateExecution(executionId, 'failed', restartError);
        }
      }, 5000);
      
      throw panicError;
    }
  };
  
  const executeWithPanicRecovery = async (
    definition: WorkflowDefinition,
    context: WorkflowContext
  ): Promise<void> => {
    try {
      await definition.handler(context);
    } catch (error) {
      // Check if this is a critical system error that should trigger panic
      if (isSystemPanic(error)) {
        throw new PanicError(
          `System panic detected: ${error.message}`,
          'system',
          context.attempt,
          error instanceof Error ? error : new Error(String(error))
        );
      }
      
      // Re-throw other errors normally
      throw error;
    }
  };
  
  const isSystemPanic = (error: any): boolean => {
    // Detect system-level panics that require restart
    const panicIndicators = [
      'out of memory',
      'stack overflow',
      'segmentation fault',
      'process killed',
      'system error',
      'fatal error',
      'unhandled promise rejection',
      'uncaught exception'
    ];
    
    const errorMessage = error?.message?.toLowerCase() || '';
    return panicIndicators.some(indicator => errorMessage.includes(indicator));
  };
  
  export const restart = async (executionId: string): Promise<ExecutionResult> => {
    const state = await StateManager.load(executionId);
    if (!state) {
      throw new Error(`Execution ${executionId} not found`);
    }
    
    if (state.status !== 'panicked') {
      throw new Error(`Cannot restart execution ${executionId} with status ${state.status}`);
    }
    
    // Reset panic state and increment restart attempt
    await StateManager.incrementRestartAttempt(executionId);
    await StateManager.updateExecution(executionId, 'restarting');
    
    // Recreate context with fresh state
    const context = await StateManager.recreateContext(executionId);
    const definition = await StateManager.getWorkflowDefinition(state.workflowName);
    
    console.log(`Restarting workflow ${executionId} (attempt ${context.restartAttempt})`);
    
    return await execute(definition, context);
  };
  
  export const resume = async (executionId: string): Promise<ExecutionResult> => {
    const state = await StateManager.load(executionId);
    if (!state) {
      throw new Error(`Execution ${executionId} not found`);
    }
    
    if (state.status !== 'sleeping') {
      throw new Error(`Cannot resume execution ${executionId} with status ${state.status}`);
    }
    
    // Recreate context and continue execution
    const context = await StateManager.recreateContext(executionId);
    const definition = await StateManager.getWorkflowDefinition(state.workflowName);
    
    return await execute(definition, context);
  };
  
  export const getStatus = async (executionId: string): Promise<ExecutionResult> => {
    return await StateManager.getExecutionResult(executionId);
  };
}
```

**Enhanced Context with Configurable Retry and Panic Recovery**
```typescript
// packages/core/src/context.ts - Enhanced version
export const createContext = (
  workflowName: string, 
  executionId: string, 
  input?: any,
  retryConfig?: RetryConfig,
  panicConfig?: PanicConfig
): WorkflowContext => {
  const state = StateManager.load(executionId);
  const defaultRetryConfig: RetryConfig = {
    maxAttempts: 3,
    backoffMs: 1000,
    exponentialBackoff: true
  };
  const defaultPanicConfig: PanicConfig = {
    maxRestartAttempts: 3,
    restartDelayMs: 5000,
    enableAutoRestart: true
  };
  const retryConf = { ...defaultRetryConfig, ...retryConfig };
  const panicConf = { ...defaultPanicConfig, ...panicConfig };
  
  return {
    workflowName,
    executionId,
    input,
    attempt: state.attempt || 1,
    restartAttempt: state.restartAttempt || 1,
    
    step: async <T>(stepId: string, handler: () => Promise<T>): Promise<T> => {
      // Check if step already completed
      const existingResult = state.steps[stepId];
      if (existingResult?.status === 'completed') {
        return existingResult.result as T;
      }
      
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= retryConf.maxAttempts; attempt++) {
        try {
          // Mark step as running
          await StateManager.updateStep(executionId, stepId, 'running', null, null, attempt);
          
          // Execute step with panic detection
          const result = await executeStepWithPanicDetection(handler, stepId, attempt);
          
          // Mark step as completed
          await StateManager.updateStep(executionId, stepId, 'completed', result);
          
          return result;
          
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // Check if this is a panic-level error
          if (isPanicError(lastError)) {
            await StateManager.updateStep(executionId, stepId, 'failed', null, lastError, attempt);
            throw new PanicError(
              `Step "${stepId}" caused system panic: ${lastError.message}`,
              stepId,
              attempt,
              lastError
            );
          }
          
          if (attempt < retryConf.maxAttempts) {
            // Calculate backoff delay
            const backoffMs = retryConf.exponentialBackoff 
              ? retryConf.backoffMs! * Math.pow(2, attempt - 1)
              : retryConf.backoffMs!;
            
            // Mark step as retrying
            await StateManager.updateStep(executionId, stepId, 'retrying', null, lastError, attempt);
            
            console.warn(`Step "${stepId}" failed on attempt ${attempt}/${retryConf.maxAttempts}, retrying in ${backoffMs}ms...`, lastError.message);
            
            // Wait before retry
            if (backoffMs > 0) {
              await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
          }
        }
      }
      
      // All retries exhausted
      await StateManager.updateStep(executionId, stepId, 'failed', null, lastError, retryConf.maxAttempts);
      
      const workflowError = new WorkflowError(
        `Step "${stepId}" failed after ${retryConf.maxAttempts} attempts: ${lastError!.message}`,
        stepId,
        retryConf.maxAttempts,
        lastError!
      );
      
      throw workflowError;
    },
    
    sleep: async (stepId: string, ms: number): Promise<void> => {
      // Check if sleep already completed
      const existingResult = state.steps[stepId];
      if (existingResult?.status === 'completed') {
        return;
      }
      
      // Store sleep end time
      const wakeTime = Date.now() + ms;
      await StateManager.updateStep(executionId, stepId, 'sleeping', { wakeTime });
      
      // Schedule resume
      setTimeout(async () => {
        await StateManager.updateStep(executionId, stepId, 'completed');
        await WorkflowEngine.resume(executionId);
      }, ms);
      
      // Pause execution
      throw new SleepInterrupt(wakeTime);
    }
  };
};

const executeStepWithPanicDetection = async <T>(
  handler: () => Promise<T>,
  stepId: string,
  attempt: number
): Promise<T> => {
  try {
    return await handler();
  } catch (error) {
    // Enhanced panic detection
    if (isPanicError(error)) {
      throw new PanicError(
        `Panic detected in step "${stepId}": ${error.message}`,
        stepId,
        attempt,
        error instanceof Error ? error : new Error(String(error))
      );
    }
    throw error;
  }
};

const isPanicError = (error: any): boolean => {
  const panicIndicators = [
    'out of memory',
    'stack overflow',
    'segmentation fault',
    'process killed',
    'system error',
    'fatal error',
    'unhandled promise rejection',
    'uncaught exception',
    'maximum call stack',
    'heap out of memory',
    'cannot allocate memory'
  ];
  
  const errorMessage = error?.message?.toLowerCase() || '';
  const errorStack = error?.stack?.toLowerCase() || '';
  
  return panicIndicators.some(indicator => 
    errorMessage.includes(indicator) || errorStack.includes(indicator)
  );
};
```

**Main Library Package (@workflow/core)**
```json
// packages/core/package.json
{
  "name": "@workflow/core",
  "version": "1.0.0",
  "description": "A TypeScript workflow library with fluent API",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist/**/*",
    "README.md"
  ],
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target node --format esm && bun build src/index.ts --outdir dist --outfile index.cjs --target node --format cjs",
    "typecheck": "bun tsc --noEmit",
    "test": "bun test",
    "prepublishOnly": "bun run build"
  },
  "dependencies": {
    "@workflow/types": "workspace:*",
    "@workflow/database": "workspace:*",
    "@workflow/utils": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/bun": "latest"
  },
  "peerDependencies": {
    "typescript": ">=4.5.0"
  },
  "keywords": [
    "workflow",
    "typescript",
    "async",
    "state-machine",
    "bun"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/your-org/workflow.git"
  },
  "license": "MIT"
}

// packages/core/src/index.ts
export { Workflow } from './workflow';
export type { 
  WorkflowContext, 
  WorkflowDefinition, 
  ExecutionResult, 
  ExecutionStatus,
  StepResult,
  StepStatus 
} from '@workflow/types';
```
{
  "name": "workflow-workspace",
  "workspaces": ["packages/*", "apps/*", "shared/*"],
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/bun": "latest"
  }
}

// Root tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "composite": true,
    "strict": true,
    "downlevelIteration": true,
    "skipLibCheck": true,
    "jsx": "preserve",
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "allowJs": true,
    "types": ["bun-types"]
  },
  "references": [
    { "path": "./shared/types" },
    { "path": "./shared/utils" },
    { "path": "./packages/database" },
    { "path": "./packages/core" },
    { "path": "./packages/executors" },
    { "path": "./packages/api" },
    { "path": "./apps/server" },
    { "path": "./apps/cli" },
    { "path": "./apps/dashboard" }
  ]
}

// packages/core/package.json
{
  "name": "@workflow/core",
  "dependencies": {
    "@workflow/types": "workspace:*",
    "@workflow/utils": "workspace:*"
  }
}

// packages/core/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../../shared/types" },
    { "path": "../../shared/utils" }
  ]
}

// packages/database/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "references": [
    { "path": "../../shared/types" }
  ]
}

// apps/server/package.json
{
  "name": "server",
  "dependencies": {
    "@workflow/core": "workspace:*",
    "@workflow/database": "workspace:*",
    "@workflow/api": "workspace:*"
  }
}
```

**Cross-Package Imports**
```typescript
// In packages/core/src/engine.ts
import type { Workflow, Step } from '@workflow/types';
import { Logger } from '@workflow/utils';
import { Database } from '@workflow/database';

// In apps/server/src/index.ts
import { WorkflowEngine } from '@workflow/core';
import { createAPI } from '@workflow/api';
```

### 2. Functional Programming Principles

**Use Pure Functions**
```typescript
// ✅ Good - Pure function
namespace StepValidator {
  export const validateStep = (step: Step.Definition): ValidationResult => {
    if (!step.id || !step.type) {
      return { valid: false, errors: ['Missing required fields'] };
    }
    return { valid: true, errors: [] };
  };
}

// ❌ Avoid - Impure function with side effects
const validateStepBad = (step: Step.Definition) => {
  console.log('Validating step'); // Side effect
  if (!step.id) throw new Error('Invalid'); // Exception throwing
};
```

**Immutable Data Structures**
```typescript
// ✅ Good - Immutable updates
namespace WorkflowState {
  export const updateStepStatus = (
    state: State.Execution,
    stepId: string,
    status: Step.Status
  ): State.Execution => ({
    ...state,
    steps: {
      ...state.steps,
      [stepId]: { ...state.steps[stepId], status }
    }
  });
}

// ❌ Avoid - Mutating existing objects
const updateStepStatusBad = (state: State.Execution, stepId: string, status: Step.Status) => {
  state.steps[stepId].status = status; // Mutation
  return state;
};
```

### 3. Package-Specific Namespace Organization

**Core Workflow Package (@workflow/core)**
```typescript
// packages/core/src/engine.ts
export namespace WorkflowEngine {
  export const create = (definition: Workflow.Definition): Result<Workflow.Instance> => { /* */ };
  export const execute = (instance: Workflow.Instance): Promise<ExecutionResult> => { /* */ };
  export const validate = (definition: Workflow.Definition): ValidationResult => { /* */ };
}

// packages/workflow-core/src/executor.ts
export namespace StepExecutor {
  export const execute = async (step: Step.Definition, context: Step.ExecutionContext): Promise<Result<Step.ExecutionResult>> => { /* */ };
  export const register = (type: string, executor: Step.Executor): void => { /* */ };
}
```

**Database Package (@workflow/database)**
```typescript
// packages/database/src/repository.ts
import { Database } from "bun:sqlite";
import type { Result, Workflow } from '@workflow/types';

export namespace WorkflowRepository {
  export const save = async (db: Database, workflow: Workflow.Instance): Promise<Result<void>> => {
    try {
      const stmt = db.prepare(`
        INSERT INTO workflows (id, name, definition, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        workflow.definition.id,
        workflow.definition.name,
        JSON.stringify(workflow.definition),
        workflow.createdAt.toISOString(),
        new Date().toISOString()
      );
      
      return { success: true, data: undefined };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };
  
  export const findById = async (db: Database, id: string): Promise<Result<Workflow.Instance | null>> => {
    try {
      const stmt = db.prepare("SELECT * FROM workflows WHERE id = ?");
      const row = stmt.get(id) as any;
      
      if (!row) {
        return { success: true, data: null };
      }
      
      const workflow: Workflow.Instance = {
        definition: JSON.parse(row.definition),
        createdAt: new Date(row.created_at),
        version: 1
      };
      
      return { success: true, data: workflow };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };
  
  export const findAll = async (db: Database): Promise<Result<Workflow.Instance[]>> => {
    try {
      const stmt = db.prepare("SELECT * FROM workflows ORDER BY created_at DESC");
      const rows = stmt.all() as any[];
      
      const workflows: Workflow.Instance[] = rows.map(row => ({
        definition: JSON.parse(row.definition),
        createdAt: new Date(row.created_at),
        version: 1
      }));
      
      return { success: true, data: workflows };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };
}

export namespace ExecutionRepository {
  export const create = async (db: Database, execution: State.Execution): Promise<Result<string>> => {
    try {
      const stmt = db.prepare(`
        INSERT INTO workflow_executions (id, workflow_id, status, started_at, state)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const executionId = crypto.randomUUID();
      stmt.run(
        executionId,
        execution.workflowId,
        execution.status,
        execution.startedAt.toISOString(),
        JSON.stringify(execution)
      );
      
      return { success: true, data: executionId };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };
  
  export const update = async (db: Database, id: string, state: State.Execution): Promise<Result<void>> => {
    try {
      const stmt = db.prepare(`
        UPDATE workflow_executions 
        SET status = ?, completed_at = ?, state = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      
      stmt.run(
        state.status,
        state.completedAt?.toISOString() || null,
        JSON.stringify(state),
        id
      );
      
      return { success: true, data: undefined };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };
  
  export const findByWorkflowId = async (db: Database, workflowId: string): Promise<Result<State.Execution[]>> => {
    try {
      const stmt = db.prepare("SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY started_at DESC");
      const rows = stmt.all(workflowId) as any[];
      
      const executions: State.Execution[] = rows.map(row => JSON.parse(row.state));
      
      return { success: true, data: executions };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };
}
```

**API Package (@workflow/api)**
```typescript
// packages/api/src/handlers/workflows.ts
export namespace WorkflowHandlers {
  export const createWorkflow = async (req: Request, res: Response): Promise<void> => { /* */ };
  export const getWorkflow = async (req: Request, res: Response): Promise<void> => { /* */ };
  export const executeWorkflow = async (req: Request, res: Response): Promise<void> => { /* */ };
}
```

### 4. Shared Type Definitions

**Core Types (@workflow/types)**
```typescript
// shared/types/src/workflow.ts
export namespace Workflow {
  export interface Definition {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly steps: readonly Step.Definition[];
    readonly metadata?: Record<string, unknown>;
  }

  export interface Instance {
    readonly definition: Definition;
    readonly createdAt: Date;
    readonly version: number;
  }
}

// shared/types/src/step.ts
export namespace Step {
  export interface Definition {
    readonly id: string;
    readonly type: string;
    readonly config: Record<string, unknown>;
    readonly dependencies?: readonly string[];
    readonly timeout?: number;
  }

  export type Status = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  
  export interface ExecutionContext {
    readonly stepId: string;
    readonly workflowId: string;
    readonly input: Record<string, unknown>;
    readonly previousResults: Record<string, unknown>;
  }

  export interface Executor {
    (config: Record<string, unknown>, context: ExecutionContext): Promise<ExecutionResult>;
  }
}

// shared/types/src/common.ts
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
```

### 5. Database Schema (@workflow/database)

**SQLite Tables**
```typescript
// packages/database/src/schema.ts
import { Database } from "bun:sqlite";

export namespace Schema {
  export const createTables = (db: Database): void => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        definition TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS workflow_executions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        error_message TEXT,
        state TEXT NOT NULL,
        FOREIGN KEY (workflow_id) REFERENCES workflows (id)
      );

      CREATE TABLE IF NOT EXISTS step_executions (
        id TEXT PRIMARY KEY,
        execution_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        input TEXT,
        output TEXT,
        error_message TEXT,
        FOREIGN KEY (execution_id) REFERENCES workflow_executions (id)
      );
    `);
  };
}

// packages/database/src/connection.ts
import { Database } from "bun:sqlite";
import { Schema } from "./schema";

export namespace DatabaseConnection {
  let db: Database | null = null;
  
  export const initialize = (path: string = "./workflow.db"): Database => {
    if (db) {
      return db;
    }
    
    db = new Database(path);
    
    // Enable foreign keys
    db.exec("PRAGMA foreign_keys = ON");
    
    // Create tables
    Schema.createTables(db);
    
    return db;
  };
  
  export const getConnection = (): Database => {
    if (!db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return db;
  };
  
  export const close = (): void => {
    if (db) {
      db.close();
      db = null;
    }
  };
}
```

### 6. Error Handling

**Result Type Pattern**
```typescript
// shared/types/src/common.ts
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

// Usage in workflow engine
// packages/core/src/executor.ts
import type { Result, Step } from '@workflow/types';

export namespace StepExecutor {
  export const execute = async (
    step: Step.Definition,
    context: Step.ExecutionContext
  ): Promise<Result<Step.ExecutionResult>> => {
    try {
      const executor = getExecutor(step.type);
      if (!executor) {
        return { 
          success: false, 
          error: new Error(`Unknown step type: ${step.type}`) 
        };
      }
      
      const result = await executor(step.config, context);
      return { success: true, data: result };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };
}
```

### 7. Testing Strategy

**Workspace Testing Setup**
```bash
# Bun includes built-in testing, no additional dependencies needed
# Just ensure @types/bun is installed for type support

# Create test scripts in root package.json
{
  "scripts": {
    "test": "bun test",
    "test:unit": "bun test **/*.test.ts",
    "test:e2e": "bun test tests/e2e",
    "test:packages": "bun --filter='packages/*' test",
    "test:apps": "bun --filter='apps/*' test",
    "typecheck": "bun tsc --noEmit",
    "typecheck:packages": "bun --filter='packages/*' run typecheck"
  }
}
```

**Co-located Unit Tests**
```typescript
// packages/core/src/engine.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { WorkflowEngine } from './engine';
import { PanicError, WorkflowError } from '@workflow/types';
import { StateManager } from './state';

describe('WorkflowEngine', () => {
  beforeEach(async () => {
    // Setup test database
    await StateManager.initialize(':memory:');
  });

  afterEach(async () => {
    // Cleanup
    await StateManager.close();
  });

  test('should execute workflow successfully', async () => {
    const definition = {
      name: 'test-workflow',
      handler: async (ctx) => {
        await ctx.step('step1', async () => 'result1');
      }
    };

    const context = {
      workflowName: 'test-workflow',
      executionId: 'test-exec-1',
      attempt: 1,
      restartAttempt: 1,
      step: async (id, handler) => handler(),
      sleep: async () => {}
    };

    const result = await WorkflowEngine.execute(definition, context);
    
    expect(result.status).toBe('completed');
    expect(result.executionId).toBe('test-exec-1');
  });

  test('should handle panic errors and schedule restart', async () => {
    const definition = {
      name: 'panic-workflow',
      handler: async (ctx) => {
        throw new Error('out of memory');
      }
    };

    const context = {
      workflowName: 'panic-workflow',
      executionId: 'panic-exec-1',
      attempt: 1,
      restartAttempt: 1,
      step: async (id, handler) => handler(),
      sleep: async () => {}
    };

    await expect(WorkflowEngine.execute(definition, context))
      .rejects.toThrow(PanicError);
  });

  test('should restart panicked workflow', async () => {
    // First, create a panicked execution
    await StateManager.updateExecution('restart-test', 'panicked');
    
    const result = await WorkflowEngine.restart('restart-test');
    
    expect(result.status).toBe('restarting');
  });
});
```

**Context Unit Tests**
```typescript
// packages/core/src/context.test.ts
import { describe, test, expect, beforeEach } from 'bun:test';
import { createContext } from './context';
import { PanicError, WorkflowError } from '@workflow/types';

describe('WorkflowContext', () => {
  test('should execute step successfully', async () => {
    const context = createContext('test-workflow', 'test-exec', {});
    
    const result = await context.step('test-step', async () => {
      return 'step-result';
    });
    
    expect(result).toBe('step-result');
  });

  test('should detect panic errors', async () => {
    const context = createContext('panic-workflow', 'panic-exec', {});
    
    await expect(context.step('panic-step', async () => {
      throw new Error('out of memory');
    })).rejects.toThrow(PanicError);
  });

  test('should retry failed steps', async () => {
    let attempts = 0;
    const context = createContext('retry-workflow', 'retry-exec', {}, {
      maxAttempts: 3,
      backoffMs: 10
    });
    
    const result = await context.step('retry-step', async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('temporary failure');
      }
      return 'success';
    });
    
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  test('should throw WorkflowError after max retries', async () => {
    const context = createContext('fail-workflow', 'fail-exec', {}, {
      maxAttempts: 2,
      backoffMs: 10
    });
    
    await expect(context.step('fail-step', async () => {
      throw new Error('persistent failure');
    })).rejects.toThrow(WorkflowError);
  });
});
```

**Database Repository Tests**
```typescript
// packages/database/src/repository.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { WorkflowRepository, ExecutionRepository } from './repository';
import { Schema } from './schema';

describe('WorkflowRepository', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
    Schema.createTables(db);
  });

  afterEach(() => {
    db.close();
  });

  test('should save and retrieve workflow', async () => {
    const workflow = {
      definition: {
        id: 'test-workflow',
        name: 'Test Workflow',
        steps: []
      },
      createdAt: new Date(),
      version: 1
    };

    const saveResult = await WorkflowRepository.save(db, workflow);
    expect(saveResult.success).toBe(true);

    const findResult = await WorkflowRepository.findById(db, 'test-workflow');
    expect(findResult.success).toBe(true);
    expect(findResult.data?.definition.name).toBe('Test Workflow');
  });

  test('should handle database errors gracefully', async () => {
    db.close(); // Force database error

    const workflow = {
      definition: { id: 'test', name: 'Test', steps: [] },
      createdAt: new Date(),
      version: 1
    };

    const result = await WorkflowRepository.save(db, workflow);
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });
});

describe('ExecutionRepository', () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
    Schema.createTables(db);
  });

  afterEach(() => {
    db.close();
  });

  test('should create and update execution', async () => {
    const execution = {
      workflowId: 'test-workflow',
      status: 'running' as const,
      startedAt: new Date(),
      restartAttempt: 1
    };

    const createResult = await ExecutionRepository.create(db, execution);
    expect(createResult.success).toBe(true);

    const executionId = createResult.data!;
    const updatedExecution = {
      ...execution,
      status: 'completed' as const,
      completedAt: new Date()
    };

    const updateResult = await ExecutionRepository.update(db, executionId, updatedExecution);
    expect(updateResult.success).toBe(true);
  });
});
```

**End-to-End Integration Tests**
```typescript
// tests/e2e/workflow-execution.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Workflow } from '@workflow/core';
import { DatabaseConnection } from '@workflow/database';

describe('Workflow Execution E2E', () => {
  beforeAll(async () => {
    DatabaseConnection.initialize(':memory:');
  });

  afterAll(async () => {
    DatabaseConnection.close();
  });

  test('should execute complete workflow with steps and sleep', async () => {
    let stepResults: string[] = [];

    Workflow.define('e2e-test-workflow', async (ctx) => {
      await ctx.step('step1', async () => {
        stepResults.push('step1');
        return 'result1';
      });

      await ctx.sleep('wait', 100);

      await ctx.step('step2', async () => {
        stepResults.push('step2');
        return 'result2';
      });
    });

    const result = await Workflow.start('e2e-test-workflow', 'e2e-exec-1');
    
    expect(result.status).toBe('completed');
    expect(stepResults).toEqual(['step1', 'step2']);
  });

  test('should handle workflow with retries', async () => {
    let attempts = 0;

    Workflow.define('retry-test-workflow', async (ctx) => {
      await ctx.step('retry-step', async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('temporary failure');
        }
        return 'success';
      });
    });

    const result = await Workflow.start('retry-test-workflow', 'retry-exec-1');
    
    expect(result.status).toBe('completed');
    expect(attempts).toBe(3);
  });
});
```

**Panic Recovery E2E Tests**
```typescript
// tests/e2e/panic-recovery.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { Workflow } from '@workflow/core';
import { DatabaseConnection } from '@workflow/database';
import { PanicError } from '@workflow/types';

describe('Panic Recovery E2E', () => {
  beforeAll(async () => {
    DatabaseConnection.initialize(':memory:');
  });

  afterAll(async () => {
    DatabaseConnection.close();
  });

  test('should detect and handle system panic', async () => {
    Workflow.define('panic-test-workflow', async (ctx) => {
      await ctx.step('panic-step', async () => {
        throw new Error('out of memory');
      });
    });

    await expect(Workflow.start('panic-test-workflow', 'panic-exec-1'))
      .rejects.toThrow(PanicError);

    const status = await Workflow.getStatus('panic-exec-1');
    expect(status.status).toBe('panicked');
  });

  test('should restart after panic with state preservation', async () => {
    let restartAttempts = 0;

    Workflow.define('restart-test-workflow', async (ctx) => {
      await ctx.step('pre-panic', async () => {
        return 'completed-before-panic';
      });

      await ctx.step('panic-step', async () => {
        restartAttempts = ctx.restartAttempt;
        if (ctx.restartAttempt < 2) {
          throw new Error('system error');
        }
        return 'recovered';
      });
    });

    // This will panic and auto-restart
    try {
      await Workflow.start('restart-test-workflow', 'restart-exec-1');
    } catch (error) {
      // Expected panic
    }

    // Wait for auto-restart
    await new Promise(resolve => setTimeout(resolve, 6000));

    const status = await Workflow.getStatus('restart-exec-1');
    expect(status.restartAttempt).toBeGreaterThan(1);
  });
});
```

## Implementation Checklist

### Phase 1: Core Library Foundation
- [ ] Set up Bun workspace with root package.json
- [ ] Create core library package structure
- [ ] Configure TypeScript with Bun types
- [ ] Set up package exports for library consumption

### Phase 2: Workflow API Implementation
- [ ] Create @workflow/types package with core interfaces
- [ ] Implement Workflow.define() method
- [ ] Build WorkflowContext with step() and sleep() methods
- [ ] Add Workflow.start() for execution initiation

### Phase 3: Execution Engine
- [ ] Create @workflow/database package with SQLite persistence
- [ ] Implement state management and step tracking
- [ ] Build execution engine with retry logic
- [ ] Add sleep/resume functionality

### Phase 4: Error Handling and Recovery
- [ ] Implement automatic retry with configurable attempts
- [ ] Add error handling and recovery mechanisms
- [ ] Build execution status tracking
- [ ] Create workflow resume functionality

### Phase 5: Library Publishing
- [ ] Configure package.json for npm publishing
- [ ] Build TypeScript declarations and exports
- [ ] Create comprehensive documentation and examples
- [ ] Set up CI/CD for automated publishing

### Phase 6: Development Tools
- [ ] Build development server for testing workflows
- [ ] Create CLI for workflow management and debugging
- [ ] Develop dashboard for execution monitoring
- [ ] Add development utilities and helpers

## Usage Examples

### Basic Workflow
```typescript
import { Workflow } from '@workflow/core';

Workflow.define("simple-task", async (ctx) => {
    const result1 = await ctx.step("fetch-data", async () => {
        return { data: "some data" };
    });
    
    await ctx.step("process-data", async () => {
        console.log("Processing:", result1.data);
    });
});

await Workflow.start("simple-task", "task-123");
```

### Workflow with Error Handling
```typescript
Workflow.define("resilient-task", async (ctx) => {
    // Step that will retry automatically
    await ctx.step("risky-operation", async () => {
        if (ctx.attempt < 3) {
            throw new Error("Simulated failure");
        }
        return "Success on attempt " + ctx.attempt;
    });
    
    // Step with custom error handling
    await ctx.step("external-api-call", async () => {
        try {
            const response = await fetch("https://api.example.com/data");
            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            // Log the error but let the retry mechanism handle it
            console.error("API call failed:", error);
            throw error; // Re-throw to trigger retry
        }
    });
});

// Start with custom retry configuration
await Workflow.start("resilient-task", "task-456", null, {
    maxAttempts: 5,
    backoffMs: 2000,
    exponentialBackoff: true
});
```

### Workflow with Panic Recovery
```typescript
Workflow.define("panic-resilient-task", async (ctx) => {
    await ctx.step("risky-operation", async () => {
        // Simulate a system-level panic
        if (ctx.restartAttempt < 2) {
            throw new Error("out of memory - system panic");
        }
        return "Success after restart";
    });
    
    await ctx.step("normal-operation", async () => {
        console.log("Normal operation completed");
    });
});

// Start with panic recovery configuration
await Workflow.start("panic-resilient-task", "task-789", null, {
    maxAttempts: 3,
    backoffMs: 1000,
    exponentialBackoff: true
}, {
    maxRestartAttempts: 3,
    restartDelayMs: 5000,
    enableAutoRestart: true
});
```

### Error Recovery and Monitoring with Panic Handling
```typescript
// Monitor workflow execution with panic detection
try {
    const result = await Workflow.start("my-workflow", "exec-123");
    console.log("Workflow completed:", result);
} catch (error) {
    if (error instanceof PanicError) {
        console.error(`Workflow panicked at step "${error.stepId}" on attempt ${error.attempt}:`, error.originalError);
        
        // Get detailed execution status
        const status = await Workflow.getStatus("exec-123");
        console.log("Workflow status:", status.status);
        console.log("Restart attempt:", status.restartAttempt);
        
        if (status.status === 'panicked') {
            console.log("Workflow will automatically restart in 5 seconds...");
        }
    } else if (error instanceof WorkflowError) {
        console.error(`Workflow failed at step "${error.stepId}" after ${error.attempt} attempts:`, error.originalError);
        
        // Get detailed execution status
        const status = await Workflow.getStatus("exec-123");
        console.log("Failed steps:", Object.entries(status.steps)
            .filter(([_, step]) => step.status === 'failed')
            .map(([stepId, step]) => ({ stepId, error: step.error }))
        );
    }
}

// Manual restart of panicked workflow
const status = await Workflow.getStatus("exec-123");
if (status.status === 'panicked') {
    console.log("Manually restarting panicked workflow...");
    await Workflow.restart("exec-123");
}

// Resume a sleeping workflow
if (status.status === 'sleeping') {
    console.log("Resuming sleeping workflow...");
    await Workflow.resume("exec-123");
}
```

### Workflow with Sleep
```typescript
Workflow.define("delayed-task", async (ctx) => {
    await ctx.step("start", async () => {
        console.log("Starting task...");
    });
    
    await ctx.sleep("wait", 5000); // Wait 5 seconds
    
    await ctx.step("finish", async () => {
        console.log("Task completed after delay");
    });
});
```

### Complex Business Workflow
```typescript
Workflow.define("order-processing", async (ctx) => {
    const order = ctx.input as { orderId: string; items: any[] };
    
    // Validate order
    const validatedOrder = await ctx.step("validate-order", async () => {
        if (!order.orderId || !order.items.length) {
            throw new Error("Invalid order data");
        }
        return order;
    });
    
    // Check inventory
    const inventory = await ctx.step("check-inventory", async () => {
        // Simulate inventory check that might fail
        if (ctx.attempt < 2) {
            throw new Error("Inventory service unavailable");
        }
        return { available: true };
    });
    
    // Wait for payment processing
    await ctx.sleep("payment-delay", 2000);
    
    // Process payment
    const payment = await ctx.step("process-payment", async () => {
        return { paymentId: "pay-123", status: "completed" };
    });
    
    // Ship order
    await ctx.step("ship-order", async () => {
        console.log(`Shipping order ${validatedOrder.orderId}`);
        return { trackingId: "track-456" };
    });
});

// Start the workflow
await Workflow.start("order-processing", "order-789", {
    orderId: "order-789",
    items: [{ id: 1, name: "Product A" }]
});
```

## Best Practices

1. **Use descriptive step IDs** for better debugging and monitoring
2. **Keep steps idempotent** - they should be safe to retry
3. **Handle errors gracefully** with proper error messages and logging
4. **Configure appropriate retry settings** based on step criticality
5. **Use input validation** at the beginning of workflows
6. **Leverage sleep for rate limiting** and external service delays
7. **Return meaningful data** from steps for subsequent steps
8. **Keep workflows focused** on a single business process
9. **Use TypeScript types** for input and step return values
10. **Test error scenarios** thoroughly with unit and integration tests
11. **Monitor execution status** in production environments
12. **Implement circuit breakers** for external service calls
13. **Log step failures** with sufficient context for debugging
14. **Use exponential backoff** for transient failures
15. **Design for resumability** - workflows should handle interruptions gracefully

## Error Handling Strategies

### 1. Transient vs Permanent Errors
```typescript
Workflow.define("smart-retry", async (ctx) => {
    await ctx.step("api-call", async () => {
        try {
            return await callExternalAPI();
        } catch (error) {
            // Classify error type
            if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
                // Transient error - let retry mechanism handle it
                throw error;
            } else if (error.code === 'INVALID_AUTH' || error.code === 'NOT_FOUND') {
                // Permanent error - don't retry
                throw new Error(`Permanent failure: ${error.message}`);
            }
            throw error;
        }
    });
});
```

### 2. Graceful Degradation
```typescript
Workflow.define("resilient-workflow", async (ctx) => {
    let userData;
    
    try {
        userData = await ctx.step("fetch-user", async () => {
            return await getUserFromAPI(ctx.input.userId);
        });
    } catch (error) {
        // Fallback to cached data
        userData = await ctx.step("fallback-user", async () => {
            return await getUserFromCache(ctx.input.userId);
        });
    }
    
    await ctx.step("process-user", async () => {
        return processUser(userData);
    });
});
```

## Library Commands

```bash
# Development commands
bun install          # Install dependencies
bun run build        # Build the library
bun run test         # Run tests
bun run typecheck    # Type checking

# Publishing commands
bun run build        # Build for production
npm publish          # Publish to npm registry

# Usage in other projects
bun add @workflow/core
npm install @workflow/core
```

This guide provides the foundation for building a workflow library with a fluent API that can be easily integrated into any TypeScript project.