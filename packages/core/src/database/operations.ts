import { eq, and, desc, asc } from 'drizzle-orm';
import { DatabaseClient } from './client';
import {
  workflowDefinitions,
  workflowExecutions,
  stepExecutions,
  circuitBreakerStates,
  workflowLocks,
  WorkflowDefinitionSchema,
  WorkflowExecutionSchema,
  StepExecutionSchema,
  CircuitBreakerStateSchema,
  type WorkflowExecutionStatus,
  type StepExecutionStatus,
} from './schema';
import type { z } from 'zod';

type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;
type WorkflowExecution = z.infer<typeof WorkflowExecutionSchema>;
type StepExecution = z.infer<typeof StepExecutionSchema>;
type CircuitBreakerState = z.infer<typeof CircuitBreakerStateSchema>;

/**
 * Utility to convert null values to undefined for optional fields
 */
const nullToUndefined = <T>(obj: any): T => {
  const result = { ...obj };
  for (const key in result) {
    if (result[key] === null) {
      result[key] = undefined;
    }
  }
  return result as T;
};

/**
 * Database operations namespace providing CRUD operations for workflow entities
 */
namespace Database {
  
  /**
   * Workflow definition operations
   */
  export namespace WorkflowDefinition {
    /**
     * Create a new workflow definition
     * @param definition - Workflow definition data
     * @returns Created workflow definition
     */
    export const create = async (
      definition: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<WorkflowDefinition> => {
      const db = DatabaseClient.getDatabase();
      const now = new Date();
      
      const [created] = await db.insert(workflowDefinitions).values({
        ...definition,
        createdAt: now,
        updatedAt: now,
      }).returning();
      
      return WorkflowDefinitionSchema.parse(nullToUndefined(created));
    };

    /**
     * Find workflow definition by name
     * @param name - Workflow name
     * @returns Workflow definition or undefined
     */
    export const findByName = async (name: string): Promise<WorkflowDefinition | undefined> => {
      const db = DatabaseClient.getDatabase();
      const result = await db.select()
        .from(workflowDefinitions)
        .where(eq(workflowDefinitions.name, name))
        .limit(1);
      
      return result[0] ? WorkflowDefinitionSchema.parse(nullToUndefined(result[0])) : undefined;
    };

    /**
     * Find workflow definition by ID
     * @param id - Workflow definition ID
     * @returns Workflow definition or undefined
     */
    export const findById = async (id: string): Promise<WorkflowDefinition | undefined> => {
      const db = DatabaseClient.getDatabase();
      const result = await db.select()
        .from(workflowDefinitions)
        .where(eq(workflowDefinitions.id, id))
        .limit(1);
      
      return result[0] ? WorkflowDefinitionSchema.parse(nullToUndefined(result[0])) : undefined;
    };

    /**
     * Update workflow definition
     * @param id - Workflow definition ID
     * @param updates - Partial updates to apply
     * @returns Updated workflow definition or undefined
     */
    export const update = async (
      id: string, 
      updates: Partial<Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'>>
    ): Promise<WorkflowDefinition | undefined> => {
      const db = DatabaseClient.getDatabase();
      const [updated] = await db.update(workflowDefinitions)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(workflowDefinitions.id, id))
        .returning();
      
      return updated ? WorkflowDefinitionSchema.parse(nullToUndefined(updated)) : undefined;
    };

    /**
     * List all active workflow definitions
     * @returns Array of active workflow definitions
     */
    export const listActive = async (): Promise<readonly WorkflowDefinition[]> => {
      const db = DatabaseClient.getDatabase();
      const results = await db.select()
        .from(workflowDefinitions)
        .where(eq(workflowDefinitions.isActive, true))
        .orderBy(asc(workflowDefinitions.name));
      
      return results.map(r => WorkflowDefinitionSchema.parse(nullToUndefined(r)));
    };
  }

  /**
   * Workflow execution operations
   */
  export namespace WorkflowExecution {
    /**
     * Create a new workflow execution
     * @param execution - Workflow execution data
     * @returns Created workflow execution
     */
    export const create = async (
      execution: Omit<WorkflowExecution, 'createdAt' | 'updatedAt'>
    ): Promise<WorkflowExecution> => {
      const db = DatabaseClient.getDatabase();
      const now = new Date();
      
      const [created] = await db.insert(workflowExecutions).values({
        ...execution,
        createdAt: now,
        updatedAt: now,
      }).returning();
      
      return WorkflowExecutionSchema.parse(nullToUndefined(created));
    };

