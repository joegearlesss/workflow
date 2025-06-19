# Workflow Library Overview

A TypeScript workflow orchestration library built with **functional programming principles** and **Bun runtime**. Enables reliable, resumable, and observable workflow execution with comprehensive error handling and state management.

## 🎯 Purpose

The workflow library provides:
- **Step-by-step execution** with automatic state persistence
- **Error handling pipes** for conditional flow control  
- **Circuit breaker patterns** for external service resilience
- **Sleep/delay capabilities** for time-based orchestration
- **Resumable workflows** that survive application restarts
- **Observable execution** with detailed logging and metrics

## 🏗️ Architecture

Built using **TypeScript namespaces**, **functional programming**, and **chain patterns**:

```typescript
// ✅ Functional namespace approach
namespace Workflow {
  export const define = (name: string, handler: WorkflowHandler): void => { /* ... */ };
  export const start = (name: string, executionId: string): Promise<void> => { /* ... */ };
}

// ✅ No classes - pure functions with fluent chaining
namespace WorkflowContext {
  export const step = (name: string, fn: StepFunction): StepBuilder => { /* ... */ };
  export const sleep = (name: string, durationMs: number): Promise<void> => { /* ... */ };
}

// ✅ Chain pattern for class-like fluent APIs
const stepBuilder = ctx.step("process-data", async () => { /* ... */ })
  .onError({ NetworkError: async (error, ctx) => { /* ... */ } })
  .withCircuitBreaker({ failureThreshold: 3 })
  .execute();
```

## 🚀 Core Features

### Workflow Definition & Execution
```typescript
// Define reusable workflow templates
Workflow.define("data-processing", async (ctx) => {
  const data = await ctx.step("fetch-data", async () => {
    return await fetchExternalData();
  });
  
  await ctx.sleep("processing-delay", 2000);
  
  await ctx.step("process-data", async () => {
    return processData(data);
  });
});

// Start workflow execution
await Workflow.start("data-processing", "exec-123");
```

### Error Handling Pipes
```typescript
// Advanced error handling with typed error flows
await ctx.step("api-call", async () => {
  const response = await fetch('/api/data');
  if (!response.ok) {
    throw new NetworkError(`API failed: ${response.status}`, response.status);
  }
  return response.json();
}).onError({
  NetworkError: async (error, ctx) => {
    // Exponential backoff for network errors
    await ctx.sleep("retry-delay", 2000 * ctx.attempt);
    throw error; // Retry the step
  },
  ValidationError: async (error, ctx) => {
    // Use fallback data for validation errors
    return { fallback: true, data: getDefaultData() };
  },
  default: async (error, ctx) => {
    // Log and alert for unexpected errors
    await sendAlert(error);
    throw error;
  }
}).execute();
```

### Circuit Breaker Pattern
```typescript
// Protect against cascading failures
await ctx.step("external-service", async () => {
  return await callExternalService();
}).withCircuitBreaker({
  failureThreshold: 5,
  resetTimeout: 60000,
  onOpen: async (ctx) => {
    // Fallback when circuit is open
    await ctx.step("use-cache", async () => {
      return getCachedData();
    });
  }
}).execute();
```

## 📦 Technology Stack

### Core Technologies
- **Runtime**: Bun (optimized performance)
- **Language**: TypeScript (strict type safety)
- **Database**: Drizzle ORM with Bun native SQLite client
- **Migrations**: Drizzle migrations with SQLite
- **Schema Validation**: Zod (runtime type checking)
- **Testing**: Bun test (fast native testing)
- **Linting**: Biome v2.0.0 (code quality)

### Architecture Principles
- **NO CLASSES**: Pure functional programming with namespaces
- **Chain Pattern**: Function chaining for fluent, class-like APIs without classes
- **Immutability**: All operations return new state
- **Type Safety**: Comprehensive TypeScript and Zod validation
- **Error Transparency**: Explicit error handling with typed flows

## 🔄 Workflow Lifecycle

```
1. Define → 2. Start → 3. Execute Steps → 4. Handle Errors → 5. Complete/Resume
    ↑                                                              ↓
    └─────────────────── Resume from Last Step ←──────────────────┘
```

### State Persistence
- **Automatic checkpointing** after each successful step using Drizzle ORM
- **Resume capability** from any point of failure with SQLite persistence
- **State isolation** between different workflow executions
- **Rollback support** for failed transactions
- **Migration support** for schema evolution with Drizzle migrations

## 🎛️ Error Handling Strategies

### 1. Error Pipes
Route different error types to specific handling logic:
```typescript
.onError({
  ValidationError: async (error, ctx) => { /* specific handling */ },
  NetworkError: async (error, ctx) => { /* retry logic */ },
  default: async (error, ctx) => { /* catch-all */ }
})
```

### 2. Circuit Breaker
Prevent cascading failures with automatic fallback:
```typescript
.withCircuitBreaker({
  failureThreshold: 3,
  resetTimeout: 30000,
  onOpen: async (ctx) => { /* fallback logic */ }
})
```

### 3. Retry & Backoff
Built-in exponential backoff for transient failures:
```typescript
await Workflow.start("my-workflow", "exec-id", {}, {
  maxAttempts: 3,
  backoffMs: 1000,
  exponentialBackoff: true
});
```

## 💼 Use Cases

