# Developer Guide - Workflow Library

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
│   ├── database/                # Per-workflow SQLite persistence
│   │   ├── src/
│   │   │   ├── schema.ts        # Database schema definitions
│   │   │   ├── schema.test.ts   # Unit tests for schema
│   │   │   ├── workflow-db.ts   # Per-workflow database management
│   │   │   ├── workflow-db.test.ts # Unit tests for workflow DB
│   │   │   ├── registry.ts      # Workflow registry and discovery
│   │   │   ├── registry.test.ts # Unit tests for registry
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
├── apps/                        # Development tools
│   └── cli/                     # CLI tool for debugging workflows
│       ├── src/
│       │   ├── index.ts         # CLI entry point
│       │   ├── commands/        # CLI commands
│       │   │   ├── list.ts      # List workflows command
│       │   │   ├── create.ts    # Create workflow command
│       │   │   ├── start.ts     # Start execution command
│       │   │   ├── status.ts    # Check execution status
│       │   │   ├── logs.ts      # View execution logs
│       │   │   ├── inspect.ts   # Inspect workflow state
│       │   │   └── cleanup.ts   # Cleanup old executions
│       │   └── utils/           # CLI utilities
│       │       ├── output.ts    # Output formatting
│       │       ├── database.ts  # Database inspection tools
│       │       └── config.ts    # CLI configuration
│       └── tests/
│           └── commands.test.ts # CLI command tests
└── tests/                       # End-to-end test suites
    └── e2e/                     # End-to-end tests
        ├── workflow-execution.test.ts
        ├── panic-recovery.test.ts
        └── integration.test.ts
```

## Runtime Directory Structure

When workflows are executed, the library creates a runtime directory structure in the execution directory for persistence and state management:

```
.workflow/                      # Runtime workflow data directory
├── registry.db                 # Central workflow registry database
└── workflows/                  # Workflow definitions and metadata
    ├── data-processing/         # Per-workflow directory
    │   ├── definition.json      # Workflow definition metadata
    │   ├── config.json          # Workflow-specific configuration
    │   ├── data-processing.db   # Per-workflow database
    │   └── logs/                # Per-workflow execution logs
    │       ├── 2024-01-15.log   # Daily log files
    │       ├── 2024-01-16.log
    │       └── executions/      # Per-execution detailed logs
    │           ├── exec-123.log
    │           └── exec-456.log
    ├── api-workflow/
    │   ├── definition.json
    │   ├── config.json
    │   ├── api-workflow.db      # Per-workflow database
    │   └── logs/                # Per-workflow execution logs
    │       ├── 2024-01-15.log
    │       └── executions/
    │           └── exec-789.log
    └── simple-log/
        ├── definition.json
        ├── config.json
        ├── simple-log.db        # Per-workflow database
        └── logs/                # Per-workflow execution logs
            ├── 2024-01-15.log
            └── executions/
                └── exec-abc.log
```

### Database Structure

**Central Registry (`.workflow/registry.db`)**
```sql
CREATE TABLE workflow_registry (
    name TEXT PRIMARY KEY,
    db_path TEXT NOT NULL,              -- Path: workflows/{workflow-name}/{workflow-name}.db
    workflow_dir TEXT NOT NULL,         -- Path: workflows/{workflow-name}/
    log_dir TEXT NOT NULL,              -- Path: workflows/{workflow-name}/logs/
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_execution_at DATETIME,
    execution_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
);
```

**Per-Workflow Database (`.workflow/workflows/{workflow-name}/{workflow-name}.db`)**
```sql
CREATE TABLE executions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    restart_attempt INTEGER DEFAULT 1,
    error_message TEXT,
    input_data TEXT
);

CREATE TABLE steps (
    execution_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    result_data TEXT,
    error_message TEXT,
    attempt INTEGER DEFAULT 1,
    PRIMARY KEY (execution_id, step_id),
    FOREIGN KEY (execution_id) REFERENCES executions (id) ON DELETE CASCADE
);

CREATE TABLE circuit_breaker_state (
    step_id TEXT PRIMARY KEY,
    failures INTEGER DEFAULT 0,
    is_open BOOLEAN DEFAULT false,
    last_failure_time INTEGER,
    reset_time INTEGER
);

CREATE TABLE step_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    attempt INTEGER NOT NULL,
    timestamp INTEGER NOT NULL,
    INDEX idx_execution_step (execution_id, step_id)
);
```

### Directory Management

- **Automatic Creation**: The `.workflow/` directory and its subdirectories are created automatically on first workflow execution
- **Organized Structure**: 
  - `workflows/`: Contains workflow definitions, configuration files, databases, and logs
- **Per-Workflow Isolation**: Each workflow gets its own subdirectory in `workflows/` containing definitions, config, database, and logs
- **Registry Management**: The central registry tracks all workflows and their locations across the directory structure
- **Cleanup**: Old execution data can be cleaned up using the CLI `cleanup` command
- **Portability**: The entire `.workflow/` directory can be backed up or moved between systems

### Workflow Definition Files

Each workflow directory in `.workflow/workflows/{workflow-name}/` contains:

**`definition.json`** - Workflow metadata and configuration:
```json
{
  "name": "data-processing",
  "version": "1.0.0",
  "description": "Process data from external APIs",
  "created_at": "2024-01-15T10:30:00Z",
  "last_modified": "2024-01-16T14:22:00Z",
  "database_path": "./data-processing.db",
  "log_directory": "./logs/",
  "retry_config": {
    "max_attempts": 3,
    "backoff_ms": 1000,
    "exponential_backoff": true
  },
  "panic_config": {
    "max_restart_attempts": 3,
    "restart_delay_ms": 5000,
    "enable_auto_restart": true
  }
}
```

**`config.json`** - Runtime configuration and environment variables:
```json
{
  "environment": "production",
  "variables": {
    "API_TIMEOUT": "30000",
    "BATCH_SIZE": "100",
    "MAX_RETRIES": "3"
  },
  "secrets": {
    "API_KEY": "env:DATA_API_KEY",
    "DATABASE_URL": "env:DB_CONNECTION_STRING"
  }
}
```

## Getting Started

### Prerequisites
- Bun 1.0+ installed
- TypeScript knowledge
- Functional programming familiarity
- Zod for schema validation

### TypeScript Best Practices

> **Important:** This library strictly avoids `any` types to ensure type safety and better developer experience.

**Type Safety Guidelines:**
- Use `unknown` instead of `any` for truly unknown values
- Use `Record<string, unknown>` for object types with unknown properties
- Define specific interfaces for database row types and API responses
- Use union types for known string literals (e.g., `'debug' | 'info' | 'warn' | 'error'`)
- Leverage Zod schemas for runtime validation and type inference

**Examples:**
```typescript
// ❌ Avoid
function processData(data: any): any {
  return data.someProperty;
}

// ✅ Prefer
function processData(data: Record<string, unknown>): unknown {
  return data.someProperty;
}

// ✅ Even better with specific types
interface ProcessedData {
  result: string;
  timestamp: Date;
}

function processData(data: Record<string, unknown>): ProcessedData {
  return {
    result: String(data.someProperty),
    timestamp: new Date()
  };
}
```

### Library Installation

```bash
# In your TypeScript project
bun add @workflow/core
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

**Handling Step Failures with Error Pipes**

```typescript
import { Workflow } from '@workflow/core';

// Define custom error types using functional approach
namespace ValidationError {
    export const create = (message: string, field: string): Error & { field: string } => {
        const error = new Error(message) as Error & { field: string };
        error.name = 'ValidationError';
        error.field = field;
        return error;
    };
    
    export const is = (error: unknown): error is Error & { field: string } => {
        return error instanceof Error && error.name === 'ValidationError' && 'field' in error;
    };
}

namespace NetworkError {
    export const create = (message: string, statusCode: number): Error & { statusCode: number } => {
        const error = new Error(message) as Error & { statusCode: number };
        error.name = 'NetworkError';
        error.statusCode = statusCode;
        return error;
    };
    
    export const is = (error: unknown): error is Error & { statusCode: number } => {
        return error instanceof Error && error.name === 'NetworkError' && 'statusCode' in error;
    };
}

// Define a workflow with error handling pipes
Workflow.define("error-handling-workflow", async (ctx) => {
    // Step with error pipe for conditional flow
    await ctx.step("data-processing", async () => {
        const data = await fetchExternalData();
        if (!data.isValid) {
            throw ValidationError.create("Invalid data format", "payload");
        }
        return { processedData: data };
    }).onError({
        ValidationError: async (error, ctx) => {
            // Handle validation errors by running data correction
            await ctx.step("data-correction", async () => {
                console.log(`Correcting field: ${ValidationError.is(error) ? error.field : 'unknown'}`);
                return { corrected: true };
            }).execute();
            // Continue with corrected data
            return { processedData: { isValid: true, corrected: true } };
        },
        NetworkError: async (error, ctx) => {
            // Handle network errors with exponential backoff
            if (NetworkError.is(error) && error.statusCode >= 500) {
                await ctx.sleep("network-retry-delay", 5000);
                throw error; // Retry the original step
            }
            // For client errors, skip to fallback
            await ctx.step("fallback-data", async () => {
                return { processedData: { fallback: true } };
            }).execute();
        },
        default: async (error, ctx) => {
            // Handle any other errors
            await ctx.step("error-logging", async () => {
                console.error("Unexpected error:", error.message);
                return { logged: true };
            }).execute();
            throw error; // Re-throw to fail the workflow
        }
    }).execute();
    
    await ctx.step("final-processing", async () => {
        console.log("Processing completed successfully");
        return { completed: true };
    }).execute();
});

// Alternative: Using error branching for different execution paths
Workflow.define("branching-workflow", async (ctx) => {
    const result = await ctx.step("risky-operation", async () => {
        const success = Math.random() > 0.3;
        if (!success) {
            throw new Error("Operation failed");
        }
        return { success: true, data: "primary-result" };
    }).catch(async (error, ctx) => {
        // Error branch - different execution path
        await ctx.step("fallback-operation", async () => {
            console.log("Using fallback approach");
            return { success: false, data: "fallback-result" };
        }).execute();
        
        await ctx.step("notify-admin", async () => {
            console.log("Notifying admin of fallback usage");
            return { notified: true };
        }).execute();
        
        return { success: false, data: "fallback-result" };
    }).execute();
    
    // Conditional next steps based on result
    if (result.success) {
        await ctx.step("success-cleanup", async () => {
            console.log("Primary path cleanup");
            return { cleaned: true };
        }).execute();
    } else {
        await ctx.step("fallback-cleanup", async () => {
            console.log("Fallback path cleanup");
            return { cleaned: true };
        }).execute();
    }
});

// Circuit breaker pattern for external service calls
Workflow.define("circuit-breaker-workflow", async (ctx) => {
    await ctx.step("external-service-call", async () => {
        return await callExternalService();
    }).withCircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 30000,
        onOpen: async (ctx) => {
            await ctx.step("circuit-open-fallback", async () => {
                console.log("Circuit breaker open, using cached data");
                return { cached: true };
            }).execute();
        }
    }).execute();
});

// Advanced error handling with retry and circuit breaker
Workflow.define("advanced-error-handling", async (ctx) => {
    // Step with multiple error handling strategies
    const apiResult = await ctx.step("api-call", async () => {
        const response = await fetch('/api/data');
        if (!response.ok) {
            if (response.status >= 500) {
                throw new NetworkError(`Server error: ${response.status}`, response.status);
            } else {
                throw new ValidationError(`Client error: ${response.status}`, 'request');
            }
        }
        return await response.json();
    })
    .withCircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 60000,
        onOpen: async (ctx) => {
            await ctx.step("cache-fallback", async () => {
                console.log("Using cached data due to circuit breaker");
                return { cached: true, data: getCachedData() };
            }).execute();
        }
    })
    .onError({
        NetworkError: async (error, ctx) => {
            // Exponential backoff for server errors
            const delay = Math.min(1000 * Math.pow(2, ctx.attempt - 1), 30000);
            await ctx.sleep(`network-backoff-${ctx.attempt}`, delay);
            throw error; // Retry with backoff
        },
        ValidationError: async (error, ctx) => {
            // Log validation errors and use default data
            await ctx.step("validation-error-log", async () => {
                console.error(`Validation error in field ${error.field}: ${error.message}`);
                return { logged: true };
            }).execute();
            
            return { data: getDefaultData(), fallback: true };
        },
        default: async (error, ctx) => {
            // Catch-all error handler
            await ctx.step("unexpected-error-handler", async () => {
                console.error("Unexpected error:", error);
                // Send alert to monitoring system
                await sendAlert({
                    type: 'workflow_error',
                    workflow: ctx.workflowName,
                    execution: ctx.executionId,
                    error: error.message
                });
                return { alerted: true };
            }).execute();
            
            throw error; // Re-throw to fail workflow
        }
    })
    .execute();
    
    // Process the result regardless of how it was obtained
    await ctx.step("process-result", async () => {
        console.log("Processing result:", apiResult);
        return { processed: true };
    }).execute();
});

// Start execution with retry configuration
await Workflow.start("error-handling-workflow", "execution-id-456", {}, {
    maxAttempts: 3,
    backoffMs: 2000,
    exponentialBackoff: true
});

// Helper functions for the examples
async function fetchExternalData() {
    // Simulate external API call
    const success = Math.random() > 0.3;
    if (!success) {
        throw NetworkError.create("Network timeout", 503);
    }
    return { isValid: Math.random() > 0.2, data: "sample-data" };
}

async function callExternalService() {
    // Simulate external service call
    const success = Math.random() > 0.4;
    if (!success) {
        throw new Error("Service unavailable");
    }
    return { result: "service-data" };
}

function getCachedData() {
    return { cached: true, data: "fallback-data" };
}

function getDefaultData() {
    return { default: true, data: "default-data" };
}

async function sendAlert(alert: {
    type: string;
    workflow: string;
    execution: string;
    error: string;
}) {
    console.log("Alert sent:", alert);
}
```