    /**
     * Find workflow execution by ID
     * @param id - Execution ID
     * @returns Workflow execution or undefined
     */
    export const findById = async (id: string): Promise<WorkflowExecution | undefined> => {
      const db = DatabaseClient.getDatabase();
      const result = await db.select()
        .from(workflowExecutions)
        .where(eq(workflowExecutions.id, id))
        .limit(1);
      
      return result[0] ? WorkflowExecutionSchema.parse(nullToUndefined(result[0])) : undefined;
    };

    /**
     * Update workflow execution status and data
     * @param id - Execution ID
     * @param updates - Partial updates to apply
     * @returns Updated workflow execution or undefined
     */
    export const update = async (
      id: string,
      updates: Partial<Omit<WorkflowExecution, 'id' | 'createdAt' | 'updatedAt'>>
    ): Promise<WorkflowExecution | undefined> => {
      const db = DatabaseClient.getDatabase();
      const [updated] = await db.update(workflowExecutions)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(workflowExecutions.id, id))
        .returning();
      
      return updated ? WorkflowExecutionSchema.parse(nullToUndefined(updated)) : undefined;
    };

    /**
     * Find executions by workflow name and status
     * @param workflowName - Name of the workflow
     * @param status - Execution status to filter by
     * @returns Array of matching executions
     */
    export const findByWorkflowAndStatus = async (
      workflowName: string,
      status: WorkflowExecutionStatus
    ): Promise<readonly WorkflowExecution[]> => {
      const db = DatabaseClient.getDatabase();
      const results = await db.select()
        .from(workflowExecutions)
        .where(and(
          eq(workflowExecutions.workflowName, workflowName),
          eq(workflowExecutions.status, status)
        ))
        .orderBy(desc(workflowExecutions.createdAt));
      
      return results.map(r => WorkflowExecutionSchema.parse(nullToUndefined(r)));
    };

