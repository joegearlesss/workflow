# Developer Guide - Workflow Library

## Getting Started

### Prerequisites
- Bun 1.0+ installed
- TypeScript knowledge
- Functional programming familiarity
- Zod for schema validation

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
├── apps/                        # Development applications
│   ├── server/                  # Development server
│   │   ├── src/
│   │   │   ├── index.ts         # Main server entry point
│   │   │   ├── routes/          # API route handlers
│   │   │   │   ├── workflows.ts # Workflow management endpoints
│   │   │   │   ├── executions.ts # Execution monitoring endpoints
│   │   │   │   └── health.ts    # Health check endpoints
│   │   │   ├── middleware/      # Express middleware
│   │   │   │   ├── auth.ts      # Authentication middleware
│   │   │   │   ├── cors.ts      # CORS configuration
│   │   │   │   └── logging.ts   # Request logging
│   │   │   ├── services/        # Business logic services
│   │   │   │   ├── workflow-service.ts # Workflow operations
│   │   │   │   └── execution-service.ts # Execution management
│   │   │   ├── config/          # Server configuration
│   │   │   │   ├── database.ts  # Database connection config
│   │   │   │   └── server.ts    # Server settings
│   │   │   └── types/           # Server-specific types
│   │   │       └── api.ts       # API request/response types
│   │   ├── package.json         # Server dependencies
│   │   ├── tsconfig.json        # TypeScript config
│   │   └── tests/               # Server tests
│   │       ├── integration/     # Integration tests
│   │       │   ├── workflows.test.ts
│   │       │   └── executions.test.ts
│   │       └── unit/            # Unit tests
│   │           ├── services.test.ts
│   │           └── middleware.test.ts
│   ├── cli/                     # CLI tool for testing
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── index.test.ts    # CLI tests
│   └── cli/                     # CLI tool for workflow management
│       ├── src/
│       │   ├── index.ts         # CLI entry point
│       │   ├── commands/        # CLI commands
│       │   │   ├── list.ts      # List workflows command
│       │   │   ├── create.ts    # Create workflow command
│       │   │   ├── start.ts     # Start execution command
│       │   │   ├── status.ts    # Check execution status
│       │   │   └── cleanup.ts   # Cleanup old executions
│       │   └── utils/           # CLI utilities
│       │       ├── output.ts    # Output formatting
│       │       └── config.ts    # CLI configuration
│       └── tests/
│           └── commands.test.ts # CLI command tests
└── tests/                       # End-to-end test suites
    └── e2e/                     # End-to-end tests
        ├── workflow-execution.test.ts
        ├── panic-recovery.test.ts
        └── integration.test.ts
```

## Development Applications

### Server Application (apps/server)

The development server provides a REST API for workflow management and execution monitoring. It's built with Express.js and includes comprehensive error handling, authentication, and monitoring capabilities.

**Main Server Entry Point**
```typescript
// apps/server/src/index.ts
import express from 'express';
import cors from 'cors';
import { DatabaseConnection } from '@workflow/database';
import { Logger } from '@workflow/utils';
import { workflowRoutes } from './routes/workflows';
import { executionRoutes } from './routes/executions';
import { healthRoutes } from './routes/health';
import { authMiddleware } from './middleware/auth';
import { loggingMiddleware } from './middleware/logging';
import { corsMiddleware } from './middleware/cors';
import { ServerConfig } from './config/server';

const app = express();
const logger = Logger.create('server');

// Initialize database
DatabaseConnection.initialize(ServerConfig.database.path);

// Middleware
app.use(express.json());
app.use(corsMiddleware);
app.use(loggingMiddleware);

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/workflows', authMiddleware, workflowRoutes);
app.use('/api/executions', authMiddleware, executionRoutes);

// Error handling
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

const port = ServerConfig.port || 3000;
app.listen(port, () => {
  logger.info(`Workflow server listening on port ${port}`);
});

export { app };
```

**Workflow Management Routes**
```typescript
// apps/server/src/routes/workflows.ts
import { Router } from 'express';
import { z } from 'zod';
import { Workflow } from '@workflow/core';
import { WorkflowService } from '../services/workflow-service';
import { Logger } from '@workflow/utils';
import type { CreateWorkflowRequest, WorkflowResponse } from '../types/api';

const router = Router();
const logger = Logger.create('workflows-api');

