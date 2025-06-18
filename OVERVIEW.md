# Workflow Library Overview

## Architecture

The workflow library is built as a standalone TypeScript package that provides:
- **Fluent API** for defining workflows with steps, sleep, and error handling
- **TypeScript** for type safety and development experience
- **Zod** for runtime schema validation and type inference
- **Bun** as the runtime and package manager
- **Functional Programming** with namespaces (no classes)
- **Bun SQLite** for persistent state and execution tracking

## Library Usage

The workflow library provides a simple, fluent API for defining and executing workflows:

```typescript
import { Workflow } from '@workflow/core';

// Define a workflow
Workflow.define("test", async (ctx) => {
    await ctx.step("one", async () => console.log("hey there!"));
    await ctx.sleep("two", 2000);
    await ctx.step("three", async () => {
        if (ctx.attempt < 3) throw new Error("this is a test error");
    });
    await ctx.step("four", async () => console.log("done"));
});

// Start workflow execution
await Workflow.start("test", "first-run");
```

## Package Structure

The project is organized as a single publishable library:

### Core Package (`packages/core/`)
- **@workflow/core**: Main workflow library with fluent API
- Exports: `Workflow`, `WorkflowContext`, types

### Supporting Packages
- **@workflow/types**: TypeScript definitions for workflows and steps
- **@workflow/database**: SQLite persistence for workflow state
- **@workflow/utils**: Utility functions and helpers

### Development Tools (`apps/`)
- **cli**: Command-line tool for debugging workflows, database access, and execution monitoring

## Step-by-Step Implementation Guide

### Phase 1: Core Library Setup
1. Initialize Bun workspace with root package.json
2. Create core library package structure
3. Set up TypeScript configuration with Bun types
4. Configure package exports for library consumption

### Phase 2: Workflow Context and API
1. Create WorkflowContext with step, sleep, and retry functionality
2. Implement Workflow.define() for workflow registration
3. Build Workflow.start() for execution initiation
4. Add state persistence with SQLite

### Phase 3: Step Execution Engine
1. Implement step execution with automatic retry logic
2. Add sleep functionality with resumable state
3. Build error handling and recovery mechanisms
4. Create execution tracking and logging

### Phase 4: Library Publishing
1. Configure package.json for npm publishing
2. Build TypeScript declarations
3. Create comprehensive documentation and examples
4. Set up CI/CD for automated publishing

### Phase 5: Development Tools
1. Create CLI for workflow debugging and database access
2. Add execution monitoring and log viewing capabilities
3. Build state inspection and error analysis tools
4. Add cleanup utilities for old executions

## Key Features

- **Fluent API**: Simple, chainable workflow definition syntax
- **Automatic Retry**: Built-in retry logic with configurable attempts
- **Panic Recovery**: Automatic restart after system-level failures
- **Schema Validation**: Runtime validation with Zod for type safety
- **Resumable Execution**: Workflows can be paused and resumed
- **State Persistence**: Reliable state storage with Bun's SQLite client
- **Error Recovery**: Automatic error handling and recovery
- **Type Safety**: Full TypeScript support throughout
- **Functional Design**: Pure functions and immutable data structures

## Example Workflow

```typescript
import { Workflow } from '@workflow/core';
import { z } from 'zod';

// Define input schema for validation
const EmailInputSchema = z.object({
    email: z.string().email('Invalid email format'),
    name: z.string().min(1, 'Name is required'),
    templateId: z.string().uuid('Invalid template ID')
});

// Define a complex workflow with error handling and panic recovery
Workflow.define("email-notification", async (ctx) => {
    // Step 1: Validate input data with Zod
    const userData = await ctx.step("validate-input", async () => {
        const validation = EmailInputSchema.safeParse(ctx.input);
        if (!validation.success) {
            throw new ValidationError(
                "Invalid input data",
                validation.error
            );
        }
        return validation.data;
    });

    // Step 2: Wait before processing (demonstrating sleep)
    await ctx.sleep("processing-delay", 1000);

    // Step 3: Send email with retry logic and panic detection
    await ctx.step("send-email", async () => {
        // Simulate system panic on first restart attempt
        if (ctx.restartAttempt === 1 && ctx.attempt < 2) {
            throw new Error("out of memory - system panic");
        }
        
        // Simulate normal retry logic
        if (ctx.attempt < 2) {
            throw new Error("Simulated email service error");
        }
        
        console.log(`Sending email to ${userData.email}`);
        
        // Validate response structure
        const responseSchema = z.object({
            emailId: z.string().uuid(),
            status: z.enum(['sent', 'queued', 'failed'])
        });
        
        const response = { 
            emailId: crypto.randomUUID(), 
            status: 'sent' as const 
        };
        
        return responseSchema.parse(response);
    });

    // Step 4: Log success
    await ctx.step("log-success", async () => {
        console.log("Email notification workflow completed successfully");
        console.log(`Completed after ${ctx.restartAttempt} restart(s) and ${ctx.attempt} attempt(s)`);
    });
});

// Start the workflow with validated input data and panic recovery configuration
await Workflow.start("email-notification", crypto.randomUUID(), {
    email: "user@example.com",
    name: "John Doe",
    templateId: crypto.randomUUID()
}, {
    maxAttempts: 3,
    backoffMs: 1000,
    exponentialBackoff: true
}, {
    maxRestartAttempts: 2,
    restartDelayMs: 3000,
    enableAutoRestart: true
});
```

## Benefits

- **Easy Integration**: Simple npm install and import in any TypeScript/Bun project
- **Maintainable**: Functional programming reduces complexity
- **Reliable**: Bun's SQLite client provides ACID transactions
- **Resilient**: Automatic panic detection and restart capabilities
- **Validated**: Zod schemas ensure runtime type safety and data integrity
- **Fast**: Bun runtime offers excellent performance
- **Type-Safe**: TypeScript prevents runtime errors
- **Developer Friendly**: Intuitive fluent API with great IDE support
- **Production Ready**: Built-in error handling, retry logic, panic recovery, and state persistence
- **Debug-Friendly**: CLI tool for inspecting workflow state, logs, and execution history