import { sqliteTable, text, integer, blob } from 'drizzle-orm/sqlite-core';
import { z } from 'zod';

// Simple ID generator for testing - replace with proper UUID/CUID library in production
const createId = (): string => {
  return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Workflow execution states
 */
export const WorkflowExecutionStatus = z.enum([
  'pending',
  'running', 
  'completed',
  'failed',
  'paused',
  'cancelled'
]).describe('Workflow execution status indicating current state');

export type WorkflowExecutionStatus = z.infer<typeof WorkflowExecutionStatus>;

/**
 * Step execution states
 */
export const StepExecutionStatus = z.enum([
  'pending',
  'running',
  'completed', 
  'failed',
  'skipped',
  'retrying'
]).describe('Step execution status within a workflow');

export type StepExecutionStatus = z.infer<typeof StepExecutionStatus>;

/**
 * Workflow definitions table - stores workflow templates
 */
export const workflowDefinitions = sqliteTable('workflow_definitions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId())
    .notNull(),
  name: text('name')
    .unique()
    .notNull(),
  version: text('version')
    .notNull()
    .default('1.0.0'),
  description: text('description'),
  schema: text('schema', { mode: 'json' })
    .notNull(),
  isActive: integer('is_active', { mode: 'boolean' })
    .notNull()
    .default(true),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Workflow executions table - tracks individual workflow runs
 */
export const workflowExecutions = sqliteTable('workflow_executions', {
  id: text('id')
    .primaryKey()
    .notNull(),
  definitionId: text('definition_id')
    .notNull()
    .references(() => workflowDefinitions.id),
  workflowName: text('workflow_name')
    .notNull(),
  status: text('status')
    .notNull()
    .$type<WorkflowExecutionStatus>()
    .default('pending'),
  input: text('input', { mode: 'json' }),
  output: text('output', { mode: 'json' }),
  error: text('error', { mode: 'json' }),
  metadata: text('metadata', { mode: 'json' }),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Step executions table - tracks individual step runs within workflows
 */
export const stepExecutions = sqliteTable('step_executions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId())
    .notNull(),
  executionId: text('execution_id')
    .notNull()
    .references(() => workflowExecutions.id),
  stepName: text('step_name')
    .notNull(),
  status: text('status')
    .notNull()
    .$type<StepExecutionStatus>()
    .default('pending'),
  input: text('input', { mode: 'json' }),
  output: text('output', { mode: 'json' }),
  error: text('error', { mode: 'json' }),
  attempt: integer('attempt')
    .notNull()
    .default(1),
  maxAttempts: integer('max_attempts')
    .notNull()
    .default(3),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Circuit breaker states table - tracks circuit breaker status
 */
export const circuitBreakerStates = sqliteTable('circuit_breaker_states', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId())
    .notNull(),
  name: text('name')
    .unique()
    .notNull(),
  state: text('state')
    .notNull()
    .$type<'closed' | 'open' | 'half-open'>()
    .default('closed'),
  failureCount: integer('failure_count')
    .notNull()
    .default(0),
  lastFailureAt: integer('last_failure_at', { mode: 'timestamp' }),
  nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Workflow locks table - prevents concurrent execution of same workflow
 */
export const workflowLocks = sqliteTable('workflow_locks', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId())
    .notNull(),
  executionId: text('execution_id')
    .unique()
    .notNull()
    .references(() => workflowExecutions.id),
  lockKey: text('lock_key')
    .notNull(),
  acquiredAt: integer('acquired_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  expiresAt: integer('expires_at', { mode: 'timestamp' })
    .notNull(),
  metadata: text('metadata', { mode: 'json' }),
});

/**
 * Zod schemas for validation
 */
export const WorkflowDefinitionSchema = z.object({
  id: z.string()
    .describe('Unique identifier for the workflow definition'),
  name: z.string()
    .min(1, 'Workflow name is required')
    .max(100, 'Workflow name cannot exceed 100 characters')
    .describe('Unique name identifying the workflow template'),
  version: z.string()
    .regex(/^\d+\.\d+\.\d+$/, 'Version must follow semantic versioning (x.y.z)')
    .describe('Semantic version of the workflow definition'),
  description: z.string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional()
    .describe('Optional description explaining the workflow purpose'),
  schema: z.record(z.unknown())
    .describe('JSON schema defining the workflow structure and steps'),
  isActive: z.boolean()
    .describe('Whether this workflow definition is active and can be executed'),
  createdAt: z.date()
    .describe('Timestamp when the workflow definition was created'),
  updatedAt: z.date()
    .describe('Timestamp when the workflow definition was last modified'),
}).describe('Workflow definition schema for storing workflow templates');

export const WorkflowExecutionSchema = z.object({
  id: z.string()
    .describe('Unique identifier for the workflow execution'),
  definitionId: z.string()
    .describe('Reference to the workflow definition being executed'),
  workflowName: z.string()
    .describe('Name of the workflow being executed'),
  status: WorkflowExecutionStatus,
  input: z.record(z.unknown())
    .optional()
    .describe('Input data provided to the workflow execution'),
  output: z.record(z.unknown())
    .optional()
    .describe('Output data produced by the workflow execution'),
  error: z.record(z.unknown())
    .optional()
    .describe('Error information if the workflow execution failed'),
  metadata: z.record(z.unknown())
    .optional()
    .describe('Additional metadata associated with the execution'),
  startedAt: z.date()
    .optional()
    .describe('Timestamp when the workflow execution started'),
  completedAt: z.date()
    .optional()
    .describe('Timestamp when the workflow execution completed'),
  createdAt: z.date()
    .describe('Timestamp when the execution record was created'),
  updatedAt: z.date()
    .describe('Timestamp when the execution record was last updated'),
}).describe('Workflow execution schema for tracking individual workflow runs');

export const StepExecutionSchema = z.object({
  id: z.string()
    .describe('Unique identifier for the step execution'),
  executionId: z.string()
    .describe('Reference to the parent workflow execution'),
  stepName: z.string()
    .describe('Name of the step being executed'),
  status: StepExecutionStatus,
  input: z.record(z.unknown())
    .optional()
    .describe('Input data provided to the step'),
  output: z.record(z.unknown())
    .optional()
    .describe('Output data produced by the step'),
  error: z.record(z.unknown())
    .optional()
    .describe('Error information if the step failed'),
  attempt: z.number()
    .min(1, 'Attempt number must be at least 1')
    .describe('Current attempt number for this step execution'),
  maxAttempts: z.number()
    .min(1, 'Max attempts must be at least 1')
    .describe('Maximum number of attempts allowed for this step'),
  startedAt: z.date()
    .optional()
    .describe('Timestamp when the step execution started'),
  completedAt: z.date()
    .optional()
    .describe('Timestamp when the step execution completed'),
  createdAt: z.date()
    .describe('Timestamp when the step execution record was created'),
  updatedAt: z.date()
    .describe('Timestamp when the step execution record was last updated'),
}).describe('Step execution schema for tracking individual step runs within workflows');

export const CircuitBreakerStateSchema = z.object({
  id: z.string()
    .describe('Unique identifier for the circuit breaker state'),
  name: z.string()
    .describe('Unique name identifying the circuit breaker'),
  state: z.enum(['closed', 'open', 'half-open'])
    .describe('Current state of the circuit breaker - closed (normal), open (failing), half-open (testing)'),
  failureCount: z.number()
    .min(0, 'Failure count cannot be negative')
    .describe('Number of consecutive failures recorded'),
  lastFailureAt: z.date()
    .optional()
    .describe('Timestamp of the most recent failure'),
  nextAttemptAt: z.date()
    .optional()
    .describe('Timestamp when the next attempt should be allowed'),
  createdAt: z.date()
    .describe('Timestamp when the circuit breaker state was created'),
  updatedAt: z.date()
    .describe('Timestamp when the circuit breaker state was last updated'),
}).describe('Circuit breaker state schema for tracking failure protection mechanisms');