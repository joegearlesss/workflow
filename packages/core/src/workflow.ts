import { DatabaseClient, Database } from './database';
import { WorkflowContextImpl } from './context';
import type {
  WorkflowHandler,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowStartOptions,
  WorkflowRetryConfig,
} from './types';

/**
 * Core workflow registry and execution engine
 */
namespace Workflow {
  // In-memory registry of workflow handlers
  const registry = new Map<string, WorkflowHandler>();

  // Default retry configuration
  const defaultRetryConfig: WorkflowRetryConfig = {
    maxAttempts: 3,
    backoffMs: 1000,
    exponentialBackoff: true,
  };

  /**
   * Initialize the workflow engine with database connection
   * @param dbPath - Path to SQLite database file
   */
  export const initialize = async (dbPath?: string): Promise<void> => {
    DatabaseClient.initialize(dbPath);
    await DatabaseClient.runMigrations();
  };

  /**
   * Define a new workflow template
   * @param name - Unique workflow name
   * @param handler - Workflow execution function
   * @param options - Additional workflow options
   */
  export const define = <TInput = unknown, TOutput = unknown>(
    name: string,
    handler: WorkflowHandler<TInput, TOutput>,
    options: {
      readonly version?: string;
      readonly description?: string;
      readonly schema?: Record<string, unknown>;
    } = {}
  ): void => {
    if (registry.has(name)) {
      throw new Error(`Workflow '${name}' is already defined`);
    }

    // Store handler in memory registry
    registry.set(name, handler as WorkflowHandler);

    // Store definition in database for persistence
    Database.WorkflowDefinition.create({
      name,
      version: options.version ?? '1.0.0',
      description: options.description,
      schema: options.schema ?? {},
      isActive: true,
    }).catch(error => {
      console.error(`Failed to persist workflow definition '${name}':`, error);
    });
  };

  /**
   * Start workflow execution with given ID
   * @param workflowName - Name of the workflow to execute
   * @param executionId - Unique execution identifier
   * @param input - Input data for the workflow
   * @param options - Execution options
   * @returns Promise that resolves when workflow completes
   */
  export const start = async <TInput = unknown, TOutput = unknown>(
    workflowName: string,
    executionId: string,
    input?: TInput,
    options: WorkflowStartOptions = {}
  ): Promise<TOutput> => {
    const handler = registry.get(workflowName);
    if (!handler) {
      throw new Error(`Workflow '${workflowName}' is not defined`);
    }

    // Check if execution already exists
    const existingExecution = await Database.WorkflowExecution.findById(executionId);
    if (existingExecution) {
      if (existingExecution.status === 'completed') {
        return existingExecution.output as TOutput;
      }
      if (existingExecution.status === 'running') {
        throw new Error(`Workflow execution '${executionId}' is already running`);
      }
      // If failed or paused, we can resume
      return resume<TInput, TOutput>(executionId, options);
    }

    // Get workflow definition
    const definition = await Database.WorkflowDefinition.findByName(workflowName);
    if (!definition) {
      throw new Error(`Workflow definition '${workflowName}' not found`);
    }

    // Create new execution record
    const execution = await Database.WorkflowExecution.create({
      id: executionId,
      definitionId: definition.id,
      workflowName,
      status: 'pending',
      input: input as Record<string, unknown>,
      metadata: options.metadata ?? {},
    });

    return executeWorkflow<TInput, TOutput>(execution, handler, options);
  };

  /**
   * Resume a paused or failed workflow execution
   * @param executionId - Execution ID to resume
   * @param options - Resume options
   * @returns Promise that resolves when workflow completes
   */
  export const resume = async <TInput = unknown, TOutput = unknown>(
    executionId: string,
    options: WorkflowStartOptions = {}
  ): Promise<TOutput> => {
    const execution = await Database.WorkflowExecution.findById(executionId);
    if (!execution) {
      throw new Error(`Workflow execution '${executionId}' not found`);
    }

    if (execution.status === 'completed') {
      return execution.output as TOutput;
    }

    // For resume, we allow re-running 'running' executions in case they were interrupted
    // The actual running check should be handled by workflow locks, not status

    const handler = registry.get(execution.workflowName);
    if (!handler) {
      throw new Error(`Workflow '${execution.workflowName}' is not defined`);
    }

    return executeWorkflow<TInput, TOutput>(execution, handler, options);
  };