**Real-World Error Handling Example**

```typescript
// Complete example: E-commerce order processing workflow with comprehensive error handling
Workflow.define("order-processing", async (ctx) => {
    const { orderId, customerId, items } = ctx.input;
    
    // Step 1: Validate order data
    const validationResult = await ctx.step("validate-order", async () => {
        if (!orderId || !customerId || !items?.length) {
            throw new ValidationError("Missing required order fields", "order");
        }
        
        // Validate inventory
        for (const item of items) {
            const available = await checkInventory(item.productId, item.quantity);
            if (!available) {
                throw new ValidationError(`Insufficient inventory for ${item.productId}`, "inventory");
            }
        }
        
        return { valid: true, totalAmount: calculateTotal(items) };
    }).onError({
        ValidationError: async (error, ctx) => {
            if (error.field === "inventory") {
                // Try to find alternative products
                await ctx.step("find-alternatives", async () => {
                    const alternatives = await findAlternativeProducts(items);
                    if (alternatives.length > 0) {
                        return { alternatives, suggested: true };
                    }
                    throw new Error("No alternatives available");
                }).execute();
                
                // Notify customer about alternatives
                await ctx.step("notify-alternatives", async () => {
                    await sendCustomerNotification(customerId, {
                        type: "alternatives_available",
                        alternatives
                    });
                    return { notified: true };
                }).execute();
                
                throw error; // Still fail the order, but customer is notified
            }
            
            // For other validation errors, log and fail
            await ctx.step("log-validation-error", async () => {
                console.error(`Order validation failed: ${error.message}`);
                return { logged: true };
            }).execute();
            
            throw error;
        }
    }).execute();
    
    // Step 2: Process payment with circuit breaker
    const paymentResult = await ctx.step("process-payment", async () => {
        const result = await processPayment(customerId, validationResult.totalAmount);
        if (!result.success) {
            throw new Error(`Payment failed: ${result.error}`);
        }
        return result;
    }).withCircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 60000,
        onOpen: async (ctx) => {
            // Payment service is down, queue for later processing
            await ctx.step("queue-payment", async () => {
                await queuePaymentForLater(orderId, customerId, validationResult.totalAmount);
                return { queued: true };
            }).execute();
            
            // Notify customer about delayed processing
            await ctx.step("notify-payment-delay", async () => {
                await sendCustomerNotification(customerId, {
                    type: "payment_delayed",
                    orderId,
                    estimatedProcessingTime: "1 hour"
                });
                return { notified: true };
            }).execute();
        }
    }).catch(async (error, ctx) => {
        // Payment failed, try alternative payment methods
        const alternativeResult = await ctx.step("try-alternative-payment", async () => {
            const alternatives = await getAlternativePaymentMethods(customerId);
            for (const method of alternatives) {
                try {
                    const result = await processPayment(customerId, validationResult.totalAmount, method);
                    if (result.success) {
                        return { success: true, method, ...result };
                    }
                } catch (altError) {
                    console.warn(`Alternative payment method ${method} failed:`, altError.message);
                }
            }
            throw new Error("All payment methods failed");
        }).execute();
        
        return alternativeResult;
    }).execute();
    
    // Step 3: Reserve inventory
    await ctx.step("reserve-inventory", async () => {
        const reservations = [];
        for (const item of items) {
            const reservation = await reserveInventory(item.productId, item.quantity);
            reservations.push(reservation);
        }
        return { reservations };
    }).onError({
        default: async (error, ctx) => {
            // Inventory reservation failed, refund payment
            await ctx.step("refund-payment", async () => {
                await refundPayment(paymentResult.transactionId);
                return { refunded: true };
            }).execute();
            
            // Notify customer
            await ctx.step("notify-inventory-failure", async () => {
                await sendCustomerNotification(customerId, {
                    type: "order_failed",
                    reason: "inventory_unavailable",
                    orderId,
                    refundId: paymentResult.transactionId
                });
                return { notified: true };
            }).execute();
            
            throw error;
        }
    }).execute();
    
    // Step 4: Create shipping label with retry logic
    const shippingResult = await ctx.step("create-shipping", async () => {
        const shippingAddress = await getCustomerShippingAddress(customerId);
        const label = await createShippingLabel(orderId, shippingAddress, items);
        return { label, trackingNumber: label.trackingNumber };
    }).onError({
        NetworkError: async (error, ctx) => {
            // Shipping service network error, exponential backoff
            const delay = Math.min(1000 * Math.pow(2, ctx.attempt - 1), 30000);
            await ctx.sleep(`shipping-retry-${ctx.attempt}`, delay);
            throw error; // Retry with backoff
        },
        default: async (error, ctx) => {
            // Shipping failed, but order is valid - create manual shipping task
            await ctx.step("create-manual-shipping-task", async () => {
                await createManualShippingTask(orderId, {
                    customerId,
                    items,
                    paymentId: paymentResult.transactionId,
                    error: error.message
                });
                return { manualTaskCreated: true };
            }).execute();
            
            // Use fallback tracking
            return { 
                label: null, 
                trackingNumber: `MANUAL-${orderId}`,
                requiresManualProcessing: true 
            };
        }
    }).execute();
    
    // Step 5: Send confirmation
    await ctx.step("send-confirmation", async () => {
        await sendCustomerNotification(customerId, {
            type: "order_confirmed",
            orderId,
            trackingNumber: shippingResult.trackingNumber,
            estimatedDelivery: calculateDeliveryDate(),
            requiresManualProcessing: shippingResult.requiresManualProcessing
        });
        return { confirmed: true };
    }).catch(async (error, ctx) => {
        // Notification failed, but order is complete - log for follow-up
        await ctx.step("log-notification-failure", async () => {
            console.error(`Failed to send confirmation for order ${orderId}:`, error.message);
            await createFollowUpTask("send_confirmation", { orderId, customerId, error: error.message });
            return { logged: true };
        }).execute();
        
        // Don't fail the workflow for notification issues
        return { confirmed: false, followUpRequired: true };
    }).execute();
    
    // Final step: Update order status
    await ctx.step("update-order-status", async () => {
        await updateOrderStatus(orderId, "confirmed", {
            paymentId: paymentResult.transactionId,
            trackingNumber: shippingResult.trackingNumber
        });
        return { orderComplete: true };
    }).execute();
});
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
mkdir -p apps/{cli}
mkdir -p tests/{unit,integration,e2e}

# Install shared dependencies at root
bun add -d typescript @types/node @types/bun
bun add zod

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

## Core Library API

**Main Workflow Class (@workflow/core)**
```typescript
// packages/core/src/workflow.ts
import type { WorkflowDefinition, WorkflowContext, ExecutionResult } from '@workflow/types';
import { WorkflowDefinitionSchema, WorkflowInputSchema, ValidationError } from '@workflow/types';
import { WorkflowEngine } from './engine';
import { createContext } from './context';

export namespace Workflow {
  const definitions = new Map<string, WorkflowDefinition>();
  
  export const define = (name: string, handler: (ctx: WorkflowContext) => Promise<void>): void => {
    // Validate workflow definition with Zod
    const definitionData = { name, handler };
    const validation = WorkflowDefinitionSchema.safeParse(definitionData);
    
    if (!validation.success) {
      throw ValidationError.create(
        `Invalid workflow definition for "${name}"`,
        validation.error
      );
    }
    
    definitions.set(name, validation.data);
  };
  
  export const start = async (
    name: string, 
    executionId: string, 
    input?: Record<string, unknown>,
    retryConfig?: RetryConfig,
    panicConfig?: PanicConfig
  ): Promise<ExecutionResult> => {
    // Validate input parameters with Zod
    const inputData = { workflowName: name, executionId, input, retryConfig, panicConfig };
    const validation = WorkflowInputSchema.safeParse(inputData);
    
    if (!validation.success) {
      throw ValidationError.create(
        `Invalid workflow start parameters`,
        validation.error
      );
    }
    
    const definition = definitions.get(name);
    if (!definition) {
      throw new Error(`Workflow "${name}" not found`);
    }
    
    const context = createContext(name, executionId, input, retryConfig, panicConfig);
    return await WorkflowEngine.execute(definition, context);
  };
  
  export const resume = async (executionId: string): Promise<ExecutionResult> => {
    // Validate execution ID format
    const validation = z.string().uuid().safeParse(executionId);
    if (!validation.success) {
      throw ValidationError.create(
        `Invalid execution ID format: ${executionId}`,
        validation.error
      );
    }
    
    return await WorkflowEngine.resume(executionId);
  };
  
  export const restart = async (executionId: string): Promise<ExecutionResult> => {
    // Validate execution ID format
    const validation = z.string().uuid().safeParse(executionId);
    if (!validation.success) {
      throw ValidationError.create(
        `Invalid execution ID format: ${executionId}`,
        validation.error
      );
    }
    
    return await WorkflowEngine.restart(executionId);
  };
  
  export const getStatus = async (executionId: string): Promise<ExecutionResult> => {
    // Validate execution ID format
    const validation = z.string().uuid().safeParse(executionId);
    if (!validation.success) {
      throw ValidationError.create(
        `Invalid execution ID format: ${executionId}`,
        validation.error
      );
    }
    
    return await WorkflowEngine.getStatus(executionId);
  };
}
```

**Workflow Context Implementation with Error Pipes**
```typescript
// packages/core/src/context.ts
import type { WorkflowContext, StepResult } from '@workflow/types';
import { StateManager } from './state';

// Error handler types
type ErrorHandler<T> = (error: Error, ctx: WorkflowContext) => Promise<T>;
type ErrorHandlerMap<T> = Record<string, ErrorHandler<T>> & { default?: ErrorHandler<T> };

// Step builder with error handling capabilities using functional approach
namespace StepBuilder {
  export interface Config<T> {
    stepId: string;
    handler: () => Promise<T>;
    context: WorkflowContext;
    errorHandlers?: ErrorHandlerMap<T>;
    catchHandler?: ErrorHandler<T>;
    circuitBreakerConfig?: {
      failureThreshold: number;
      resetTimeout: number;
      onOpen: (ctx: WorkflowContext) => Promise<void>;
    };
  }

  export const create = <T>(
    stepId: string,
    handler: () => Promise<T>,
    context: WorkflowContext
  ): StepBuilderAPI<T> => {
    const config: Config<T> = { stepId, handler, context };
    
    return {
      onError: (handlers: ErrorHandlerMap<T>) => {
        config.errorHandlers = handlers;
        return createAPI(config);
      },
      
      catch: (handler: ErrorHandler<T>) => {
        config.catchHandler = handler;
        return createAPI(config);
      },
      
      withCircuitBreaker: (circuitConfig: {
        failureThreshold: number;
        resetTimeout: number;
        onOpen: (ctx: WorkflowContext) => Promise<void>;
      }) => {
        config.circuitBreakerConfig = circuitConfig;
        return createAPI(config);
      },
      
      execute: () => execute(config)
    };
  };

  const createAPI = <T>(config: Config<T>): StepBuilderAPI<T> => ({
    onError: (handlers: ErrorHandlerMap<T>) => {
      config.errorHandlers = handlers;
      return createAPI(config);
    },
    
    catch: (handler: ErrorHandler<T>) => {
      config.catchHandler = handler;
      return createAPI(config);
    },
    
    withCircuitBreaker: (circuitConfig: {
      failureThreshold: number;
      resetTimeout: number;
      onOpen: (ctx: WorkflowContext) => Promise<void>;
    }) => {
      config.circuitBreakerConfig = circuitConfig;
      return createAPI(config);
    },
    
    execute: () => execute(config)
  });

