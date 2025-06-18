# Workflow Library Overview

## Architecture

The workflow library is built as a standalone TypeScript package that provides:
- **Fluent API** for defining workflows with steps, sleep, and error handling
- **TypeScript** for type safety and development experience
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

### Development Apps (`apps/`)
- **server**: Development server for testing workflows
- **cli**: Command-line tool for workflow management
- **dashboard**: Web interface for monitoring workflow executions

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
1. Build development server for testing workflows
2. Create CLI for workflow management and debugging
3. Develop dashboard for execution monitoring
4. Add development utilities and helpers

## Key Features

- **Fluent API**: Simple, chainable workflow definition syntax
- **Automatic Retry**: Built-in retry logic with configurable attempts
- **Resumable Execution**: Workflows can be paused and resumed
- **State Persistence**: Reliable state storage with Bun's SQLite client
- **Error Recovery**: Automatic error handling and recovery
- **Type Safety**: Full TypeScript support throughout
- **Functional Design**: Pure functions and immutable data structures

## Example Workflow

```typescript
import { Workflow } from '@workflow/core';

// Define a complex workflow with error handling
Workflow.define("email-notification", async (ctx) => {
    // Step 1: Validate input data
    const userData = await ctx.step("validate-input", async () => {
        const data = ctx.input as { email: string; name: string };
        if (!data.email || !data.name) {
            throw new Error("Missing required fields");
        }
        return data;
    });

    // Step 2: Wait before processing (demonstrating sleep)
    await ctx.sleep("processing-delay", 1000);

    // Step 3: Send email with retry logic
    await ctx.step("send-email", async () => {
        if (ctx.attempt < 2) {
            throw new Error("Simulated email service error");
        }
        console.log(`Sending email to ${userData.email}`);
        return { emailId: "email-123", status: "sent" };
    });

    // Step 4: Log success
    await ctx.step("log-success", async () => {
        console.log("Email notification workflow completed successfully");
    });
});

// Start the workflow with input data
await Workflow.start("email-notification", "user-signup-123", {
    email: "user@example.com",
    name: "John Doe"
});
```

## Benefits

- **Easy Integration**: Simple npm install and import in any TypeScript project
- **Maintainable**: Functional programming reduces complexity
- **Reliable**: Bun's SQLite client provides ACID transactions
- **Fast**: Bun runtime offers excellent performance
- **Type-Safe**: TypeScript prevents runtime errors
- **Developer Friendly**: Intuitive fluent API with great IDE support
- **Production Ready**: Built-in error handling, retry logic, and state persistence