    /**
     * Find running executions that may need resumption
     * @returns Array of running executions
     */
    export const findResumable = async (): Promise<readonly WorkflowExecution[]> => {
      const db = DatabaseClient.getDatabase();
      const results = await db.select()
        .from(workflowExecutions)
        .where(eq(workflowExecutions.status, 'running'))
        .orderBy(asc(workflowExecutions.startedAt));
      
      return results.map(r => WorkflowExecutionSchema.parse(nullToUndefined(r)));
    };
  }

  /**
   * Step execution operations
   */
  export namespace StepExecution {
    /**
     * Create a new step execution
     * @param stepExecution - Step execution data
     * @returns Created step execution
     */
    export const create = async (
      stepExecution: Omit<StepExecution, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<StepExecution> => {
      const db = DatabaseClient.getDatabase();
      const now = new Date();
      
      const [created] = await db.insert(stepExecutions).values({
        ...stepExecution,
        createdAt: now,
        updatedAt: now,
      }).returning();
      
      return StepExecutionSchema.parse(nullToUndefined(created));
    };

    /**
     * Update step execution status and data
     * @param id - Step execution ID
     * @param updates - Partial updates to apply
     * @returns Updated step execution or undefined
     */
    export const update = async (
      id: string,
      updates: Partial<Omit<StepExecution, 'id' | 'createdAt' | 'updatedAt'>>
    ): Promise<StepExecution | undefined> => {
      const db = DatabaseClient.getDatabase();
      const [updated] = await db.update(stepExecutions)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(stepExecutions.id, id))
        .returning();
      
      return updated ? StepExecutionSchema.parse(nullToUndefined(updated)) : undefined;
    };

    /**
     * Find step executions by workflow execution ID
     * @param executionId - Workflow execution ID
     * @returns Array of step executions ordered by creation time
     */
    export const findByExecutionId = async (executionId: string): Promise<readonly StepExecution[]> => {
      const db = DatabaseClient.getDatabase();
      const results = await db.select()
        .from(stepExecutions)
        .where(eq(stepExecutions.executionId, executionId))
        .orderBy(asc(stepExecutions.createdAt));
      
      return results.map(r => StepExecutionSchema.parse(nullToUndefined(r)));
    };

    /**
     * Find step execution by execution ID and step name
     * @param executionId - Workflow execution ID
     * @param stepName - Name of the step
     * @returns Step execution or undefined
     */
    export const findByExecutionAndStep = async (
      executionId: string,
      stepName: string
    ): Promise<StepExecution | undefined> => {
      const db = DatabaseClient.getDatabase();
      const result = await db.select()
        .from(stepExecutions)
        .where(and(
          eq(stepExecutions.executionId, executionId),
          eq(stepExecutions.stepName, stepName)
        ))
        .orderBy(desc(stepExecutions.createdAt))
        .limit(1);
      
      return result[0] ? StepExecutionSchema.parse(nullToUndefined(result[0])) : undefined;
    };

    /**
     * Find failed steps that can be retried
     * @param executionId - Workflow execution ID
     * @returns Array of failed step executions that haven't exceeded max attempts
     */
    export const findRetryable = async (executionId: string): Promise<readonly StepExecution[]> => {
      const db = DatabaseClient.getDatabase();
      const results = await db.select()
        .from(stepExecutions)
        .where(and(
          eq(stepExecutions.executionId, executionId),
          eq(stepExecutions.status, 'failed')
        ));
      
      return results
        .map(r => StepExecutionSchema.parse(nullToUndefined(r)))
        .filter(step => step.attempt < step.maxAttempts);
    };
  }

  /**
   * Circuit breaker state operations
   */
  export namespace CircuitBreaker {
    /**
     * Get or create circuit breaker state
     * @param name - Circuit breaker name
     * @returns Circuit breaker state
     */
    export const getOrCreate = async (name: string): Promise<CircuitBreakerState> => {
      const db = DatabaseClient.getDatabase();
      
      // Try to find existing state
      const existing = await db.select()
        .from(circuitBreakerStates)
        .where(eq(circuitBreakerStates.name, name))
        .limit(1);
      
      if (existing[0]) {
        return CircuitBreakerStateSchema.parse(nullToUndefined(existing[0]));
      }
      
      // Create new state
      const now = new Date();
      const [created] = await db.insert(circuitBreakerStates).values({
        name,
        state: 'closed',
        failureCount: 0,
        createdAt: now,
        updatedAt: now,
      }).returning();
      
      return CircuitBreakerStateSchema.parse(nullToUndefined(created));
    };

    /**
     * Update circuit breaker state
     * @param name - Circuit breaker name
     * @param updates - State updates to apply
     * @returns Updated circuit breaker state or undefined
     */
    export const update = async (
      name: string,
      updates: Partial<Omit<CircuitBreakerState, 'id' | 'name' | 'createdAt' | 'updatedAt'>>
    ): Promise<CircuitBreakerState | undefined> => {
      const db = DatabaseClient.getDatabase();
      const [updated] = await db.update(circuitBreakerStates)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(circuitBreakerStates.name, name))
        .returning();
      
      return updated ? CircuitBreakerStateSchema.parse(nullToUndefined(updated)) : undefined;
    };

    /**
     * Reset circuit breaker to closed state
     * @param name - Circuit breaker name
     * @returns Updated circuit breaker state or undefined
     */
    export const reset = async (name: string): Promise<CircuitBreakerState | undefined> => {
      const db = DatabaseClient.getDatabase();
      const [updated] = await db.update(circuitBreakerStates)
        .set({ 
          state: 'closed',
          failureCount: 0,
          lastFailureAt: null, // Explicitly set to null in database
          nextAttemptAt: null, // Explicitly set to null in database
          updatedAt: new Date() 
        })
        .where(eq(circuitBreakerStates.name, name))
        .returning();
      
      return updated ? CircuitBreakerStateSchema.parse(nullToUndefined(updated)) : undefined;
    };
  }

  /**
   * Workflow lock operations for preventing concurrent execution
   */
  export namespace WorkflowLock {
    /**
     * Acquire a workflow lock
     * @param executionId - Workflow execution ID
     * @param lockKey - Unique lock key
     * @param expirationMs - Lock expiration time in milliseconds
     * @returns True if lock was acquired
     */
    export const acquire = async (
      executionId: string,
      lockKey: string,
      expirationMs = 300000 // 5 minutes default
    ): Promise<boolean> => {
      const db = DatabaseClient.getDatabase();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + expirationMs);
      
      try {
        await db.insert(workflowLocks).values({
          executionId,
          lockKey,
          acquiredAt: now,
          expiresAt,
        });
        return true;
      } catch {
        // Lock already exists or constraint violation
        return false;
      }
    };

    /**
     * Release a workflow lock
     * @param executionId - Workflow execution ID
     * @returns True if lock was released
     */
    export const release = async (executionId: string): Promise<boolean> => {
      const db = DatabaseClient.getDatabase();
      const result = await db.delete(workflowLocks)
        .where(eq(workflowLocks.executionId, executionId));
      
      return result.changes > 0;
    };

    /**
     * Clean up expired locks
     * @returns Number of expired locks removed
     */
    export const cleanupExpired = async (): Promise<number> => {
      const db = DatabaseClient.getDatabase();
      const now = new Date();
      const result = await db.delete(workflowLocks)
        .where(eq(workflowLocks.expiresAt, now));
      
      return result.changes;
    };
  }
}

export { Database };