  const execute = async <T>(config: Config<T>): Promise<T> => {
    const { stepId, handler, context } = config;
    const state = StateManager.load(context.executionId);
    
    // Check if step already completed
    const existingResult = state.steps[stepId];
    if (existingResult?.status === 'completed') {
      return existingResult.result as T;
    }

    // Check circuit breaker state
    if (config.circuitBreakerConfig) {
      const circuitState = await StateManager.getCircuitBreakerState(stepId);
      if (circuitState.isOpen) {
        await config.circuitBreakerConfig.onOpen(context);
        return;
      }
    }

    try {
      // Mark step as running
      await StateManager.updateStep(context.executionId, stepId, 'running');
      
      // Execute step
      const result = await handler();
      
      // Reset circuit breaker on success
      if (config.circuitBreakerConfig) {
        await StateManager.resetCircuitBreaker(stepId);
      }
      
      // Mark step as completed
      await StateManager.updateStep(context.executionId, stepId, 'completed', result);
      
      return result;
      
    } catch (error) {
      // Update circuit breaker failure count
      if (config.circuitBreakerConfig) {
        await StateManager.incrementCircuitBreakerFailures(stepId);
        const circuitState = await StateManager.getCircuitBreakerState(stepId);
        if (circuitState.failures >= config.circuitBreakerConfig.failureThreshold) {
          await StateManager.openCircuitBreaker(stepId, config.circuitBreakerConfig.resetTimeout);
        }
      }

      // Try error handlers first
      if (config.errorHandlers) {
        const errorType = error.constructor.name;
        const handler = config.errorHandlers[errorType] || config.errorHandlers.default;
        
        if (handler) {
          try {
            const result = await handler(error, context);
            await StateManager.updateStep(context.executionId, stepId, 'completed', result);
            return result;
          } catch (handlerError) {
            // Error handler failed, continue to catch handler or re-throw
            error = handlerError;
          }
        }
      }

      // Try catch handler
      if (config.catchHandler) {
        try {
          const result = await config.catchHandler(error, context);
          await StateManager.updateStep(context.executionId, stepId, 'completed', result);
          return result;
        } catch (catchError) {
          error = catchError;
        }
      }

      // Handle retry logic
      const maxRetries = 3;
      const currentAttempt = state.attempt || 1;
      
      if (currentAttempt < maxRetries) {
        // Increment attempt counter and retry
        await StateManager.incrementAttempt(context.executionId);
        await StateManager.updateStep(context.executionId, stepId, 'retrying', null, error);
        
        // Log retry attempt
        console.warn(`Step "${stepId}" failed on attempt ${currentAttempt}, retrying...`, error.message);
        
        // Re-throw error to trigger retry by engine
        throw error;
      }
      
      // Max retries exceeded - mark step as permanently failed
      await StateManager.updateStep(context.executionId, stepId, 'failed', null, error);
      
      // Log final failure
      console.error(`Step "${stepId}" failed permanently after ${maxRetries} attempts:`, error);
      
      // Re-throw to fail the entire workflow
      throw error;
    }
  };

  export interface StepBuilderAPI<T> {
    onError(handlers: ErrorHandlerMap<T>): StepBuilderAPI<T>;
    catch(handler: ErrorHandler<T>): StepBuilderAPI<T>;
    withCircuitBreaker(config: {
      failureThreshold: number;
      resetTimeout: number;
      onOpen: (ctx: WorkflowContext) => Promise<void>;
    }): StepBuilderAPI<T>;
    execute(): Promise<T>;
  }
}