### E-commerce Order Processing
- Payment processing with fallback methods
- Inventory reservation with conflict resolution
- Shipping integration with manual fallback
- Customer notification with retry logic

### Data Pipeline Orchestration
- Multi-stage data transformation
- External API integration with circuit breakers
- Error recovery and data quality checks
- Progress tracking and monitoring

### Microservice Coordination
- Service-to-service communication
- Transaction coordination across services
- Failure isolation and recovery
- Distributed workflow execution

## 🧪 Testing Strategy

### Comprehensive Test Coverage Requirements

**MUST CREATE** all four test types for complete coverage:

#### 1. Unit Tests (`.test.ts`)
- **Location**: Same folder as source file
- **Purpose**: Test individual functions in isolation
- **Coverage**: 90% line coverage minimum
- **Examples**: Function logic, validation, error handling

#### 2. Performance Tests (`.performance.test.ts`)
- **Location**: Same folder as source file  
- **Purpose**: Test execution time and memory usage
- **Requirements**: Functions complete within expected time limits
- **Examples**: Workflow step execution time, memory leak detection

#### 3. Integration Tests (`tests/integration/`)
- **Location**: Separate `tests/integration/` folder
- **Purpose**: Test multiple components working together
- **Requirements**: Database interactions, workflow orchestration
- **Examples**: Workflow execution with database persistence, error recovery flows

#### 4. End-to-End Tests (`tests/e2e/`)
- **Location**: Separate `tests/e2e/` folder
- **Purpose**: Test complete user journeys and workflows
- **Requirements**: Full workflow lifecycle testing
- **Examples**: Complete workflow execution from start to finish, resume scenarios

### Test Commands
```bash
# Run all tests
bun test                           # All test types
bun test --coverage                # With coverage report

# Run by test type
bun test "**/*.test.ts"                      # Unit tests only
bun test "**/*.performance.test.ts"          # Performance tests only
bun test "**/integration/*.test.ts"          # Integration tests only
bun test "**/e2e/*.test.ts"                  # E2E tests only

# Watch mode
bun test --watch                   # Watch all tests
bun test --watch "**/*.test.ts"    # Watch unit tests only
```

### Test Structure Requirements
```
packages/core/
├── src/
│   ├── workflow.ts
│   ├── workflow.test.ts              # ✅ REQUIRED: Unit tests
│   ├── workflow.performance.test.ts   # ✅ REQUIRED: Performance tests
│   ├── context.ts
│   ├── context.test.ts              # ✅ REQUIRED: Unit tests
│   └── context.performance.test.ts   # ✅ REQUIRED: Performance tests
└── tests/
    ├── integration/                 # ✅ REQUIRED: Integration tests
    │   ├── workflow-execution.integration.test.ts
    │   ├── database-persistence.integration.test.ts
    │   └── error-recovery.integration.test.ts
    └── e2e/                        # ✅ REQUIRED: E2E tests
        ├── complete-workflow.e2e.test.ts
        ├── workflow-resume.e2e.test.ts
        └── error-scenarios.e2e.test.ts
```

## 🔧 Development Commands

```bash
# Setup
bun install                    # Install dependencies

# Database
bun run db:generate           # Generate Drizzle migrations
bun run db:migrate            # Run database migrations
bun run db:studio             # Launch Drizzle Studio

# Development
bun run dev                    # Start development server
bun test --watch              # Watch mode testing

# Quality Assurance
bun test                      # Run all tests
bun run biome check          # Lint and format check
bun run biome format --write # Auto-format code
bunx tsc --noEmit           # Type checking

# Build
bun run build               # Production build
```

## 📚 Package Structure

```
packages/
├── core/                  # Core workflow engine
│   ├── src/
│   │   ├── workflow.ts
│   │   ├── context.ts
│   │   ├── error-handling.ts
│   │   ├── circuit-breaker.ts
│   │   └── database/
│   │       ├── schema.ts      # Drizzle schema definitions
│   │       ├── migrations/    # Database migrations
│   │       └── client.ts      # Bun SQLite client setup
│   └── tests/
├── components/           # Reusable workflow components
└── examples/            # Usage examples and templates
```

## 🎯 Getting Started

1. **Install Dependencies**
   ```bash
   bun install
   ```

2. **Define Your First Workflow**
   ```typescript
   import { Workflow } from '@workflow/core';
   
   Workflow.define("hello-world", async (ctx) => {
     await ctx.step("greet", async () => {
       console.log("Hello, World!");
       return { greeting: "Hello, World!" };
     });
   });
   ```

3. **Execute the Workflow**
   ```bash
   await Workflow.start("hello-world", "my-execution-id");
   ```

4. **Add Error Handling**
   ```typescript
   await ctx.step("api-call", async () => {
     return await callAPI();
   }).onError({
     NetworkError: async (error, ctx) => {
       return { fallback: true };
     }
   }).execute();
   ```

## 🔍 Key Benefits

- **Reliability**: Automatic state persistence and recovery
- **Observability**: Detailed execution logging and metrics
- **Flexibility**: Composable steps with conditional flows
- **Performance**: Bun runtime optimization
- **Type Safety**: Full TypeScript coverage with runtime validation
- **Maintainability**: Functional architecture with clear separation of concerns

---

Built with ❤️ using **TypeScript**, **Bun**, and **functional programming principles**.