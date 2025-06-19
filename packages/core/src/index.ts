/**
 * @workflow/core - Workflow orchestration library
 * 
 * Main entry point for the workflow library providing:
 * - Workflow definition and execution
 * - Step-by-step orchestration with state persistence
 * - Error handling pipes and circuit breaker patterns
 * - SQLite-based state management with Drizzle ORM
 */

export { Workflow } from './workflow';
export { WorkflowContext } from './context';
export { ErrorHandling } from './error-handling';
export { CircuitBreaker } from './circuit-breaker';
export { Database } from './database';

// Re-export types for consumers
export type {
  WorkflowDefinition,
  WorkflowHandler,
  WorkflowExecution,
  StepFunction,
  StepResult,
  ErrorHandler,
  CircuitBreakerConfig,
} from './types';