export const createContext = (workflowName: string, executionId: string, input?: Record<string, unknown>): WorkflowContext => {
  const state = StateManager.load(executionId);
  
  const context: WorkflowContext = {
    workflowName,
    executionId,
    input,
    attempt: state.attempt || 1,
    
    step: <T>(stepId: string, handler: () => Promise<T>): StepBuilder.StepBuilderAPI<T> => {
      return StepBuilder.create(stepId, handler, context);
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

  return context;
};
```
        await StateManager.updateStep(executionId, stepId, 'completed');
        await WorkflowEngine.resume(executionId);
      }, ms);
      
      // Pause execution
      throw SleepInterrupt.create(wakeTime);
    }
  };
};
```

### 2. Type Definitions

**Core Types (@workflow/types) with Error Handling**
```typescript
// packages/types/src/workflow.ts
import { z } from 'zod';

// Zod schemas for runtime validation
export const WorkflowDefinitionSchema = z.object({
  name: z.string().min(1, 'Workflow name is required'),
  handler: z.function().args(z.record(z.unknown())).returns(z.promise(z.void()))
});

export const WorkflowContextSchema = z.object({
  workflowName: z.string(),
  executionId: z.string().uuid('Invalid execution ID format'),
  input: z.record(z.unknown()).optional(),
  attempt: z.number().int().positive(),
  restartAttempt: z.number().int().positive()
});

export const ExecutionStatusSchema = z.enum([
  'running', 'completed', 'failed', 'sleeping', 'panicked', 'restarting'
]);

export const StepStatusSchema = z.enum([
  'pending', 'running', 'completed', 'failed', 'sleeping', 'retrying'
]);

export const StepResultSchema = z.object({
  stepId: z.string().min(1),
  status: StepStatusSchema,
  result: z.record(z.unknown()).optional(),
  error: z.instanceof(Error).optional(),
  startedAt: z.date(),
  completedAt: z.date().optional()
});

export const ExecutionResultSchema = z.object({
  executionId: z.string().uuid(),
  status: ExecutionStatusSchema,
  startedAt: z.date(),
  completedAt: z.date().optional(),
  error: z.instanceof(Error).optional(),
  steps: z.record(z.string(), StepResultSchema),
  restartAttempt: z.number().int().positive()
});

export const RetryConfigSchema = z.object({
  maxAttempts: z.number().int().min(1).max(10),
  backoffMs: z.number().int().min(0).optional(),
  exponentialBackoff: z.boolean().optional()
});

export const PanicConfigSchema = z.object({
  maxRestartAttempts: z.number().int().min(1).max(5),
  restartDelayMs: z.number().int().min(1000),
  enableAutoRestart: z.boolean()
});

// Error handling types
export const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().int().min(1),
  resetTimeout: z.number().int().min(1000),
  onOpen: z.function().args(z.record(z.unknown())).returns(z.promise(z.void()))
});

export const ErrorHandlerSchema = z.function()
  .args(z.instanceof(Error), z.record(z.unknown()))
  .returns(z.promise(z.record(z.unknown())));

// TypeScript types inferred from Zod schemas
export interface WorkflowDefinition extends z.infer<typeof WorkflowDefinitionSchema> {}

// Error handler types
export type ErrorHandler<T> = (error: Error, ctx: WorkflowContext) => Promise<T>;
export type ErrorHandlerMap<T> = Record<string, ErrorHandler<T>> & { default?: ErrorHandler<T> };

export interface CircuitBreakerConfig extends z.infer<typeof CircuitBreakerConfigSchema> {}

// Step builder interface
export interface StepBuilder<T> {
  onError(handlers: ErrorHandlerMap<T>): StepBuilder<T>;
  catch(handler: ErrorHandler<T>): StepBuilder<T>;
  withCircuitBreaker(config: CircuitBreakerConfig): StepBuilder<T>;
  execute(): Promise<T>;
}

export interface WorkflowContext extends z.infer<typeof WorkflowContextSchema> {
  step<T>(stepId: string, handler: () => Promise<T>): StepBuilder.StepBuilderAPI<T>;
  sleep(stepId: string, ms: number): Promise<void>;
}

export interface ExecutionResult extends z.infer<typeof ExecutionResultSchema> {}

export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export interface StepResult extends z.infer<typeof StepResultSchema> {}

export type StepStatus = z.infer<typeof StepStatusSchema>;

export interface RetryConfig extends z.infer<typeof RetryConfigSchema> {}

export interface PanicConfig extends z.infer<typeof PanicConfigSchema> {}

// Circuit breaker state
export interface CircuitBreakerState {
  isOpen: boolean;
  failures: number;
  lastFailureTime?: number;
  resetTime?: number;
}

// packages/types/src/common.ts
import { z } from 'zod';

export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export const WorkflowInputSchema = z.object({
  workflowName: z.string().min(1),
  executionId: z.string().uuid(),
  input: z.record(z.unknown()).optional(),
  retryConfig: RetryConfigSchema.optional(),
  panicConfig: PanicConfigSchema.optional()
});

export namespace SleepInterrupt {
  export const create = (wakeTime: number): Error & { wakeTime: number } => {
    const error = new Error('Workflow sleeping') as Error & { wakeTime: number };
    error.name = 'SleepInterrupt';
    error.wakeTime = wakeTime;
    return error;
  };
  
  export const is = (error: unknown): error is Error & { wakeTime: number } => {
    return error instanceof Error && error.name === 'SleepInterrupt' && 'wakeTime' in error;
  };
}

export namespace WorkflowError {
  export const create = (
    message: string,
    stepId: string,
    attempt: number,
    originalError?: Error
  ): Error & { stepId: string; attempt: number; originalError?: Error } => {
    const error = new Error(message) as Error & { stepId: string; attempt: number; originalError?: Error };
    error.name = 'WorkflowError';
    error.stepId = stepId;
    error.attempt = attempt;
    error.originalError = originalError;
    return error;
  };
  
  export const is = (error: unknown): error is Error & { stepId: string; attempt: number; originalError?: Error } => {
    return error instanceof Error && error.name === 'WorkflowError' && 'stepId' in error && 'attempt' in error;
  };
}

export namespace PanicError {
  export const create = (
    message: string,
    stepId: string,
    attempt: number,
    originalError?: Error
  ): Error & { stepId: string; attempt: number; originalError?: Error } => {
    const error = new Error(message) as Error & { stepId: string; attempt: number; originalError?: Error };
    error.name = 'PanicError';
    error.stepId = stepId;
    error.attempt = attempt;
    error.originalError = originalError;
    return error;
  };
  
  export const is = (error: unknown): error is Error & { stepId: string; attempt: number; originalError?: Error } => {
    return error instanceof Error && error.name === 'PanicError' && 'stepId' in error && 'attempt' in error;
  };
}

export namespace ValidationError {
  export const create = (
    message: string,
    validationErrors: z.ZodError
  ): Error & { validationErrors: z.ZodError } => {
    const error = new Error(message) as Error & { validationErrors: z.ZodError };
    error.name = 'ValidationError';
    error.validationErrors = validationErrors;
    return error;
  };
  
  export const is = (error: unknown): error is Error & { validationErrors: z.ZodError } => {
    return error instanceof Error && error.name === 'ValidationError' && 'validationErrors' in error;
  };
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
      if (SleepInterrupt.is(error)) {
        // Workflow is sleeping - this is expected
        await StateManager.updateExecution(executionId, 'sleeping');
        return await StateManager.getExecutionResult(executionId);
      }
      
      if (PanicError.is(error)) {
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
      
      if (WorkflowError.is(error)) {
        // Workflow step failed permanently
        await StateManager.updateExecution(executionId, 'failed', error);
        throw error;
      }
      
      // Unexpected error - treat as panic
      const panicError = PanicError.create(
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
        throw PanicError.create(
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
  
  const isSystemPanic = (error: unknown): boolean => {
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

**StateManager Extensions for Circuit Breaker Support**
```typescript
// packages/core/src/state.ts - Circuit Breaker Extensions
import type { CircuitBreakerState } from '@workflow/types';

export namespace StateManager {
  // ... existing StateManager methods ...

  // Circuit breaker state management
  export const getCircuitBreakerState = async (stepId: string): Promise<CircuitBreakerState> => {
    const db = DatabaseConnection.getConnection();
    const result = await db.query(
      'SELECT * FROM circuit_breaker_state WHERE step_id = ?',
      [stepId]
    );
    
    if (result.length === 0) {
      return { isOpen: false, failures: 0 };
    }
    
    const state = result[0];
    const now = Date.now();
    
    // Check if circuit should be reset
    if (state.is_open && state.reset_time && now >= state.reset_time) {
      await resetCircuitBreaker(stepId);
      return { isOpen: false, failures: 0 };
    }
    
    return {
      isOpen: state.is_open,
      failures: state.failures,
      lastFailureTime: state.last_failure_time,
      resetTime: state.reset_time
    };
  };

  export const incrementCircuitBreakerFailures = async (stepId: string): Promise<void> => {
    const db = DatabaseConnection.getConnection();
    const now = Date.now();
    
    await db.query(`
      INSERT INTO circuit_breaker_state (step_id, failures, last_failure_time, is_open)
      VALUES (?, 1, ?, false)
      ON CONFLICT(step_id) DO UPDATE SET
        failures = failures + 1,
        last_failure_time = ?
    `, [stepId, now, now]);
  };

  export const openCircuitBreaker = async (stepId: string, resetTimeoutMs: number): Promise<void> => {
    const db = DatabaseConnection.getConnection();
    const now = Date.now();
    const resetTime = now + resetTimeoutMs;
    
    await db.query(`
      UPDATE circuit_breaker_state 
      SET is_open = true, reset_time = ?
      WHERE step_id = ?
    `, [resetTime, stepId]);
  };

  export const resetCircuitBreaker = async (stepId: string): Promise<void> => {
    const db = DatabaseConnection.getConnection();
    
    await db.query(`
      UPDATE circuit_breaker_state 
      SET is_open = false, failures = 0, reset_time = NULL
      WHERE step_id = ?
    `, [stepId]);
  };

  // Database schema for circuit breaker state
  export const createCircuitBreakerTable = async (): Promise<void> => {
    const db = DatabaseConnection.getConnection();
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS circuit_breaker_state (
        step_id TEXT PRIMARY KEY,
        failures INTEGER DEFAULT 0,
        is_open BOOLEAN DEFAULT false,
        last_failure_time INTEGER,
        reset_time INTEGER
      )
    `);
  };

  // Helper functions for error handling
  export const logStepError = async (
    executionId: string,
    stepId: string,
    error: Error,
    attempt: number
  ): Promise<void> => {
    const db = DatabaseConnection.getConnection();
    
    await db.query(`
      INSERT INTO step_errors (execution_id, step_id, error_message, error_stack, attempt, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [executionId, stepId, error.message, error.stack, attempt, Date.now()]);
  };

  export const getStepErrorHistory = async (
    executionId: string,
    stepId: string
  ): Promise<Array<{
    errorMessage: string;
    errorStack: string;
    attempt: number;
    timestamp: number;
  }>> => {
    const db = DatabaseConnection.getConnection();
    
    const results = await db.query(`
      SELECT error_message, error_stack, attempt, timestamp
      FROM step_errors
      WHERE execution_id = ? AND step_id = ?
      ORDER BY timestamp DESC
    `, [executionId, stepId]);
    
    return results.map(row => ({
      errorMessage: row.error_message,
      errorStack: row.error_stack,
      attempt: row.attempt,
      timestamp: row.timestamp
    }));
  };

  // Database schema for error logging
  export const createErrorLogTable = async (): Promise<void> => {
    const db = DatabaseConnection.getConnection();
    
    await db.query(`
      CREATE TABLE IF NOT EXISTS step_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        execution_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        error_message TEXT NOT NULL,
        error_stack TEXT,
        attempt INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        INDEX idx_execution_step (execution_id, step_id)
      )
    `);
  };
}
```

**Enhanced Context with Configurable Retry and Panic Recovery**
```typescript
// packages/core/src/context.ts - Enhanced version
import { z } from 'zod';
import { WorkflowContextSchema, RetryConfigSchema, PanicConfigSchema, ValidationError } from '@workflow/types';

export const createContext = (
  workflowName: string, 
  executionId: string, 
  input?: Record<string, unknown>,
  retryConfig?: RetryConfig,
  panicConfig?: PanicConfig
): WorkflowContext => {
  // Validate context parameters with Zod
  const contextData = { workflowName, executionId, input, attempt: 1, restartAttempt: 1 };
  const contextValidation = WorkflowContextSchema.safeParse(contextData);
  
  if (!contextValidation.success) {
    throw ValidationError.create(
      `Invalid workflow context`,
      contextValidation.error
    );
  }

  // Validate retry configuration
  if (retryConfig) {
    const retryValidation = RetryConfigSchema.safeParse(retryConfig);
    if (!retryValidation.success) {
      throw ValidationError.create(
        `Invalid retry configuration`,
        retryValidation.error
      );
    }
  }

  // Validate panic configuration
  if (panicConfig) {
    const panicValidation = PanicConfigSchema.safeParse(panicConfig);
    if (!panicValidation.success) {
      throw ValidationError.create(
        `Invalid panic configuration`,
        panicValidation.error
      );
    }
  }

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
      // Validate step ID
      const stepIdValidation = z.string().min(1, 'Step ID cannot be empty').safeParse(stepId);
      if (!stepIdValidation.success) {
        throw ValidationError.create(
          `Invalid step ID: ${stepId}`,
          stepIdValidation.error
        );
      }

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
          
          // Execute step with panic detection and input validation
          const result = await executeStepWithValidation(handler, stepId, attempt);
          
          // Mark step as completed
          await StateManager.updateStep(executionId, stepId, 'completed', result);
          
          return result;
          
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // Check if this is a panic-level error
          if (isPanicError(lastError)) {
            await StateManager.updateStep(executionId, stepId, 'failed', null, lastError, attempt);
            throw PanicError.create(
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
      
      const workflowError = WorkflowError.create(
        `Step "${stepId}" failed after ${retryConf.maxAttempts} attempts: ${lastError!.message}`,
        stepId,
        retryConf.maxAttempts,
        lastError!
      );
      
      throw workflowError;
    },
    
    sleep: async (stepId: string, ms: number): Promise<void> => {
      // Validate sleep parameters
      const sleepValidation = z.object({
        stepId: z.string().min(1, 'Step ID cannot be empty'),
        ms: z.number().int().min(0, 'Sleep duration must be non-negative').max(300000, 'Sleep duration cannot exceed 5 minutes')
      }).safeParse({ stepId, ms });

      if (!sleepValidation.success) {
        throw ValidationError.create(
          `Invalid sleep parameters`,
          sleepValidation.error
        );
      }

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
      throw SleepInterrupt.create(wakeTime);
    }
  };
};

const executeStepWithValidation = async <T>(
  handler: () => Promise<T>,
  stepId: string,
  attempt: number
): Promise<T> => {
  try {
    const result = await handler();
    
    // Validate step result is serializable for state persistence
    try {
      JSON.stringify(result);
    } catch (serializationError) {
      throw ValidationError.create(
        `Step "${stepId}" returned non-serializable result`,
        new z.ZodError([{
          code: 'custom',
          message: 'Result must be JSON serializable',
          path: ['result']
        }])
      );
    }
    
    return result;
  } catch (error) {
    // Enhanced panic detection
    if (isPanicError(error)) {
      throw PanicError.create(
        `Panic detected in step "${stepId}": ${error.message}`,
        stepId,
        attempt,
        error instanceof Error ? error : new Error(String(error))
      );
    }
    throw error;
  }
};

const isPanicError = (error: unknown): boolean => {
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
    "build": "bun build src/index.ts --outdir dist --target bun && bun build src/index.ts --outdir dist --outfile index.cjs --target bun --format cjs",
    "typecheck": "bun tsc --noEmit",
    "test": "bun test",
    "prepublishOnly": "bun run build"
  },
  "dependencies": {
    "@workflow/types": "workspace:*",
    "@workflow/database": "workspace:*",
    "@workflow/utils": "workspace:*",
    "zod": "^3.22.0"
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

### CLI Application (apps/cli)

The CLI provides command-line interface for workflow management, execution monitoring, and system administration without requiring a web interface.

**CLI Entry Point**
```typescript
// apps/cli/src/index.ts
#!/usr/bin/env bun
import { Command } from 'commander';
import { WorkflowRegistry } from '@workflow/database';
import { Logger } from '@workflow/utils';
import { listCommand } from './commands/list';
import { createCommand } from './commands/create';
import { startCommand } from './commands/start';
import { statusCommand } from './commands/status';
import { cleanupCommand } from './commands/cleanup';
import { CLIConfig } from './utils/config';

const program = new Command();
const logger = Logger.create('cli');

// Initialize workflow registry
WorkflowRegistry.initialize({
  baseDir: CLIConfig.workflowsDir,
  registryDbPath: CLIConfig.registryDbPath
});

program
  .name('workflow')
  .description('Workflow management CLI')
  .version('1.0.0');

// List workflows command
program
  .command('list')
  .alias('ls')
  .description('List all workflows')
  .option('-s, --status <status>', 'Filter by status (active|inactive)')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .action(listCommand);

// Create workflow command
program
  .command('create <name>')
  .description('Create a new workflow')
  .option('-d, --description <description>', 'Workflow description')
  .option('-f, --file <file>', 'Load workflow definition from file')
  .option('--dry-run', 'Validate without creating')
  .action(createCommand);

// Start execution command
program
  .command('start <workflow>')
  .description('Start workflow execution')
  .option('-i, --input <input>', 'Input data as JSON string')
  .option('-f, --input-file <file>', 'Load input from file')
  .option('--execution-id <id>', 'Custom execution ID (UUID)')
  .option('--max-retries <count>', 'Maximum retry attempts', '3')
  .option('--retry-delay <ms>', 'Retry delay in milliseconds', '1000')
  .action(startCommand);

// Status command
program
  .command('status [execution-id]')
  .description('Check execution status')
  .option('-w, --workflow <name>', 'Show status for specific workflow')
  .option('-f, --format <format>', 'Output format (table|json)', 'table')
  .option('--follow', 'Follow execution progress')
  .action(statusCommand);

// Cleanup command
program
  .command('cleanup')
  .description('Clean up old executions and databases')
  .option('--older-than <days>', 'Remove executions older than N days', '30')
  .option('--status <status>', 'Only remove executions with specific status')
  .option('--dry-run', 'Show what would be removed without deleting')
  .action(cleanupCommand);

// Global error handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down CLI...');
  WorkflowRegistry.close();
  process.exit(0);
});

program.parse();
```

**List Workflows Command**
```typescript
// apps/cli/src/commands/list.ts
import { WorkflowRegistry } from '@workflow/database';
import { formatTable, formatJson } from '../utils/output';
import { Logger } from '@workflow/utils';

const logger = Logger.create('cli-list');

export interface ListOptions {
  status?: 'active' | 'inactive';
  format: 'table' | 'json';
}

export const listCommand = async (options: ListOptions): Promise<void> => {
  try {
    const result = await WorkflowRegistry.listWorkflows();
    
    if (!result.success) {
      logger.error('Failed to list workflows:', result.error);
      process.exit(1);
    }

    let workflows = result.data;

    // Filter by status if specified
    if (options.status) {
      workflows = workflows.filter(w => w.status === options.status);
    }

    if (workflows.length === 0) {
      console.log('No workflows found.');
      return;
    }

    // Format output
    if (options.format === 'json') {
      console.log(formatJson(workflows));
    } else {
      console.log(formatTable(workflows, [
        { key: 'name', label: 'Name', width: 20 },
        { key: 'status', label: 'Status', width: 10 },
        { key: 'executionCount', label: 'Executions', width: 12 },
        { key: 'lastExecutionAt', label: 'Last Execution', width: 20, 
          format: (date: Date | undefined) => date ? date.toLocaleString() : 'Never' },
        { key: 'createdAt', label: 'Created', width: 20, 
          format: (date: Date) => date.toLocaleString() }
      ]));
    }

    logger.info(`Listed ${workflows.length} workflow(s)`);

  } catch (error) {
    logger.error('Error listing workflows:', error);
    process.exit(1);
  }
};
```

**Create Workflow Command**
```typescript
// apps/cli/src/commands/create.ts
import fs from 'fs';
import { z } from 'zod';
import { Workflow } from '@workflow/core';
import { WorkflowRegistry } from '@workflow/database';
import { Logger } from '@workflow/utils';

const logger = Logger.create('cli-create');

export interface CreateOptions {
  description?: string;
  file?: string;
  dryRun?: boolean;
}

const WorkflowDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(z.object({
    id: z.string(),
    type: z.string(),
    config: z.record(z.unknown()).optional().default({})
  })),
  retryConfig: z.object({
    maxAttempts: z.number().int().min(1).max(10).default(3),
    backoffMs: z.number().int().min(0).default(1000),
    exponentialBackoff: z.boolean().default(true)
  }).optional(),
  panicConfig: z.object({
    maxRestartAttempts: z.number().int().min(1).max(5).default(3),
    restartDelayMs: z.number().int().min(1000).default(5000),
    enableAutoRestart: z.boolean().default(true)
  }).optional()
});

export const createCommand = async (name: string, options: CreateOptions): Promise<void> => {
  try {
    let workflowDef: Record<string, unknown>;

    if (options.file) {
      // Load from file
      if (!fs.existsSync(options.file)) {
        logger.error(`File not found: ${options.file}`);
        process.exit(1);
      }

      const fileContent = fs.readFileSync(options.file, 'utf-8');
      try {
        workflowDef = JSON.parse(fileContent);
      } catch (error) {
        logger.error(`Invalid JSON in file: ${options.file}`);
        process.exit(1);
      }
    } else {
      // Create basic workflow
      workflowDef = {
        name,
        description: options.description,
        steps: [
          {
            id: 'example-step',
            type: 'log',
            config: { message: 'Hello from workflow!' }
          }
        ]
      };
    }

    // Validate workflow definition
    const validation = WorkflowDefinitionSchema.safeParse(workflowDef);
    if (!validation.success) {
      logger.error('Invalid workflow definition:');
      validation.error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }

    const validatedDef = validation.data;

    if (options.dryRun) {
      console.log('Workflow definition is valid:');
      console.log(JSON.stringify(validatedDef, null, 2));
      return;
    }

    // Register workflow
    const registerResult = await WorkflowRegistry.registerWorkflow(validatedDef.name);
    if (!registerResult.success) {
      logger.error('Failed to register workflow:', registerResult.error);
      process.exit(1);
    }

    // Define workflow in engine
    Workflow.define(validatedDef.name, async (ctx) => {
      for (const step of validatedDef.steps) {
        await ctx.step(step.id, async () => {
          return await executeStepByType(step.type, step.config, ctx);
        });
      }
    });

    console.log(`✅ Created workflow: ${validatedDef.name}`);
    console.log(`   Database: ${registerResult.data}`);
    console.log(`   Steps: ${validatedDef.steps.length}`);

    logger.info(`Created workflow: ${validatedDef.name}`);

  } catch (error) {
    logger.error('Error creating workflow:', error);
    process.exit(1);
  }
};

const executeStepByType = async (
  type: string, 
  config: Record<string, unknown>, 
  ctx: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  switch (type) {
    case 'log':
      console.log(config.message || 'Step executed');
      return { logged: true, timestamp: new Date() };
    
    case 'delay':
      const ms = config.duration || 1000;
      await new Promise(resolve => setTimeout(resolve, ms));
      return { delayed: ms };
    
    case 'http':
      const response = await fetch(config.url);
      return { 
        status: response.status, 
        data: await response.text(),
        headers: Object.fromEntries(response.headers.entries())
      };
    
    default:
      throw new Error(`Unknown step type: ${type}`);
  }
};
```

**Start Execution Command**
```typescript
// apps/cli/src/commands/start.ts
import fs from 'fs';
import { Workflow } from '@workflow/core';
import { WorkflowRegistry } from '@workflow/database';
import { Logger } from '@workflow/utils';

const logger = Logger.create('cli-start');

export interface StartOptions {
  input?: string;
  inputFile?: string;
  executionId?: string;
  maxRetries?: string;
  retryDelay?: string;
}

export const startCommand = async (workflowName: string, options: StartOptions): Promise<void> => {
  try {
    // Check if workflow exists
    const statsResult = await WorkflowRegistry.getWorkflowStats(workflowName);
    if (!statsResult.success) {
      logger.error('Failed to check workflow:', statsResult.error);
      process.exit(1);
    }

    if (!statsResult.data) {
      logger.error(`Workflow not found: ${workflowName}`);
      console.log('Available workflows:');
      const listResult = await WorkflowRegistry.listWorkflows();
      if (listResult.success) {
        listResult.data.forEach(w => console.log(`  - ${w.name}`));
      }
      process.exit(1);
    }

    // Parse input data
    let inputData: Record<string, unknown> = {};
    if (options.inputFile) {
      if (!fs.existsSync(options.inputFile)) {
        logger.error(`Input file not found: ${options.inputFile}`);
        process.exit(1);
      }
      const fileContent = fs.readFileSync(options.inputFile, 'utf-8');
      try {
        inputData = JSON.parse(fileContent);
      } catch (error) {
        logger.error(`Invalid JSON in input file: ${options.inputFile}`);
        process.exit(1);
      }
    } else if (options.input) {
      try {
        inputData = JSON.parse(options.input);
      } catch (error) {
        logger.error('Invalid JSON in input parameter');
        process.exit(1);
      }
    }

    // Generate execution ID if not provided
    const executionId = options.executionId || crypto.randomUUID();

    // Parse retry configuration
    const retryConfig = {
      maxAttempts: parseInt(options.maxRetries || '3'),
      backoffMs: parseInt(options.retryDelay || '1000'),
      exponentialBackoff: true
    };

    console.log(`🚀 Starting workflow: ${workflowName}`);
    console.log(`   Execution ID: ${executionId}`);
    console.log(`   Input: ${JSON.stringify(inputData)}`);
    console.log(`   Max retries: ${retryConfig.maxAttempts}`);

    // Start execution
    const startTime = Date.now();
    const result = await Workflow.start(workflowName, executionId, inputData, retryConfig);
    const duration = Date.now() - startTime;

    console.log(`\n✅ Workflow completed in ${duration}ms`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Steps completed: ${Object.keys(result.steps).length}`);
    
    if (result.error) {
      console.log(`   Error: ${result.error.message}`);
    }

    // Show step details
    console.log('\nStep Details:');
    for (const [stepId, step] of Object.entries(result.steps)) {
      const status = step.status === 'completed' ? '✅' : 
                    step.status === 'failed' ? '❌' : 
                    step.status === 'running' ? '🔄' : '⏸️';
      
      console.log(`  ${status} ${stepId}: ${step.status}`);
      if (step.error) {
        console.log(`      Error: ${step.error.message}`);
      }
    }

    logger.info(`Workflow execution completed: ${workflowName} -> ${executionId}`);

  } catch (error) {
    logger.error('Error starting workflow:', error);
    console.log(`\n❌ Workflow failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
};
```

**Status Command**
```typescript
// apps/cli/src/commands/status.ts
import { Workflow } from '@workflow/core';
import { WorkflowDatabase, WorkflowRegistry } from '@workflow/database';
import { formatTable, formatJson } from '../utils/output';
import { Logger } from '@workflow/utils';

const logger = Logger.create('cli-status');

export interface StatusOptions {
  workflow?: string;
  format: 'table' | 'json';
  follow?: boolean;
}

export const statusCommand = async (executionId?: string, options: StatusOptions = { format: 'table' }): Promise<void> => {
  try {
    if (executionId) {
      // Show specific execution status
      await showExecutionStatus(executionId, options);
    } else if (options.workflow) {
      // Show all executions for a workflow
      await showWorkflowExecutions(options.workflow, options);
    } else {
      // Show overview of all workflows
      await showWorkflowsOverview(options);
    }

  } catch (error) {
    logger.error('Error getting status:', error);
    process.exit(1);
  }
};

const showExecutionStatus = async (executionId: string, options: StatusOptions): Promise<void> => {
  // Find which workflow contains this execution
  const workflowsResult = await WorkflowRegistry.listWorkflows();
  if (!workflowsResult.success) {
    throw workflowsResult.error;
  }

  let execution = null;
  let workflowName = '';

  for (const workflow of workflowsResult.data) {
    const execResult = await WorkflowDatabase.loadExecution(workflow.name, executionId);
    if (execResult.success && execResult.data) {
      execution = execResult.data;
      workflowName = workflow.name;
      break;
    }
  }

  if (!execution) {
    console.log(`Execution not found: ${executionId}`);
    return;
  }

  if (options.format === 'json') {
    console.log(formatJson(execution));
    return;
  }

  // Table format
  console.log(`\nExecution: ${executionId}`);
  console.log(`Workflow: ${workflowName}`);
  console.log(`Status: ${execution.status}`);
  console.log(`Started: ${execution.startedAt.toLocaleString()}`);
  if (execution.completedAt) {
    console.log(`Completed: ${execution.completedAt.toLocaleString()}`);
    const duration = execution.completedAt.getTime() - execution.startedAt.getTime();
    console.log(`Duration: ${duration}ms`);
  }
  console.log(`Restart Attempt: ${execution.restartAttempt}`);

  if (execution.error) {
    console.log(`Error: ${execution.error.message}`);
  }

  // Steps table
  const steps = Object.entries(execution.steps).map(([stepId, step]) => ({
    stepId,
    status: step.status,
    startedAt: step.startedAt.toLocaleString(),
    completedAt: step.completedAt?.toLocaleString() || '-',
    error: step.error?.message || '-'
  }));

  console.log('\nSteps:');
  console.log(formatTable(steps, [
    { key: 'stepId', label: 'Step ID', width: 20 },
    { key: 'status', label: 'Status', width: 12 },
    { key: 'startedAt', label: 'Started', width: 20 },
    { key: 'completedAt', label: 'Completed', width: 20 },
    { key: 'error', label: 'Error', width: 30 }
  ]));

  // Follow mode
  if (options.follow && (execution.status === 'running' || execution.status === 'sleeping')) {
    console.log('\nFollowing execution progress...');
    await followExecution(workflowName, executionId);
  }
};

const showWorkflowExecutions = async (workflowName: string, options: StatusOptions): Promise<void> => {
  const execsResult = await WorkflowDatabase.listExecutions(workflowName, { limit: 20 });
  if (!execsResult.success) {
    throw execsResult.error;
  }

  const executions = execsResult.data;

  if (executions.length === 0) {
    console.log(`No executions found for workflow: ${workflowName}`);
    return;
  }

  if (options.format === 'json') {
    console.log(formatJson(executions));
    return;
  }

  console.log(`\nExecutions for workflow: ${workflowName}`);
  
  const execData = executions.map(exec => ({
    executionId: exec.executionId.substring(0, 8) + '...',
    status: exec.status,
    startedAt: exec.startedAt.toLocaleString(),
    completedAt: exec.completedAt?.toLocaleString() || '-',
    restartAttempt: exec.restartAttempt,
    steps: Object.keys(exec.steps).length
  }));

  console.log(formatTable(execData, [
    { key: 'executionId', label: 'Execution ID', width: 12 },
    { key: 'status', label: 'Status', width: 12 },
    { key: 'startedAt', label: 'Started', width: 20 },
    { key: 'completedAt', label: 'Completed', width: 20 },
    { key: 'restartAttempt', label: 'Restarts', width: 10 },
    { key: 'steps', label: 'Steps', width: 8 }
  ]));
};

const showWorkflowsOverview = async (options: StatusOptions): Promise<void> => {
  const workflowsResult = await WorkflowRegistry.listWorkflows();
  if (!workflowsResult.success) {
    throw workflowsResult.error;
  }

  const workflows = workflowsResult.data;

  if (workflows.length === 0) {
    console.log('No workflows found.');
    return;
  }

  if (options.format === 'json') {
    console.log(formatJson(workflows));
    return;
  }

  console.log('\nWorkflows Overview:');
  console.log(formatTable(workflows, [
    { key: 'name', label: 'Name', width: 20 },
    { key: 'status', label: 'Status', width: 10 },
    { key: 'executionCount', label: 'Executions', width: 12 },
    { key: 'lastExecutionAt', label: 'Last Execution', width: 20, 
      format: (date: Date | undefined) => date ? date.toLocaleString() : 'Never' }
  ]));
};

const followExecution = async (workflowName: string, executionId: string): Promise<void> => {
  const pollInterval = 2000; // 2 seconds
  
  while (true) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    const execResult = await WorkflowDatabase.loadExecution(workflowName, executionId);
    if (!execResult.success || !execResult.data) {
      console.log('Execution no longer found');
      break;
    }

    const execution = execResult.data;
    
    if (execution.status === 'completed' || execution.status === 'failed') {
      console.log(`\n✅ Execution ${execution.status}: ${executionId}`);
      break;
    }

    // Show current status
    process.stdout.write(`\r🔄 Status: ${execution.status} | Steps: ${Object.keys(execution.steps).length}`);
  }
};
```

**CLI Output Utilities**
```typescript
// apps/cli/src/utils/output.ts
export interface TableColumn {
  key: string;
  label: string;
  width: number;
  format?: (value: unknown) => string;
}

export const formatTable = (data: Record<string, unknown>[], columns: TableColumn[]): string => {
  if (data.length === 0) {
    return 'No data to display';
  }

  const lines: string[] = [];
  
  // Header
  const header = columns.map(col => col.label.padEnd(col.width)).join(' | ');
  lines.push(header);
  lines.push(columns.map(col => '-'.repeat(col.width)).join('-+-'));
  
  // Rows
  for (const row of data) {
    const line = columns.map(col => {
      let value = row[col.key];
      if (col.format && value !== undefined) {
        value = col.format(value);
      }
      return String(value || '').padEnd(col.width);
    }).join(' | ');
    lines.push(line);
  }
  
  return lines.join('\n');
};

export const formatJson = (data: unknown): string => {
  return JSON.stringify(data, null, 2);
};
```

**CLI Configuration**
```typescript
// apps/cli/src/utils/config.ts
import path from 'path';
import os from 'os';

export const CLIConfig = {
  workflowsDir: process.env.WORKFLOW_DIR || path.join(os.homedir(), '.workflows'),
  registryDbPath: process.env.WORKFLOW_REGISTRY_DB || undefined, // Will use default in workflowsDir
  logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info'
};
```

**CLI Package Configuration**
```json
// apps/cli/package.json
{
  "name": "workflow-cli",
  "version": "1.0.0",
  "description": "Command-line interface for workflow management",
  "main": "dist/index.js",
  "bin": {
    "workflow": "./dist/index.js"
  },
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target bun",
    "start": "bun dist/index.js",
    "test": "bun test",
    "typecheck": "bun tsc --noEmit"
  },
  "dependencies": {
    "@workflow/core": "workspace:*",
    "@workflow/database": "workspace:*",
    "@workflow/types": "workspace:*",
    "@workflow/utils": "workspace:*",
    "commander": "^11.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
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

### 5. Per-Workflow Database Schema (@workflow/database)

The database package now manages separate SQLite databases for each workflow, providing isolation and better organization of workflow data.

**Workflow Registry for Discovery**
```typescript
// packages/database/src/registry.ts
import { Database } from "bun:sqlite";
import path from "path";
import fs from "fs";
import { Logger } from '@workflow/utils';
import type { Result } from '@workflow/types';

const logger = Logger.create('workflow-registry');

// Drizzle ORM-like WorkflowRegistry with Zod schemas
import { z } from 'zod';

// Schema definitions (similar to Drizzle table definitions)
export const workflowRegistrySchema = z.object({
  name: z.string().min(1, 'Workflow name is required'),
  dbPath: z.string().min(1, 'Database path is required'),
  workflowDir: z.string().min(1, 'Workflow directory is required'),
  logDir: z.string().min(1, 'Log directory is required'),
  createdAt: z.date(),
  lastExecutionAt: z.date().nullable(),
  executionCount: z.number().int().min(0),
  status: z.enum(['active', 'inactive', 'archived']),
  version: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional()
});

export const workflowConfigSchema = z.object({
  retryConfig: z.object({
    maxAttempts: z.number().int().min(1).max(10),
    backoffMs: z.number().int().min(0),
    exponentialBackoff: z.boolean()
  }).optional(),
  panicConfig: z.object({
    maxRestartAttempts: z.number().int().min(1).max(5),
    restartDelayMs: z.number().int().min(1000),
    enableAutoRestart: z.boolean()
  }).optional(),
  environment: z.string().optional(),
  variables: z.record(z.string()).optional(),
  secrets: z.record(z.string()).optional()
});

export const registryConfigSchema = z.object({
  baseDir: z.string().min(1, 'Base directory is required'),
  registryDbPath: z.string().optional(),
  autoCleanup: z.boolean().default(false),
  maxExecutionHistory: z.number().int().min(1).default(1000)
});

// Type inference from schemas
export type WorkflowRegistry = z.infer<typeof workflowRegistrySchema>;
export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;
export type RegistryConfig = z.infer<typeof registryConfigSchema>;

// Query builder types (Drizzle-like)
export interface SelectQuery<T> {
  where(condition: (fields: T) => boolean): SelectQuery<T>;
  orderBy(field: keyof T, direction?: 'asc' | 'desc'): SelectQuery<T>;
  limit(count: number): SelectQuery<T>;
  offset(count: number): SelectQuery<T>;
  execute(): Promise<T[]>;
  first(): Promise<T | null>;
}

export interface InsertQuery<T> {
  values(data: Partial<T>): InsertQuery<T>;
  onConflict(action: 'ignore' | 'replace' | 'update'): InsertQuery<T>;
  returning(fields?: (keyof T)[]): InsertQuery<T>;
  execute(): Promise<T>;
}

export interface UpdateQuery<T> {
  set(data: Partial<T>): UpdateQuery<T>;
  where(condition: (fields: T) => boolean): UpdateQuery<T>;
  returning(fields?: (keyof T)[]): UpdateQuery<T>;
  execute(): Promise<T[]>;
}

export interface DeleteQuery<T> {
  where(condition: (fields: T) => boolean): DeleteQuery<T>;
  execute(): Promise<number>;
}

// Drizzle-like table interface
export interface WorkflowRegistryTable {
  select(): SelectQuery<WorkflowRegistry>;
  insert(): InsertQuery<WorkflowRegistry>;
  update(): UpdateQuery<WorkflowRegistry>;
  delete(): DeleteQuery<WorkflowRegistry>;
}

// Main registry implementation with Drizzle-like API
export namespace WorkflowRegistryORM {
  let db: Database | null = null;
  let config: RegistryConfig;
  
  // Initialize with validated config
  export const initialize = (registryConfig: unknown): void => {
    const validatedConfig = registryConfigSchema.parse(registryConfig);
    config = validatedConfig;
    
    // Ensure base directory exists
    if (!fs.existsSync(config.baseDir)) {
      fs.mkdirSync(config.baseDir, { recursive: true });
    }

    // Initialize registry database
    const registryPath = config.registryDbPath || path.join(config.baseDir, 'registry.db');
    db = new Database(registryPath);
    
    // Enable optimizations
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
    
    // Create registry table with enhanced schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_registry (
        name TEXT PRIMARY KEY,
        db_path TEXT NOT NULL,
        workflow_dir TEXT NOT NULL,
        log_dir TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_execution_at DATETIME,
        execution_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
        version TEXT,
        description TEXT,
        tags TEXT, -- JSON array
        metadata TEXT -- JSON object
      );
      
      CREATE INDEX IF NOT EXISTS idx_workflow_status ON workflow_registry(status);
      CREATE INDEX IF NOT EXISTS idx_workflow_last_execution ON workflow_registry(last_execution_at);
      CREATE INDEX IF NOT EXISTS idx_workflow_created ON workflow_registry(created_at);
    `);

    logger.info(`Workflow registry initialized at: ${registryPath}`);
  };

  // Drizzle-like table accessor
  export const workflowRegistry: WorkflowRegistryTable = {
    select(): SelectQuery<WorkflowRegistry> {
      return new SelectQueryImpl<WorkflowRegistry>(db!, 'workflow_registry', workflowRegistrySchema);
    },
    
    insert(): InsertQuery<WorkflowRegistry> {
      return new InsertQueryImpl<WorkflowRegistry>(db!, 'workflow_registry', workflowRegistrySchema);
    },
    
    update(): UpdateQuery<WorkflowRegistry> {
      return new UpdateQueryImpl<WorkflowRegistry>(db!, 'workflow_registry', workflowRegistrySchema);
    },
    
    delete(): DeleteQuery<WorkflowRegistry> {
      return new DeleteQueryImpl<WorkflowRegistry>(db!, 'workflow_registry');
    }
  };

  // High-level API methods with validation
  export const registerWorkflow = async (data: {
    name: string;
    version?: string;
    description?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<WorkflowRegistry> => {
    if (!db) throw new Error('Registry not initialized');

    // Validate input
    const workflowName = z.string().min(1).parse(data.name);
    
    // Generate paths
    const workflowDir = path.join(config.baseDir, 'workflows', workflowName);
    const dbPath = path.join(workflowDir, `${workflowName}.db`);
    const logDir = path.join(workflowDir, 'logs');
    
    // Ensure directories exist
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.mkdirSync(logDir, { recursive: true });
    
    // Create workflow entry
    const workflow = await workflowRegistry.insert()
      .values({
        name: workflowName,
        dbPath,
        workflowDir,
        logDir,
        createdAt: new Date(),
        lastExecutionAt: null,
        executionCount: 0,
        status: 'active',
        version: data.version,
        description: data.description,
        tags: data.tags,
        metadata: data.metadata
      })
      .onConflict('replace')
      .execute();

    logger.info(`Registered workflow: ${workflowName} -> ${dbPath}`);
    return workflow;
  };

  export const findWorkflow = async (name: string): Promise<WorkflowRegistry | null> => {
    const workflowName = z.string().min(1).parse(name);
    
    return await workflowRegistry.select()
      .where(w => w.name === workflowName)
      .first();
  };

  export const listWorkflows = async (filters?: {
    status?: 'active' | 'inactive' | 'archived';
    tags?: string[];
    limit?: number;
    offset?: number;
  }): Promise<WorkflowRegistry[]> => {
    let query = workflowRegistry.select()
      .orderBy('lastExecutionAt', 'desc');

    if (filters?.status) {
      query = query.where(w => w.status === filters.status);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    if (filters?.offset) {
      query = query.offset(filters.offset);
    }

    return await query.execute();
  };

  export const updateExecutionStats = async (name: string): Promise<WorkflowRegistry[]> => {
    const workflowName = z.string().min(1).parse(name);
    
    return await workflowRegistry.update()
      .set({
        lastExecutionAt: new Date(),
        executionCount: db!.prepare('SELECT execution_count + 1 FROM workflow_registry WHERE name = ?').get(workflowName) as number
      })
      .where(w => w.name === workflowName)
      .execute();
  };

  export const archiveWorkflow = async (name: string): Promise<WorkflowRegistry[]> => {
    const workflowName = z.string().min(1).parse(name);
    
    return await workflowRegistry.update()
      .set({ status: 'archived' })
      .where(w => w.name === workflowName)
      .execute();
  };

  export const deleteWorkflow = async (name: string): Promise<number> => {
    const workflowName = z.string().min(1).parse(name);
    
    // Get workflow info before deletion
    const workflow = await findWorkflow(workflowName);
    if (!workflow) return 0;

    // Delete database files
    if (fs.existsSync(workflow.dbPath)) {
      fs.unlinkSync(workflow.dbPath);
    }
    
    // Delete workflow directory
    if (fs.existsSync(workflow.workflowDir)) {
      fs.rmSync(workflow.workflowDir, { recursive: true, force: true });
    }

    // Remove from registry
    const deletedCount = await workflowRegistry.delete()
      .where(w => w.name === workflowName)
      .execute();

    logger.info(`Deleted workflow: ${workflowName}`);
    return deletedCount;
  };

  export const close = (): void => {
    if (db) {
      db.close();
      db = null;
      logger.info('Workflow registry closed');
    }
  };
}

// Query implementation classes
class SelectQueryImpl<T> implements SelectQuery<T> {
  private conditions: Array<(item: T) => boolean> = [];
  private orderField?: keyof T;
  private orderDirection: 'asc' | 'desc' = 'asc';
  private limitCount?: number;
  private offsetCount?: number;

  constructor(
    private db: Database,
    private tableName: string,
    private schema: z.ZodSchema<T>
  ) {}

  where(condition: (fields: T) => boolean): SelectQuery<T> {
    this.conditions.push(condition);
    return this;
  }

  orderBy(field: keyof T, direction: 'asc' | 'desc' = 'asc'): SelectQuery<T> {
    this.orderField = field;
    this.orderDirection = direction;
    return this;
  }

  limit(count: number): SelectQuery<T> {
    this.limitCount = count;
    return this;
  }

  offset(count: number): SelectQuery<T> {
    this.offsetCount = count;
    return this;
  }

  async execute(): Promise<T[]> {
    let sql = `SELECT * FROM ${this.tableName}`;
    
    if (this.orderField) {
      sql += ` ORDER BY ${String(this.orderField)} ${this.orderDirection.toUpperCase()}`;
    }
    
    if (this.limitCount) {
      sql += ` LIMIT ${this.limitCount}`;
    }
    
    if (this.offsetCount) {
      sql += ` OFFSET ${this.offsetCount}`;
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all() as unknown[];
    
    return rows
      .map(row => this.parseRow(row))
      .filter(item => this.conditions.every(condition => condition(item)));
  }

  async first(): Promise<T | null> {
    const results = await this.limit(1).execute();
    return results[0] || null;
  }

  private parseRow(row: unknown): T {
    // Convert database row to typed object
    const parsed = this.schema.parse(this.transformDbRow(row));
    return parsed;
  }

  private transformDbRow(row: any): any {
    return {
      ...row,
      createdAt: new Date(row.created_at),
      lastExecutionAt: row.last_execution_at ? new Date(row.last_execution_at) : null,
      dbPath: row.db_path,
      workflowDir: row.workflow_dir,
      logDir: row.log_dir,
      executionCount: row.execution_count,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }
}

class InsertQueryImpl<T> implements InsertQuery<T> {
  private data?: Partial<T>;
  private conflictAction: 'ignore' | 'replace' | 'update' = 'ignore';

  constructor(
    private db: Database,
    private tableName: string,
    private schema: z.ZodSchema<T>
  ) {}

  values(data: Partial<T>): InsertQuery<T> {
    this.data = data;
    return this;
  }

  onConflict(action: 'ignore' | 'replace' | 'update'): InsertQuery<T> {
    this.conflictAction = action;
    return this;
  }

  returning(fields?: (keyof T)[]): InsertQuery<T> {
    // SQLite doesn't support RETURNING, so we'll fetch after insert
    return this;
  }

  async execute(): Promise<T> {
    if (!this.data) throw new Error('No data provided for insert');

    const dbRow = this.transformToDbRow(this.data);
    const columns = Object.keys(dbRow);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(dbRow);

    let sql = `INSERT`;
    if (this.conflictAction === 'ignore') {
      sql += ` OR IGNORE`;
    } else if (this.conflictAction === 'replace') {
      sql += ` OR REPLACE`;
    }
    sql += ` INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;

    const stmt = this.db.prepare(sql);
    stmt.run(...values);

    // Return the inserted row
    const selectStmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE name = ?`);
    const row = selectStmt.get(this.data.name) as unknown;
    
    return this.schema.parse(this.transformFromDbRow(row));
  }

  private transformToDbRow(data: Partial<T>): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(data)) {
      switch (key) {
        case 'createdAt':
        case 'lastExecutionAt':
          result[this.camelToSnake(key)] = value instanceof Date ? value.toISOString() : value;
          break;
        case 'dbPath':
          result['db_path'] = value;
          break;
        case 'workflowDir':
          result['workflow_dir'] = value;
          break;
        case 'logDir':
          result['log_dir'] = value;
          break;
        case 'executionCount':
          result['execution_count'] = value;
          break;
        case 'tags':
        case 'metadata':
          result[key] = value ? JSON.stringify(value) : null;
          break;
        default:
          result[key] = value;
      }
    }
    
    return result;
  }

  private transformFromDbRow(row: any): any {
    return {
      ...row,
      createdAt: new Date(row.created_at),
      lastExecutionAt: row.last_execution_at ? new Date(row.last_execution_at) : null,
      dbPath: row.db_path,
      workflowDir: row.workflow_dir,
      logDir: row.log_dir,
      executionCount: row.execution_count,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

class UpdateQueryImpl<T> implements UpdateQuery<T> {
  private data?: Partial<T>;
  private conditions: Array<(item: T) => boolean> = [];

  constructor(
    private db: Database,
    private tableName: string,
    private schema: z.ZodSchema<T>
  ) {}

  set(data: Partial<T>): UpdateQuery<T> {
    this.data = data;
    return this;
  }

  where(condition: (fields: T) => boolean): UpdateQuery<T> {
    this.conditions.push(condition);
    return this;
  }

  returning(fields?: (keyof T)[]): UpdateQuery<T> {
    return this;
  }

  async execute(): Promise<T[]> {
    if (!this.data) throw new Error('No data provided for update');

    // For simplicity, we'll use a basic WHERE clause
    // In a real implementation, you'd parse the condition function
    const dbRow = this.transformToDbRow(this.data);
    const setPairs = Object.entries(dbRow).map(([key, _]) => `${key} = ?`).join(', ');
    const values = Object.values(dbRow);

    const sql = `UPDATE ${this.tableName} SET ${setPairs} WHERE name = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values, this.data.name);

    // Return updated rows
    const selectStmt = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE name = ?`);
    const rows = selectStmt.all(this.data.name) as unknown[];
    
    return rows.map(row => this.schema.parse(this.transformFromDbRow(row)));
  }

  private transformToDbRow(data: Partial<T>): Record<string, any> {
    // Same as InsertQueryImpl
    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(data)) {
      switch (key) {
        case 'createdAt':
        case 'lastExecutionAt':
          result[this.camelToSnake(key)] = value instanceof Date ? value.toISOString() : value;
          break;
        case 'dbPath':
          result['db_path'] = value;
          break;
        case 'workflowDir':
          result['workflow_dir'] = value;
          break;
        case 'logDir':
          result['log_dir'] = value;
          break;
        case 'executionCount':
          result['execution_count'] = value;
          break;
        case 'tags':
        case 'metadata':
          result[key] = value ? JSON.stringify(value) : null;
          break;
        default:
          result[key] = value;
      }
    }
    
    return result;
  }

  private transformFromDbRow(row: any): any {
    return {
      ...row,
      createdAt: new Date(row.created_at),
      lastExecutionAt: row.last_execution_at ? new Date(row.last_execution_at) : null,
      dbPath: row.db_path,
      workflowDir: row.workflow_dir,
      logDir: row.log_dir,
      executionCount: row.execution_count,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

class DeleteQueryImpl<T> implements DeleteQuery<T> {
  private conditions: Array<(item: T) => boolean> = [];

  constructor(
    private db: Database,
    private tableName: string
  ) {}

  where(condition: (fields: T) => boolean): DeleteQuery<T> {
    this.conditions.push(condition);
    return this;
  }

  async execute(): Promise<number> {
    // For simplicity, using basic WHERE clause
    // In real implementation, you'd parse the condition function
    const sql = `DELETE FROM ${this.tableName} WHERE name = ?`;
    const stmt = this.db.prepare(sql);
    const result = stmt.run(/* name would be extracted from condition */);
    
    return result.changes;
  }
}
```

**Usage Examples of Drizzle-like WorkflowRegistry**
```typescript
// Initialize the registry
WorkflowRegistryORM.initialize({
  baseDir: './.workflow',
  autoCleanup: true,
  maxExecutionHistory: 1000
});

// Register a new workflow with metadata
const workflow = await WorkflowRegistryORM.registerWorkflow({
  name: 'data-processing',
  version: '1.2.0',
  description: 'Process data from external APIs',
  tags: ['data', 'api', 'processing'],
  metadata: {
    author: 'team@company.com',
    environment: 'production',
    priority: 'high'
  }
});

// Query workflows with Drizzle-like syntax
const activeWorkflows = await WorkflowRegistryORM.workflowRegistry
  .select()
  .where(w => w.status === 'active')
  .orderBy('lastExecutionAt', 'desc')
  .limit(10)
  .execute();

// Find specific workflow
const workflow = await WorkflowRegistryORM.workflowRegistry
  .select()
  .where(w => w.name === 'data-processing')
  .first();

// Update workflow metadata
await WorkflowRegistryORM.workflowRegistry
  .update()
  .set({ 
    description: 'Updated description',
    metadata: { ...workflow.metadata, lastUpdated: new Date() }
  })
  .where(w => w.name === 'data-processing')
  .execute();

// Archive old workflows
await WorkflowRegistryORM.workflowRegistry
  .update()
  .set({ status: 'archived' })
  .where(w => w.lastExecutionAt < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
  .execute();

// Complex queries with filtering
const recentWorkflows = await WorkflowRegistryORM.workflowRegistry
  .select()
  .where(w => w.status === 'active' && w.executionCount > 0)
  .orderBy('lastExecutionAt', 'desc')
  .limit(20)
  .execute();

// High-level API usage
const workflows = await WorkflowRegistryORM.listWorkflows({
  status: 'active',
  tags: ['production'],
  limit: 50
});

// Update execution stats
await WorkflowRegistryORM.updateExecutionStats('data-processing');

// Archive workflow
await WorkflowRegistryORM.archiveWorkflow('old-workflow');

// Delete workflow completely
await WorkflowRegistryORM.deleteWorkflow('deprecated-workflow');
```

**Per-Workflow Database Management**
```typescript
// packages/database/src/workflow-db.ts
import { Database } from "bun:sqlite";
import { WorkflowRegistryORM } from "./registry";
import { Schema } from "./schema";
import { Logger } from '@workflow/utils';
import type { Result, ExecutionResult, StepResult } from '@workflow/types';

const logger = Logger.create('workflow-db');

export namespace WorkflowDatabase {
  const connections = new Map<string, Database>();

  export const getConnection = async (workflowName: string): Promise<Result<Database>> => {
    try {
      // Check if connection already exists
      if (connections.has(workflowName)) {
        return { success: true, data: connections.get(workflowName)! };
      }

      // Get workflow from registry
      const workflow = await WorkflowRegistryORM.findWorkflow(workflowName);
      
      if (!workflow) {
        // Register new workflow
        const newWorkflow = await WorkflowRegistryORM.registerWorkflow({
          name: workflowName
        });
        
        // Create database connection
        const db = new Database(newWorkflow.dbPath);
        
        // Enable foreign keys and WAL mode for better performance
        db.exec("PRAGMA foreign_keys = ON");
        db.exec("PRAGMA journal_mode = WAL");
        db.exec("PRAGMA synchronous = NORMAL");
        
        // Create tables
        Schema.createWorkflowTables(db);
        
        // Cache connection
        connections.set(workflowName, db);
        
        logger.info(`Connected to new workflow database: ${workflowName} -> ${newWorkflow.dbPath}`);
        return { success: true, data: db };
      }

      // Create database connection for existing workflow
      const db = new Database(workflow.dbPath);
      
      // Enable foreign keys and WAL mode for better performance
      db.exec("PRAGMA foreign_keys = ON");
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA synchronous = NORMAL");
      
      // Create tables if they don't exist
      Schema.createWorkflowTables(db);
      
      // Cache connection
      connections.set(workflowName, db);
      
      logger.info(`Connected to workflow database: ${workflowName} -> ${workflow.dbPath}`);
      return { success: true, data: db };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  export const closeConnection = (workflowName: string): void => {
    const db = connections.get(workflowName);
    if (db) {
      db.close();
      connections.delete(workflowName);
      logger.info(`Closed workflow database connection: ${workflowName}`);
    }
  };

  export const closeAllConnections = (): void => {
    for (const [workflowName, db] of connections) {
      db.close();
      logger.info(`Closed workflow database connection: ${workflowName}`);
    }
    connections.clear();
  };

  // Execution management
  export const saveExecution = async (
    workflowName: string, 
    execution: ExecutionResult
  ): Promise<Result<void>> => {
    const dbResult = await getConnection(workflowName);
    if (!dbResult.success) {
      return dbResult as Result<void>;
    }

    try {
      const db = dbResult.data;
      
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO executions (
          id, status, started_at, completed_at, restart_attempt, error_message, input_data
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        execution.executionId,
        execution.status,
        execution.startedAt.toISOString(),
        execution.completedAt?.toISOString() || null,
        execution.restartAttempt,
        execution.error?.message || null,
        JSON.stringify(execution.input || {})
      );

      // Save steps
      for (const [stepId, step] of Object.entries(execution.steps)) {
        await saveStep(db, execution.executionId, stepId, step);
      }

      // Update registry stats
      await WorkflowRegistryORM.updateExecutionStats(workflowName);
      
      return { success: true, data: undefined };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  export const loadExecution = async (
    workflowName: string, 
    executionId: string
  ): Promise<Result<ExecutionResult | null>> => {
    const dbResult = await getConnection(workflowName);
    if (!dbResult.success) {
      return dbResult as Result<ExecutionResult | null>;
    }

    try {
      const db = dbResult.data;
      
      // Load execution
      const execStmt = db.prepare('SELECT * FROM executions WHERE id = ?');
      const execRow = execStmt.get(executionId) as {
        id: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        restart_attempt: number;
        error_message: string | null;
        input_data: string | null;
      } | undefined;
      
      if (!execRow) {
        return { success: true, data: null };
      }

      // Load steps
      const stepsStmt = db.prepare('SELECT * FROM steps WHERE execution_id = ?');
      const stepRows = stepsStmt.all(executionId) as Array<{
        execution_id: string;
        step_id: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        result_data: string | null;
        error_message: string | null;
        attempt: number;
      }>;
      
      const steps: Record<string, StepResult> = {};
      for (const stepRow of stepRows) {
        steps[stepRow.step_id] = {
          stepId: stepRow.step_id,
          status: stepRow.status,
          result: stepRow.result_data ? JSON.parse(stepRow.result_data) : undefined,
          error: stepRow.error_message ? new Error(stepRow.error_message) : undefined,
          startedAt: new Date(stepRow.started_at),
          completedAt: stepRow.completed_at ? new Date(stepRow.completed_at) : undefined
        };
      }

      const execution: ExecutionResult = {
        executionId: execRow.id,
        status: execRow.status,
        startedAt: new Date(execRow.started_at),
        completedAt: execRow.completed_at ? new Date(execRow.completed_at) : undefined,
        error: execRow.error_message ? new Error(execRow.error_message) : undefined,
        steps,
        restartAttempt: execRow.restart_attempt
      };
      
      return { success: true, data: execution };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  export const listExecutions = async (
    workflowName: string,
    options: {
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Result<ExecutionResult[]>> => {
    const dbResult = await getConnection(workflowName);
    if (!dbResult.success) {
      return dbResult as Result<ExecutionResult[]>;
    }

    try {
      const db = dbResult.data;
      
      let query = 'SELECT * FROM executions';
      const params: unknown[] = [];
      
      if (options.status) {
        query += ' WHERE status = ?';
        params.push(options.status);
      }
      
      query += ' ORDER BY started_at DESC';
      
      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
        
        if (options.offset) {
          query += ' OFFSET ?';
          params.push(options.offset);
        }
      }

      const stmt = db.prepare(query);
      const rows = stmt.all(...params) as Array<{
        id: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        restart_attempt: number;
        error_message: string | null;
        input_data: string | null;
      }>;
      
      const executions: ExecutionResult[] = [];
      
      for (const row of rows) {
        const execution = await loadExecution(workflowName, row.id);
        if (execution.success && execution.data) {
          executions.push(execution.data);
        }
      }
      
      return { success: true, data: executions };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  const saveStep = async (
    db: Database,
    executionId: string,
    stepId: string,
    step: StepResult
  ): Promise<void> => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO steps (
        execution_id, step_id, status, started_at, completed_at, 
        result_data, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      executionId,
      stepId,
      step.status,
      step.startedAt.toISOString(),
      step.completedAt?.toISOString() || null,
      step.result ? JSON.stringify(step.result) : null,
      step.error?.message || null
    );
  };
}
```

**Updated Database Schema**
```typescript
// packages/database/src/schema.ts
import { Database } from "bun:sqlite";

export namespace Schema {
  export const createWorkflowTables = (db: Database): void => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        restart_attempt INTEGER DEFAULT 1,
        error_message TEXT,
        input_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS steps (
        execution_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        result_data TEXT,
        error_message TEXT,
        attempt INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (execution_id, step_id),
        FOREIGN KEY (execution_id) REFERENCES executions (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
      CREATE INDEX IF NOT EXISTS idx_executions_started_at ON executions(started_at);
      CREATE INDEX IF NOT EXISTS idx_steps_status ON steps(status);
      CREATE INDEX IF NOT EXISTS idx_steps_execution_id ON steps(execution_id);
      
      -- Trigger to update updated_at timestamp
      CREATE TRIGGER IF NOT EXISTS update_executions_timestamp 
        AFTER UPDATE ON executions
      BEGIN
        UPDATE executions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
      
      CREATE TRIGGER IF NOT EXISTS update_steps_timestamp 
        AFTER UPDATE ON steps
      BEGIN
        UPDATE steps SET updated_at = CURRENT_TIMESTAMP 
        WHERE execution_id = NEW.execution_id AND step_id = NEW.step_id;
      END;
    `);
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

**Co-located Unit Tests with Zod Validation**
```typescript
// packages/core/src/engine.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { z } from 'zod';
import { WorkflowEngine } from './engine';
import { PanicError, WorkflowError, ValidationError } from '@workflow/types';
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

  test('should execute workflow successfully with valid input', async () => {
    const definition = {
      name: 'test-workflow',
      handler: async (ctx) => {
        await ctx.step('step1', async () => 'result1');
      }
    };

    const context = {
      workflowName: 'test-workflow',
      executionId: crypto.randomUUID(),
      attempt: 1,
      restartAttempt: 1,
      step: async (id, handler) => handler(),
      sleep: async () => {}
    };

    const result = await WorkflowEngine.execute(definition, context);
    
    expect(result.status).toBe('completed');
    expect(result.executionId).toBe(context.executionId);
  });

  test('should validate execution ID format', async () => {
    await expect(WorkflowEngine.getStatus('invalid-uuid'))
      .rejects.toThrow(ValidationError);
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
      executionId: crypto.randomUUID(),
      attempt: 1,
      restartAttempt: 1,
      step: async (id, handler) => handler(),
      sleep: async () => {}
    };

    await expect(WorkflowEngine.execute(definition, context))
      .rejects.toThrow(PanicError);
  });
});
```

**Context Unit Tests with Schema Validation**
```typescript
// packages/core/src/context.test.ts
import { describe, test, expect, beforeEach } from 'bun:test';
import { z } from 'zod';
import { createContext } from './context';
import { PanicError, WorkflowError, ValidationError } from '@workflow/types';

describe('WorkflowContext', () => {
  test('should validate context creation parameters', () => {
    expect(() => createContext('', crypto.randomUUID(), {}))
      .toThrow(ValidationError);
    
    expect(() => createContext('valid-name', 'invalid-uuid', {}))
      .toThrow(ValidationError);
  });

  test('should validate retry configuration', () => {
    const validUuid = crypto.randomUUID();
    
    expect(() => createContext('test', validUuid, {}, { maxAttempts: 0 }))
      .toThrow(ValidationError);
    
    expect(() => createContext('test', validUuid, {}, { maxAttempts: 15 }))
      .toThrow(ValidationError);
  });

  test('should validate step ID format', async () => {
    const context = createContext('test-workflow', crypto.randomUUID(), {});
    
    await expect(context.step('', async () => 'result'))
      .rejects.toThrow(ValidationError);
  });

  test('should validate sleep parameters', async () => {
    const context = createContext('test-workflow', crypto.randomUUID(), {});
    
    await expect(context.sleep('', 1000))
      .rejects.toThrow(ValidationError);
    
    await expect(context.sleep('valid-step', -1))
      .rejects.toThrow(ValidationError);
    
    await expect(context.sleep('valid-step', 400000))
      .rejects.toThrow(ValidationError);
  });

  test('should validate step result serializability', async () => {
    const context = createContext('test-workflow', crypto.randomUUID(), {});
    
    // Circular reference should fail validation
    const circularObj: Record<string, unknown> = { name: 'test' };
    circularObj.self = circularObj;
    
    await expect(context.step('circular-step', async () => circularObj))
      .rejects.toThrow(ValidationError);
  });

  test('should execute step successfully with valid data', async () => {
    const context = createContext('test-workflow', crypto.randomUUID(), {});
    
    const result = await context.step('test-step', async () => {
      return { data: 'step-result', timestamp: new Date() };
    });
    
    expect(result.data).toBe('step-result');
    expect(result.timestamp).toBeInstanceOf(Date);
  });
});
```

**Workflow Definition Tests with Zod**
```typescript
// packages/core/src/workflow.test.ts
import { describe, test, expect } from 'bun:test';
import { z } from 'zod';
import { Workflow } from './workflow';
import { ValidationError } from '@workflow/types';

describe('Workflow', () => {
  test('should validate workflow definition', () => {
    expect(() => Workflow.define('', async () => {}))
      .toThrow(ValidationError);
    
    expect(() => Workflow.define('valid-name', null as unknown as (ctx: WorkflowContext) => Promise<void>))
      .toThrow(ValidationError);
  });

  test('should validate start parameters', async () => {
    Workflow.define('test-workflow', async (ctx) => {
      await ctx.step('step1', async () => 'result');
    });

    await expect(Workflow.start('', crypto.randomUUID()))
      .rejects.toThrow(ValidationError);
    
    await expect(Workflow.start('test-workflow', 'invalid-uuid'))
      .rejects.toThrow(ValidationError);
  });

  test('should validate retry configuration in start', async () => {
    Workflow.define('retry-test', async (ctx) => {
      await ctx.step('step1', async () => 'result');
    });

    await expect(Workflow.start('retry-test', crypto.randomUUID(), {}, { maxAttempts: 0 }))
      .rejects.toThrow(ValidationError);
  });

  test('should start workflow with valid parameters', async () => {
    Workflow.define('valid-workflow', async (ctx) => {
      await ctx.step('step1', async () => 'result');
    });

    const result = await Workflow.start('valid-workflow', crypto.randomUUID(), { test: 'data' });
    expect(result.status).toBe('completed');
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

### Complex Business Workflow with Validation
```typescript
import { z } from 'zod';

// Define input schema for type safety
const OrderInputSchema = z.object({
  orderId: z.string().uuid('Invalid order ID format'),
  customerId: z.string().uuid('Invalid customer ID format'),
  items: z.array(z.object({
    id: z.string(),
    name: z.string().min(1),
    quantity: z.number().int().positive(),
    price: z.number().positive()
  })).min(1, 'Order must contain at least one item'),
  totalAmount: z.number().positive()
});

type OrderInput = z.infer<typeof OrderInputSchema>;

Workflow.define("order-processing", async (ctx) => {
    // Validate and parse input with Zod
    const order = await ctx.step("validate-order", async () => {
        const validation = OrderInputSchema.safeParse(ctx.input);
        if (!validation.success) {
            throw new ValidationError(
                "Invalid order data",
                validation.error
            );
        }
        return validation.data;
    });
    
    // Check inventory with validated data
    const inventory = await ctx.step("check-inventory", async () => {
        // Simulate inventory check that might fail
        if (ctx.attempt < 2) {
            throw new Error("Inventory service unavailable");
        }
        
        // Validate inventory response
        const inventorySchema = z.object({
            available: z.boolean(),
            reservedItems: z.array(z.string())
        });
        
        const mockInventory = { available: true, reservedItems: order.items.map(i => i.id) };
        return inventorySchema.parse(mockInventory);
    });
    
    // Wait for payment processing
    await ctx.sleep("payment-delay", 2000);
    
    // Process payment with validation
    const payment = await ctx.step("process-payment", async () => {
        const paymentSchema = z.object({
            paymentId: z.string().uuid(),
            status: z.enum(['pending', 'completed', 'failed']),
            amount: z.number().positive()
        });
        
        const mockPayment = {
            paymentId: crypto.randomUUID(),
            status: 'completed' as const,
            amount: order.totalAmount
        };
        
        return paymentSchema.parse(mockPayment);
    });
    
    // Ship order with validated tracking
    await ctx.step("ship-order", async () => {
        const shippingSchema = z.object({
            trackingId: z.string().min(1),
            carrier: z.string().min(1),
            estimatedDelivery: z.date()
        });
        
        console.log(`Shipping order ${order.orderId}`);
        
        const mockShipping = {
            trackingId: `TRACK-${Date.now()}`,
            carrier: "FastShip",
            estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        };
        
        return shippingSchema.parse(mockShipping);
    });
});

// Start the workflow with validated input
const orderInput: OrderInput = {
    orderId: crypto.randomUUID(),
    customerId: crypto.randomUUID(),
    items: [
        { id: "item-1", name: "Product A", quantity: 2, price: 29.99 }
    ],
    totalAmount: 59.98
};

await Workflow.start("order-processing", crypto.randomUUID(), orderInput);
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
9. **Use Zod schemas** for input validation and type safety
10. **Validate step results** to ensure they're serializable
11. **Test error scenarios** thoroughly with unit and integration tests
11. **Monitor execution status** in production environments
12. **Implement circuit breakers** for external service calls
13. **Log step failures** with sufficient context for debugging
14. **Use exponential backoff** for transient failures
15. **Design for resumability** - workflows should handle interruptions gracefully

## Error Handling Strategies

### 1. Input Validation with Zod
```typescript
import { z } from 'zod';

const UserDataSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  preferences: z.object({
    notifications: z.boolean(),
    theme: z.enum(['light', 'dark'])
  })
});

Workflow.define("user-onboarding", async (ctx) => {
    // Validate input at workflow start
    const userData = await ctx.step("validate-input", async () => {
        const validation = UserDataSchema.safeParse(ctx.input);
        if (!validation.success) {
            throw new ValidationError(
                "Invalid user data provided",
                validation.error
            );
        }
        return validation.data;
    });
    
    await ctx.step("create-profile", async () => {
        // userData is now fully typed and validated
        console.log(`Creating profile for ${userData.email}`);
        return { profileId: crypto.randomUUID() };
    });
});
```
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

### 2. Transient vs Permanent Errors
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

## Usage Examples

### CLI Usage Examples

**List all workflows**
```bash
# List workflows in table format
workflow list

# List workflows in JSON format
workflow list --format json

# List only active workflows
workflow list --status active
```

**Create a new workflow**
```bash
# Create a simple workflow
workflow create my-workflow --description "My first workflow"

# Create workflow from file
workflow create data-pipeline --file ./workflows/data-pipeline.json

# Validate workflow definition without creating
workflow create test-workflow --file ./test.json --dry-run
```

**Start workflow execution**
```bash
# Start workflow with default settings
workflow start my-workflow

# Start with custom input data
workflow start data-pipeline --input '{"source": "database", "target": "s3"}'

# Start with input from file
workflow start data-pipeline --input-file ./input.json

# Start with custom retry settings
workflow start my-workflow --max-retries 5 --retry-delay 2000
```

**Check execution status**
```bash
# Show overview of all workflows
workflow status

# Show executions for specific workflow
workflow status --workflow my-workflow

# Show specific execution details
workflow status abc123def-456-789

# Follow execution progress in real-time
workflow status abc123def-456-789 --follow
```

**Cleanup old executions**
```bash
# Show what would be cleaned up (dry run)
workflow cleanup --older-than 7 --dry-run

# Remove executions older than 30 days
workflow cleanup --older-than 30

# Remove only failed executions
workflow cleanup --status failed --older-than 7
```

### Workflow Definition Examples

> **Note:** This library is currently in development (see [PROGRESS.md](./PROGRESS.md)). The examples below show the planned API design and will be available once implementation is complete.

The workflow library uses a **programmatic TypeScript API** rather than JSON configuration files. Workflows are defined using the fluent API and executed directly in code.

**Simple Workflow Example**
```typescript
import { Workflow } from '@workflow/core';

// Define a simple workflow
Workflow.define("simple-log", async (ctx) => {
    await ctx.step("welcome", async () => {
        console.log("Welcome to the workflow!");
        return { message: "Welcome logged" };
    });
    
    await ctx.sleep("wait", 2000);
    
    await ctx.step("goodbye", async () => {
        console.log("Workflow completed successfully!");
        return { message: "Goodbye logged" };
    });
});

// Start execution with retry configuration
await Workflow.start("simple-log", crypto.randomUUID(), {}, {
    maxAttempts: 3,
    backoffMs: 1000,
    exponentialBackoff: true
});
```

**API Integration Workflow Example**
```typescript
import { Workflow } from '@workflow/core';

Workflow.define("api-workflow", async (ctx) => {
    const users = await ctx.step("fetch-users", async () => {
        const response = await fetch("https://jsonplaceholder.typicode.com/users");
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        return await response.json();
    });
    
    await ctx.sleep("process-delay", 1000);
    
    const posts = await ctx.step("fetch-posts", async () => {
        const response = await fetch("https://jsonplaceholder.typicode.com/posts");
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        return await response.json();
    });
    
    await ctx.step("completion-log", async () => {
        console.log(`Fetched ${users.length} users and ${posts.length} posts`);
        return { users: users.length, posts: posts.length };
    });
});

// Start with retry and panic recovery configuration
await Workflow.start("api-workflow", crypto.randomUUID(), {}, {
    maxAttempts: 5,
    backoffMs: 2000,
    exponentialBackoff: true
}, {
    maxRestartAttempts: 2,
    restartDelayMs: 10000,
    enableAutoRestart: true
});
```

### Advanced Usage Examples

> **Implementation Status:** These examples represent the planned API design. See [PROGRESS.md](./PROGRESS.md) for current implementation status.

**Workflow with Error Handling**
```typescript
import { Workflow } from '@workflow/core';

Workflow.define("resilient-api-call", async (ctx) => {
    // Step with automatic retry on failure
    const apiData = await ctx.step("api-call", async () => {
        const response = await fetch("https://api.example.com/data");
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        return await response.json();
    });
    
    await ctx.step("validate-data", async () => {
        if (!apiData || !apiData.id) {
            throw new Error("Invalid data received from API");
        }
        return { validated: true };
    });
    
    await ctx.step("save-data", async () => {
        console.log("Saving data:", apiData.id);
        return { saved: true };
    });
});

// Start with custom retry configuration
await Workflow.start("resilient-api-call", crypto.randomUUID(), {}, {
    maxAttempts: 5,
    backoffMs: 2000,
    exponentialBackoff: true
}, {
    maxRestartAttempts: 3,
    restartDelayMs: 10000,
    enableAutoRestart: true
});
```

**Workflow State Management**
```typescript
import { Workflow } from '@workflow/core';

// Check workflow execution status
const status = await Workflow.getStatus("execution-id-123");
console.log(`Status: ${status.status}`);
console.log(`Steps completed: ${Object.keys(status.steps).length}`);

// Resume a sleeping workflow
if (status.status === 'sleeping') {
    await Workflow.resume("execution-id-123");
}

// Restart a failed workflow
if (status.status === 'failed') {
    await Workflow.restart("execution-id-123");
}
```

### Planned Database Structure

> **Implementation Status:** Database schema design is planned but not yet implemented. See [PROGRESS.md](./PROGRESS.md) Phase 3 for database implementation status.

The library will use SQLite for state persistence with a per-workflow database approach:

**Planned Directory Structure:**
```
~/.workflows/
├── registry.db              # Central registry (planned)
├── data-processing.db        # Per-workflow database (planned)
├── api-workflow.db          # Per-workflow database (planned)
└── simple-log.db            # Per-workflow database (planned)
```

**Planned Registry Schema:**
```sql
-- registry.db (not yet implemented)
CREATE TABLE workflow_registry (
    name TEXT PRIMARY KEY,
    db_path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_execution_at DATETIME,
    execution_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
);
```

**Planned Per-Workflow Schema:**
```sql
-- {workflow-name}.db (not yet implemented)
CREATE TABLE executions (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    restart_attempt INTEGER DEFAULT 1,
    error_message TEXT,
    input_data TEXT
);

CREATE TABLE steps (
    execution_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    result_data TEXT,
    error_message TEXT,
    attempt INTEGER DEFAULT 1,
    PRIMARY KEY (execution_id, step_id),
    FOREIGN KEY (execution_id) REFERENCES executions (id) ON DELETE CASCADE
);
```

### Development Commands

> **Current Status:** Library is in early development. See [PROGRESS.md](./PROGRESS.md) for implementation roadmap.

**Planned Development Commands:**
```bash
# Setup (when implemented)
bun install          # Install dependencies
bun run build        # Build the library
bun run test         # Run tests
bun run typecheck    # Type checking

# Publishing (future)
bun run build        # Build for production
npm publish          # Publish to npm registry

# Usage in projects (when available)
bun add @workflow/core zod
bun add @workflow/core zod
```

**Current Project Status:**
- 📋 **Planning Phase**: API design and documentation complete
- 🚧 **Implementation**: Not yet started (0% complete)
- 📖 **Next Steps**: See [PROGRESS.md](./PROGRESS.md) for detailed roadmap

This guide provides the foundation for building a workflow library with a fluent API that will be easily integrated into TypeScript projects once implementation is complete.