  /**
   * Cancel a running workflow execution
   * @param executionId - Execution ID to cancel
   * @returns True if cancellation was successful
   */
  export const cancel = async (executionId: string): Promise<boolean> => {
    const execution = await Database.WorkflowExecution.findById(executionId);
    if (!execution) {
      return false;
    }

    if (execution.status !== 'running' && execution.status !== 'paused') {
      return false;
    }

    await Database.WorkflowExecution.update(executionId, {
      status: 'cancelled',
      completedAt: new Date(),
    });

    return true;
  };

  /**
   * Get workflow execution status and details
   * @param executionId - Execution ID to query
   * @returns Workflow execution details or undefined
   */
  export const getExecution = async (executionId: string): Promise<WorkflowExecution | undefined> => {
    return Database.WorkflowExecution.findById(executionId);
  };

  /**
   * List workflow executions by name and status
   * @param workflowName - Workflow name to filter by
   * @param status - Execution status to filter by
   * @returns Array of matching executions
   */
  export const listExecutions = async (
    workflowName: string,
    status?: WorkflowExecution['status']
  ): Promise<readonly WorkflowExecution[]> => {
    if (status) {
      return Database.WorkflowExecution.findByWorkflowAndStatus(workflowName, status);
    }

    // If no status specified, return all executions for the workflow
    const db = DatabaseClient.getDatabase();
    const { workflowExecutions } = await import('./database/schema');
    const { eq, desc } = await import('drizzle-orm');
    
    const results = await db.select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflowName, workflowName))
      .orderBy(desc(workflowExecutions.createdAt));
    
    return results as readonly WorkflowExecution[];
  };

  /**
   * Get list of all defined workflows
   * @returns Array of workflow definitions
   */
  export const listDefinitions = async (): Promise<readonly WorkflowDefinition[]> => {
    return Database.WorkflowDefinition.listActive();
  };

  /**
   * Find and resume any interrupted workflow executions
   * @returns Number of workflows resumed
   */
  export const resumeInterrupted = async (): Promise<number> => {
    const interruptedExecutions = await Database.WorkflowExecution.findResumable();
    let resumedCount = 0;

    for (const execution of interruptedExecutions) {
      try {
        await resume(execution.id);
        resumedCount++;
      } catch (error) {
        console.error(`Failed to resume execution ${execution.id}:`, error);
        // Mark as failed if resume fails
        await Database.WorkflowExecution.update(execution.id, {
          status: 'failed',
          error: { message: (error as Error).message },
          completedAt: new Date(),
        });
      }
    }

    return resumedCount;
  };

  /**
   * Internal workflow execution logic
   */
  const executeWorkflow = async <TInput, TOutput>(
    execution: WorkflowExecution,
    handler: WorkflowHandler<TInput, TOutput>,
    options: WorkflowStartOptions
  ): Promise<TOutput> => {
    const retryConfig = { ...defaultRetryConfig, ...options.retry };
    let lastError: Error | undefined;

    // Update status to running
    await Database.WorkflowExecution.update(execution.id, {
      status: 'running',
      startedAt: new Date(),
    });

    for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
      try {
        // Create workflow context
        const context = new WorkflowContextImpl<TInput>(
          execution.id,
          execution.workflowName,
          execution.input as TInput,
          attempt,
          execution.metadata ?? {}
        );

        // Execute workflow handler
        const result = await handler(context);

        // Mark as completed
        await Database.WorkflowExecution.update(execution.id, {
          status: 'completed',
          output: result as Record<string, unknown>,
          completedAt: new Date(),
        });

        return result;
      } catch (error) {
        lastError = error as Error;
        console.error(`Workflow execution ${execution.id} failed (attempt ${attempt}):`, error);

        if (attempt < retryConfig.maxAttempts) {
          // Calculate backoff delay
          const delay = retryConfig.exponentialBackoff
            ? retryConfig.backoffMs * Math.pow(2, attempt - 1)
            : retryConfig.backoffMs;

          console.log(`Retrying workflow ${execution.id} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retry attempts failed
    await Database.WorkflowExecution.update(execution.id, {
      status: 'failed',
      error: {
        message: lastError?.message ?? 'Unknown error',
        stack: lastError?.stack,
        attempts: retryConfig.maxAttempts,
      },
      completedAt: new Date(),
    });

    throw lastError ?? new Error('Workflow execution failed');
  };
}

export { Workflow };