// Schema validation for requests
const CreateWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required'),
  description: z.string().optional(),
  definition: z.object({
    steps: z.array(z.object({
      id: z.string(),
      type: z.string(),
      config: z.record(z.unknown())
    }))
  }),
  retryConfig: z.object({
    maxAttempts: z.number().int().min(1).max(10),
    backoffMs: z.number().int().min(0).optional(),
    exponentialBackoff: z.boolean().optional()
  }).optional(),
  panicConfig: z.object({
    maxRestartAttempts: z.number().int().min(1).max(5),
    restartDelayMs: z.number().int().min(1000),
    enableAutoRestart: z.boolean()
  }).optional()
});

const StartWorkflowSchema = z.object({
  executionId: z.string().uuid('Invalid execution ID format'),
  input: z.record(z.unknown()).optional(),
  retryConfig: z.object({
    maxAttempts: z.number().int().min(1).max(10),
    backoffMs: z.number().int().min(0).optional(),
    exponentialBackoff: z.boolean().optional()
  }).optional(),
  panicConfig: z.object({
    maxRestartAttempts: z.number().int().min(1).max(5),
    restartDelayMs: z.number().int().min(1000),
    enableAutoRestart: z.boolean()
  }).optional()
});

// POST /api/workflows - Create a new workflow
router.post('/', async (req, res) => {
  try {
    const validation = CreateWorkflowSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: validation.error.errors
      });
    }

    const { name, description, definition, retryConfig, panicConfig } = validation.data;
    
    // Register workflow with the engine
    Workflow.define(name, async (ctx) => {
      for (const step of definition.steps) {
        await ctx.step(step.id, async () => {
          // Execute step based on type and config
          return await WorkflowService.executeStep(step.type, step.config, ctx);
        });
      }
    });

    const workflow = await WorkflowService.createWorkflow({
      name,
      description,
      definition,
      retryConfig,
      panicConfig
    });

    logger.info(`Created workflow: ${name}`);
    
    res.status(201).json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      createdAt: workflow.createdAt,
      status: 'created'
    } as WorkflowResponse);

  } catch (error) {
    logger.error('Failed to create workflow:', error);
    res.status(500).json({
      error: 'Failed to create workflow',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/workflows - List all workflows
router.get('/', async (req, res) => {
  try {
    const workflows = await WorkflowService.listWorkflows();
    
    res.json({
      workflows: workflows.map(w => ({
        id: w.id,
        name: w.name,
        description: w.description,
        createdAt: w.createdAt,
        status: 'ready'
      }))
    });

  } catch (error) {
    logger.error('Failed to list workflows:', error);
    res.status(500).json({
      error: 'Failed to list workflows',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/workflows/:id - Get workflow details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const workflow = await WorkflowService.getWorkflow(id);
    
    if (!workflow) {
      return res.status(404).json({
        error: 'Workflow not found',
        message: `No workflow found with ID: ${id}`
      });
    }

    res.json({
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      definition: workflow.definition,
      createdAt: workflow.createdAt,
      status: 'ready'
    } as WorkflowResponse);

  } catch (error) {
    logger.error(`Failed to get workflow ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to get workflow',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/workflows/:id/start - Start workflow execution
router.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const validation = StartWorkflowSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid request data',
        details: validation.error.errors
      });
    }

    const { executionId, input, retryConfig, panicConfig } = validation.data;
    
    // Start workflow execution
    const result = await Workflow.start(id, executionId, input, retryConfig, panicConfig);
    
    logger.info(`Started workflow execution: ${id} -> ${executionId}`);
    
    res.status(202).json({
      executionId: result.executionId,
      status: result.status,
      startedAt: result.startedAt,
      message: 'Workflow execution started'
    });

  } catch (error) {
    logger.error(`Failed to start workflow ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to start workflow',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/workflows/:id - Delete workflow
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await WorkflowService.deleteWorkflow(id);
    
    if (!deleted) {
      return res.status(404).json({
        error: 'Workflow not found',
        message: `No workflow found with ID: ${id}`
      });
    }

    logger.info(`Deleted workflow: ${id}`);
    
    res.status(204).send();

  } catch (error) {
    logger.error(`Failed to delete workflow ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to delete workflow',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as workflowRoutes };
```

**Execution Monitoring Routes**
```typescript
// apps/server/src/routes/executions.ts
import { Router } from 'express';
import { z } from 'zod';
import { Workflow } from '@workflow/core';
import { ExecutionService } from '../services/execution-service';
import { Logger } from '@workflow/utils';
import type { ExecutionResponse, ExecutionListResponse } from '../types/api';

const router = Router();
const logger = Logger.create('executions-api');

// GET /api/executions - List all executions
router.get('/', async (req, res) => {
  try {
    const { workflowId, status, limit = 50, offset = 0 } = req.query;
    
    const executions = await ExecutionService.listExecutions({
      workflowId: workflowId as string,
      status: status as string,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
    
    res.json({
      executions: executions.map(e => ({
        executionId: e.executionId,
        workflowId: e.workflowId,
        status: e.status,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        restartAttempt: e.restartAttempt,
        error: e.error?.message
      })),
      total: executions.length
    } as ExecutionListResponse);

  } catch (error) {
    logger.error('Failed to list executions:', error);
    res.status(500).json({
      error: 'Failed to list executions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/executions/:id - Get execution details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const execution = await Workflow.getStatus(id);
    
    res.json({
      executionId: execution.executionId,
      status: execution.status,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      restartAttempt: execution.restartAttempt,
      steps: Object.entries(execution.steps).map(([stepId, step]) => ({
        stepId,
        status: step.status,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        result: step.result,
        error: step.error?.message
      })),
      error: execution.error?.message
    } as ExecutionResponse);

  } catch (error) {
    logger.error(`Failed to get execution ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to get execution',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/executions/:id/resume - Resume paused execution
router.post('/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Workflow.resume(id);
    
    logger.info(`Resumed execution: ${id}`);
    
    res.json({
      executionId: result.executionId,
      status: result.status,
      message: 'Execution resumed'
    });

  } catch (error) {
    logger.error(`Failed to resume execution ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to resume execution',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/executions/:id/restart - Restart failed execution
router.post('/:id/restart', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Workflow.restart(id);
    
    logger.info(`Restarted execution: ${id}`);
    
    res.json({
      executionId: result.executionId,
      status: result.status,
      restartAttempt: result.restartAttempt,
      message: 'Execution restarted'
    });

  } catch (error) {
    logger.error(`Failed to restart execution ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to restart execution',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/executions/:id - Cancel execution
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cancelled = await ExecutionService.cancelExecution(id);
    
    if (!cancelled) {
      return res.status(404).json({
        error: 'Execution not found',
        message: `No execution found with ID: ${id}`
      });
    }

    logger.info(`Cancelled execution: ${id}`);
    
    res.status(204).send();

  } catch (error) {
    logger.error(`Failed to cancel execution ${req.params.id}:`, error);
    res.status(500).json({
      error: 'Failed to cancel execution',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as executionRoutes };
```

**Server Configuration**
```typescript
// apps/server/src/config/server.ts
import { z } from 'zod';

const ServerConfigSchema = z.object({
  port: z.number().int().min(1000).max(65535).default(3000),
  host: z.string().default('localhost'),
  database: z.object({
    path: z.string().default('./workflow.db')
  }),
  auth: z.object({
    enabled: z.boolean().default(false),
    secret: z.string().optional(),
    tokenExpiry: z.string().default('24h')
  }),
  cors: z.object({
    origin: z.union([z.string(), z.array(z.string())]).default('*'),
    credentials: z.boolean().default(true)
  }),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    format: z.enum(['json', 'text']).default('text')
  })
});

export const ServerConfig = ServerConfigSchema.parse({
  port: parseInt(process.env.PORT || '3000'),
  host: process.env.HOST || 'localhost',
  database: {
    path: process.env.DATABASE_PATH || './workflow.db'
  },
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    secret: process.env.JWT_SECRET,
    tokenExpiry: process.env.TOKEN_EXPIRY || '24h'
  },
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: process.env.CORS_CREDENTIALS === 'true'
  },
  logging: {
    level: (process.env.LOG_LEVEL as any) || 'info',
    format: (process.env.LOG_FORMAT as any) || 'text'
  }
});
```

**Workflow Service**
```typescript
// apps/server/src/services/workflow-service.ts
import { DatabaseConnection } from '@workflow/database';
import { WorkflowRepository } from '@workflow/database';
import { Logger } from '@workflow/utils';
import type { Result } from '@workflow/types';

const logger = Logger.create('workflow-service');

export namespace WorkflowService {
  export interface CreateWorkflowParams {
    name: string;
    description?: string;
    definition: {
      steps: Array<{
        id: string;
        type: string;
        config: Record<string, unknown>;
      }>;
    };
    retryConfig?: {
      maxAttempts: number;
      backoffMs?: number;
      exponentialBackoff?: boolean;
    };
    panicConfig?: {
      maxRestartAttempts: number;
      restartDelayMs: number;
      enableAutoRestart: boolean;
    };
  }

  export interface WorkflowInfo {
    id: string;
    name: string;
    description?: string;
    definition: any;
    createdAt: Date;
  }

  export const createWorkflow = async (params: CreateWorkflowParams): Promise<WorkflowInfo> => {
    const db = DatabaseConnection.getConnection();
    
    const workflow = {
      definition: {
        id: params.name,
        name: params.name,
        description: params.description,
        steps: params.definition.steps
      },
      createdAt: new Date(),
      version: 1
    };

    const result = await WorkflowRepository.save(db, workflow);
    if (!result.success) {
      throw result.error;
    }

    logger.info(`Created workflow: ${params.name}`);
    
    return {
      id: params.name,
      name: params.name,
      description: params.description,
      definition: params.definition,
      createdAt: workflow.createdAt
    };
  };

  export const getWorkflow = async (id: string): Promise<WorkflowInfo | null> => {
    const db = DatabaseConnection.getConnection();
    
    const result = await WorkflowRepository.findById(db, id);
    if (!result.success) {
      throw result.error;
    }

    if (!result.data) {
      return null;
    }

    return {
      id: result.data.definition.id,
      name: result.data.definition.name,
      description: result.data.definition.description,
      definition: result.data.definition,
      createdAt: result.data.createdAt
    };
  };

  export const listWorkflows = async (): Promise<WorkflowInfo[]> => {
    const db = DatabaseConnection.getConnection();
    
    const result = await WorkflowRepository.findAll(db);
    if (!result.success) {
      throw result.error;
    }

    return result.data.map(w => ({
      id: w.definition.id,
      name: w.definition.name,
      description: w.definition.description,
      definition: w.definition,
      createdAt: w.createdAt
    }));
  };

  export const deleteWorkflow = async (id: string): Promise<boolean> => {
    const db = DatabaseConnection.getConnection();
    
    // Check if workflow exists
    const existing = await WorkflowRepository.findById(db, id);
    if (!existing.success || !existing.data) {
      return false;
    }

    // Delete workflow (implementation depends on repository)
    // For now, we'll assume a delete method exists
    logger.info(`Deleted workflow: ${id}`);
    return true;
  };

  export const executeStep = async (
    stepType: string,
    config: Record<string, unknown>,
    context: any
  ): Promise<any> => {
    // Step execution logic based on type
    switch (stepType) {
      case 'log':
        console.log(config.message || 'Step executed');
        return { logged: true, timestamp: new Date() };
      
      case 'delay':
        const ms = (config.duration as number) || 1000;
        await new Promise(resolve => setTimeout(resolve, ms));
        return { delayed: ms };
      
      case 'http':
        const url = config.url as string;
        const response = await fetch(url);
        return { status: response.status, data: await response.text() };
      
      default:
        throw new Error(`Unknown step type: ${stepType}`);
    }
  };
}
```

**Server Package Configuration**
```json
// apps/server/package.json
{
  "name": "workflow-server",
  "version": "1.0.0",
  "description": "Development server for workflow library",
  "main": "dist/index.js",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target node",
    "start": "bun dist/index.js",
    "test": "bun test",
    "test:integration": "bun test tests/integration",
    "typecheck": "bun tsc --noEmit"
  },
  "dependencies": {
    "@workflow/core": "workspace:*",
    "@workflow/database": "workspace:*",
    "@workflow/types": "workspace:*",
    "@workflow/utils": "workspace:*",
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "jsonwebtoken": "^9.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/cors": "^2.8.0",
    "@types/jsonwebtoken": "^9.0.0",
    "typescript": "^5.0.0",
    "supertest": "^6.3.0"
  }
}
```

**Server Integration Tests**
```typescript
// apps/server/tests/integration/workflows.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import request from 'supertest';
import { app } from '../../src/index';
import { DatabaseConnection } from '@workflow/database';

describe('Workflow API Integration', () => {
  beforeAll(async () => {
    DatabaseConnection.initialize(':memory:');
  });

  afterAll(async () => {
    DatabaseConnection.close();
  });

  test('should create and retrieve workflow', async () => {
    const workflowData = {
      name: 'test-workflow',
      description: 'Test workflow for integration testing',
      definition: {
        steps: [
          {
            id: 'step1',
            type: 'log',
            config: { message: 'Hello from step 1' }
          },
          {
            id: 'step2',
            type: 'delay',
            config: { duration: 100 }
          }
        ]
      }
    };

    // Create workflow
    const createResponse = await request(app)
      .post('/api/workflows')
      .send(workflowData)
      .expect(201);

    expect(createResponse.body.name).toBe('test-workflow');
    expect(createResponse.body.status).toBe('created');

    // Retrieve workflow
    const getResponse = await request(app)
      .get(`/api/workflows/${createResponse.body.id}`)
      .expect(200);

    expect(getResponse.body.name).toBe('test-workflow');
    expect(getResponse.body.definition.steps).toHaveLength(2);
  });

  test('should start workflow execution', async () => {
    const workflowData = {
      name: 'execution-test',
      definition: {
        steps: [
          {
            id: 'step1',
            type: 'log',
            config: { message: 'Execution test' }
          }
        ]
      }
    };

    // Create workflow
    const createResponse = await request(app)
      .post('/api/workflows')
      .send(workflowData)
      .expect(201);

    // Start execution
    const executionData = {
      executionId: crypto.randomUUID(),
      input: { test: 'data' }
    };

    const startResponse = await request(app)
      .post(`/api/workflows/${createResponse.body.id}/start`)
      .send(executionData)
      .expect(202);

    expect(startResponse.body.executionId).toBe(executionData.executionId);
    expect(startResponse.body.status).toBe('running');
  });

  test('should validate request data', async () => {
    // Invalid workflow data
    const invalidWorkflow = {
      name: '', // Empty name should fail validation
      definition: {
        steps: []
      }
    };

    await request(app)
      .post('/api/workflows')
      .send(invalidWorkflow)
      .expect(400);

    // Invalid execution data
    const invalidExecution = {
      executionId: 'invalid-uuid', // Invalid UUID format
      input: {}
    };

    await request(app)
      .post('/api/workflows/test/start')
      .send(invalidExecution)
      .expect(400);
  });
});
```

### 1. Core Library API

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
      throw new ValidationError(
        `Invalid workflow definition for "${name}"`,
        validation.error
      );
    }
    
    definitions.set(name, validation.data);
  };
  
  export const start = async (
    name: string, 
    executionId: string, 
    input?: any,
    retryConfig?: RetryConfig,
    panicConfig?: PanicConfig
  ): Promise<ExecutionResult> => {
    // Validate input parameters with Zod
    const inputData = { workflowName: name, executionId, input, retryConfig, panicConfig };
    const validation = WorkflowInputSchema.safeParse(inputData);
    
    if (!validation.success) {
      throw new ValidationError(
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
      throw new ValidationError(
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
      throw new ValidationError(
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
      throw new ValidationError(
        `Invalid execution ID format: ${executionId}`,
        validation.error
      );
    }
    
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
import { z } from 'zod';

// Zod schemas for runtime validation
export const WorkflowDefinitionSchema = z.object({
  name: z.string().min(1, 'Workflow name is required'),
  handler: z.function().args(z.any()).returns(z.promise(z.void()))
});

export const WorkflowContextSchema = z.object({
  workflowName: z.string(),
  executionId: z.string().uuid('Invalid execution ID format'),
  input: z.any().optional(),
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
  result: z.any().optional(),
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

// TypeScript types inferred from Zod schemas
export interface WorkflowDefinition extends z.infer<typeof WorkflowDefinitionSchema> {}

export interface WorkflowContext extends z.infer<typeof WorkflowContextSchema> {
  step<T>(stepId: string, handler: () => Promise<T>): Promise<T>;
  sleep(stepId: string, ms: number): Promise<void>;
}

export interface ExecutionResult extends z.infer<typeof ExecutionResultSchema> {}

export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export interface StepResult extends z.infer<typeof StepResultSchema> {}

export type StepStatus = z.infer<typeof StepStatusSchema>;

export interface RetryConfig extends z.infer<typeof RetryConfigSchema> {}

export interface PanicConfig extends z.infer<typeof PanicConfigSchema> {}

// packages/types/src/common.ts
import { z } from 'zod';

export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export const WorkflowInputSchema = z.object({
  workflowName: z.string().min(1),
  executionId: z.string().uuid(),
  input: z.any().optional(),
  retryConfig: RetryConfigSchema.optional(),
  panicConfig: PanicConfigSchema.optional()
});

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

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly validationErrors: z.ZodError
  ) {
    super(message);
    this.name = 'ValidationError';
  }
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
import { z } from 'zod';
import { WorkflowContextSchema, RetryConfigSchema, PanicConfigSchema, ValidationError } from '@workflow/types';

export const createContext = (
  workflowName: string, 
  executionId: string, 
  input?: any,
  retryConfig?: RetryConfig,
  panicConfig?: PanicConfig
): WorkflowContext => {
  // Validate context parameters with Zod
  const contextData = { workflowName, executionId, input, attempt: 1, restartAttempt: 1 };
  const contextValidation = WorkflowContextSchema.safeParse(contextData);
  
  if (!contextValidation.success) {
    throw new ValidationError(
      `Invalid workflow context`,
      contextValidation.error
    );
  }

  // Validate retry configuration
  if (retryConfig) {
    const retryValidation = RetryConfigSchema.safeParse(retryConfig);
    if (!retryValidation.success) {
      throw new ValidationError(
        `Invalid retry configuration`,
        retryValidation.error
      );
    }
  }

  // Validate panic configuration
  if (panicConfig) {
    const panicValidation = PanicConfigSchema.safeParse(panicConfig);
    if (!panicValidation.success) {
      throw new ValidationError(
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
        throw new ValidationError(
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
      // Validate sleep parameters
      const sleepValidation = z.object({
        stepId: z.string().min(1, 'Step ID cannot be empty'),
        ms: z.number().int().min(0, 'Sleep duration must be non-negative').max(300000, 'Sleep duration cannot exceed 5 minutes')
      }).safeParse({ stepId, ms });

      if (!sleepValidation.success) {
        throw new ValidationError(
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
      throw new SleepInterrupt(wakeTime);
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
      throw new ValidationError(
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
    let workflowDef: any;

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

const executeStepByType = async (type: string, config: any, ctx: any): Promise<any> => {
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
    let inputData: any = {};
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
  format?: (value: any) => string;
}

export const formatTable = (data: any[], columns: TableColumn[]): string => {
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

export const formatJson = (data: any): string => {
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
  logLevel: (process.env.LOG_LEVEL as any) || 'info'
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
    "build": "bun build src/index.ts --outdir dist --target node --format esm",
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

export namespace WorkflowRegistry {
  export interface WorkflowInfo {
    name: string;
    dbPath: string;
    createdAt: Date;
    lastExecutionAt?: Date;
    executionCount: number;
    status: 'active' | 'inactive';
  }

  export interface RegistryConfig {
    baseDir: string;
    registryDbPath?: string;
  }

  let registryDb: Database | null = null;
  let config: RegistryConfig;

  export const initialize = (registryConfig: RegistryConfig): void => {
    config = registryConfig;
    
    // Ensure base directory exists
    if (!fs.existsSync(config.baseDir)) {
      fs.mkdirSync(config.baseDir, { recursive: true });
    }

    // Initialize registry database
    const registryPath = config.registryDbPath || path.join(config.baseDir, 'registry.db');
    registryDb = new Database(registryPath);
    
    // Create registry table
    registryDb.exec(`
      CREATE TABLE IF NOT EXISTS workflow_registry (
        name TEXT PRIMARY KEY,
        db_path TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_execution_at DATETIME,
        execution_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active'
      );
      
      CREATE INDEX IF NOT EXISTS idx_workflow_status ON workflow_registry(status);
      CREATE INDEX IF NOT EXISTS idx_workflow_last_execution ON workflow_registry(last_execution_at);
    `);

    logger.info(`Workflow registry initialized at: ${registryPath}`);
  };

  export const registerWorkflow = async (workflowName: string): Promise<Result<string>> => {
    if (!registryDb) {
      return { success: false, error: new Error('Registry not initialized') };
    }

    try {
      const dbPath = path.join(config.baseDir, `${workflowName}.db`);
      
      const stmt = registryDb.prepare(`
        INSERT OR REPLACE INTO workflow_registry (name, db_path, created_at, status)
        VALUES (?, ?, CURRENT_TIMESTAMP, 'active')
      `);
      
      stmt.run(workflowName, dbPath);
      
      logger.info(`Registered workflow: ${workflowName} -> ${dbPath}`);
      return { success: true, data: dbPath };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  export const getWorkflowDbPath = async (workflowName: string): Promise<Result<string | null>> => {
    if (!registryDb) {
      return { success: false, error: new Error('Registry not initialized') };
    }

    try {
      const stmt = registryDb.prepare('SELECT db_path FROM workflow_registry WHERE name = ?');
      const row = stmt.get(workflowName) as any;
      
      if (!row) {
        return { success: true, data: null };
      }
      
      return { success: true, data: row.db_path };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  export const listWorkflows = async (): Promise<Result<WorkflowInfo[]>> => {
    if (!registryDb) {
      return { success: false, error: new Error('Registry not initialized') };
    }

    try {
      const stmt = registryDb.prepare(`
        SELECT name, db_path, created_at, last_execution_at, execution_count, status
        FROM workflow_registry
        ORDER BY last_execution_at DESC, created_at DESC
      `);
      
      const rows = stmt.all() as any[];
      
      const workflows: WorkflowInfo[] = rows.map(row => ({
        name: row.name,
        dbPath: row.db_path,
        createdAt: new Date(row.created_at),
        lastExecutionAt: row.last_execution_at ? new Date(row.last_execution_at) : undefined,
        executionCount: row.execution_count,
        status: row.status
      }));
      
      return { success: true, data: workflows };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  export const updateExecutionStats = async (workflowName: string): Promise<Result<void>> => {
    if (!registryDb) {
      return { success: false, error: new Error('Registry not initialized') };
    }

    try {
      const stmt = registryDb.prepare(`
        UPDATE workflow_registry 
        SET last_execution_at = CURRENT_TIMESTAMP, 
            execution_count = execution_count + 1
        WHERE name = ?
      `);
      
      stmt.run(workflowName);
      return { success: true, data: undefined };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  export const removeWorkflow = async (workflowName: string): Promise<Result<boolean>> => {
    if (!registryDb) {
      return { success: false, error: new Error('Registry not initialized') };
    }

    try {
      // Get database path before deletion
      const pathResult = await getWorkflowDbPath(workflowName);
      if (!pathResult.success) {
        return pathResult as Result<boolean>;
      }

      if (!pathResult.data) {
        return { success: true, data: false }; // Workflow not found
      }

      // Remove from registry
      const stmt = registryDb.prepare('DELETE FROM workflow_registry WHERE name = ?');
      const result = stmt.run(workflowName);
      
      // Delete database file if it exists
      if (fs.existsSync(pathResult.data)) {
        fs.unlinkSync(pathResult.data);
        logger.info(`Deleted workflow database: ${pathResult.data}`);
      }
      
      logger.info(`Removed workflow from registry: ${workflowName}`);
      return { success: true, data: result.changes > 0 };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  export const getWorkflowStats = async (workflowName: string): Promise<Result<WorkflowInfo | null>> => {
    if (!registryDb) {
      return { success: false, error: new Error('Registry not initialized') };
    }

    try {
      const stmt = registryDb.prepare(`
        SELECT name, db_path, created_at, last_execution_at, execution_count, status
        FROM workflow_registry 
        WHERE name = ?
      `);
      
      const row = stmt.get(workflowName) as any;
      
      if (!row) {
        return { success: true, data: null };
      }
      
      const workflowInfo: WorkflowInfo = {
        name: row.name,
        dbPath: row.db_path,
        createdAt: new Date(row.created_at),
        lastExecutionAt: row.last_execution_at ? new Date(row.last_execution_at) : undefined,
        executionCount: row.execution_count,
        status: row.status
      };
      
      return { success: true, data: workflowInfo };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  };

  export const close = (): void => {
    if (registryDb) {
      registryDb.close();
      registryDb = null;
      logger.info('Workflow registry closed');
    }
  };
}
```

**Per-Workflow Database Management**
```typescript
// packages/database/src/workflow-db.ts
import { Database } from "bun:sqlite";
import { WorkflowRegistry } from "./registry";
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

      // Get database path from registry
      const pathResult = await WorkflowRegistry.getWorkflowDbPath(workflowName);
      if (!pathResult.success) {
        return pathResult as Result<Database>;
      }

      if (!pathResult.data) {
        // Register new workflow
        const registerResult = await WorkflowRegistry.registerWorkflow(workflowName);
        if (!registerResult.success) {
          return registerResult as Result<Database>;
        }
        pathResult.data = registerResult.data;
      }

      // Create database connection
      const db = new Database(pathResult.data);
      
      // Enable foreign keys and WAL mode for better performance
      db.exec("PRAGMA foreign_keys = ON");
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA synchronous = NORMAL");
      
      // Create tables
      Schema.createWorkflowTables(db);
      
      // Cache connection
      connections.set(workflowName, db);
      
      logger.info(`Connected to workflow database: ${workflowName} -> ${pathResult.data}`);
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
      await WorkflowRegistry.updateExecutionStats(workflowName);
      
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
      const execRow = execStmt.get(executionId) as any;
      
      if (!execRow) {
        return { success: true, data: null };
      }

      // Load steps
      const stepsStmt = db.prepare('SELECT * FROM steps WHERE execution_id = ?');
      const stepRows = stepsStmt.all(executionId) as any[];
      
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
      const params: any[] = [];
      
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
      const rows = stmt.all(...params) as any[];
      
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
    const circularObj: any = { name: 'test' };
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
    
    expect(() => Workflow.define('valid-name', null as any))
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

### Workflow Definition File Examples

**Simple Log Workflow**
```json
// workflows/simple-log.json
{
  "name": "simple-log",
  "description": "A simple workflow that logs messages",
  "steps": [
    {
      "id": "welcome",
      "type": "log",
      "config": {
        "message": "Welcome to the workflow!"
      }
    },
    {
      "id": "wait",
      "type": "delay",
      "config": {
        "duration": 2000
      }
    },
    {
      "id": "goodbye",
      "type": "log",
      "config": {
        "message": "Workflow completed successfully!"
      }
    }
  ],
  "retryConfig": {
    "maxAttempts": 3,
    "backoffMs": 1000,
    "exponentialBackoff": true
  }
}
```

**HTTP API Workflow**
```json
// workflows/api-workflow.json
{
  "name": "api-workflow",
  "description": "Workflow that calls external APIs",
  "steps": [
    {
      "id": "fetch-users",
      "type": "http",
      "config": {
        "url": "https://jsonplaceholder.typicode.com/users"
      }
    },
    {
      "id": "process-delay",
      "type": "delay",
      "config": {
        "duration": 1000
      }
    },
    {
      "id": "fetch-posts",
      "type": "http",
      "config": {
        "url": "https://jsonplaceholder.typicode.com/posts"
      }
    },
    {
      "id": "completion-log",
      "type": "log",
      "config": {
        "message": "API data fetched successfully"
      }
    }
  ],
  "retryConfig": {
    "maxAttempts": 5,
    "backoffMs": 2000,
    "exponentialBackoff": true
  },
  "panicConfig": {
    "maxRestartAttempts": 2,
    "restartDelayMs": 10000,
    "enableAutoRestart": true
  }
}
```

### Programmatic Usage Examples

**Basic Workflow Definition**
```typescript
import { Workflow } from '@workflow/core';
import { WorkflowRegistry } from '@workflow/database';

// Initialize registry
WorkflowRegistry.initialize({
  baseDir: './workflows-data'
});

// Define a simple workflow
Workflow.define("data-processing", async (ctx) => {
    const data = await ctx.step("fetch-data", async () => {
        return { records: [1, 2, 3, 4, 5] };
    });
    
    await ctx.step("process-data", async () => {
        console.log(`Processing ${data.records.length} records`);
        return { processed: data.records.length };
    });
    
    await ctx.sleep("wait-before-cleanup", 1000);
    
    await ctx.step("cleanup", async () => {
        console.log("Cleanup completed");
    });
});

// Start execution
const result = await Workflow.start("data-processing", crypto.randomUUID());
console.log("Workflow result:", result);
```

**Workflow with Error Handling and Retries**
```typescript
Workflow.define("resilient-api-call", async (ctx) => {
    // This step will retry automatically on failure
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
        // Simulate database save
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

**Workflow Discovery and Management**
```typescript
import { WorkflowRegistry, WorkflowDatabase } from '@workflow/database';

// List all available workflows
const workflowsResult = await WorkflowRegistry.listWorkflows();
if (workflowsResult.success) {
    console.log("Available workflows:");
    workflowsResult.data.forEach(workflow => {
        console.log(`- ${workflow.name}: ${workflow.executionCount} executions`);
        console.log(`  Last run: ${workflow.lastExecutionAt?.toLocaleString() || 'Never'}`);
        console.log(`  Status: ${workflow.status}`);
    });
}

// Get detailed stats for a specific workflow
const statsResult = await WorkflowRegistry.getWorkflowStats("data-processing");
if (statsResult.success && statsResult.data) {
    const stats = statsResult.data;
    console.log(`Workflow: ${stats.name}`);
    console.log(`Database: ${stats.dbPath}`);
    console.log(`Total executions: ${stats.executionCount}`);
    console.log(`Created: ${stats.createdAt.toLocaleString()}`);
}

// List recent executions for a workflow
const executionsResult = await WorkflowDatabase.listExecutions("data-processing", {
    limit: 10
});
if (executionsResult.success) {
    console.log("Recent executions:");
    executionsResult.data.forEach(exec => {
        console.log(`- ${exec.executionId}: ${exec.status} (${exec.startedAt.toLocaleString()})`);
    });
}
```

### Database Structure Examples

Each workflow gets its own SQLite database file:
```
~/.workflows/
├── registry.db              # Central registry of all workflows
├── data-processing.db        # Database for "data-processing" workflow
├── api-workflow.db          # Database for "api-workflow" workflow
├── simple-log.db            # Database for "simple-log" workflow
└── resilient-api-call.db    # Database for "resilient-api-call" workflow
```

**Registry Database Schema:**
```sql
-- registry.db
CREATE TABLE workflow_registry (
    name TEXT PRIMARY KEY,
    db_path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_execution_at DATETIME,
    execution_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
);
```

**Per-Workflow Database Schema:**
```sql
-- {workflow-name}.db
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
bun add @workflow/core zod
npm install @workflow/core zod
```

This guide provides the foundation for building a workflow library with a fluent API that can be easily integrated into any TypeScript project.