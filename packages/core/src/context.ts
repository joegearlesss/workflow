import { Database } from './database';
import type {
  WorkflowContext,
  StepBuilder,
  StepFunction,
  ErrorHandlerMap,
  CircuitBreakerConfig,
  ErrorHandler,
  StepExecution,
} from './types';

/**
 * Workflow context implementation providing step execution and chaining
 */
export class WorkflowContextImpl<TInput = unknown> implements WorkflowContext<TInput> {
  constructor(
    public readonly executionId: string,
    public readonly workflowName: string,
    public readonly input: TInput,
    public readonly attempt: number,
    public readonly metadata: Record<string, unknown>
  ) {}

  /**
   * Create a new step for execution
   * @param name - Unique step name within the workflow
   * @param fn - Step function to execute
   * @returns Step builder for chaining configuration
   */
  step<TStepInput = unknown, TStepOutput = unknown>(
    name: string,
    fn: StepFunction<TStepInput, TStepOutput>
  ): StepBuilder<TStepInput, TStepOutput> {
    return new StepBuilderImpl(
      this.executionId,
      name,
      fn,
      this.attempt
    );
  }

  /**
   * Sleep for a specified duration
   * @param name - Unique name for this sleep step
   * @param durationMs - Duration in milliseconds
   */
  async sleep(name: string, durationMs: number): Promise<void> {
    // Check if this sleep step was already completed
    const existingStep = await Database.StepExecution.findByExecutionAndStep(
      this.executionId,
      name
    );

    if (existingStep?.status === 'completed') {
      // Sleep already completed, skip
      return;
    }

    // Create step execution record
    const stepExecution = await Database.StepExecution.create({
      executionId: this.executionId,
      stepName: name,
      status: 'running',
      input: { durationMs },
      attempt: 1,
      maxAttempts: 1,
      startedAt: new Date(),
    });

    // Perform the sleep
    await new Promise(resolve => setTimeout(resolve, durationMs));

    // Mark step as completed
    await Database.StepExecution.update(stepExecution.id, {
      status: 'completed',
      output: { sleptMs: durationMs },
      completedAt: new Date(),
    });
  }
}

/**
 * Step builder implementation with fluent chaining API
 */
class StepBuilderImpl<TInput = unknown, TOutput = unknown> implements StepBuilder<TInput, TOutput> {
  private errorHandlers: ErrorHandlerMap<TInput, TOutput> = {};
  private circuitBreakerConfig: CircuitBreakerConfig | undefined;
  private catchHandler: ErrorHandler<TInput, unknown> | undefined;

  constructor(
    private readonly executionId: string,
    private readonly stepName: string,
    private readonly stepFunction: StepFunction<TInput, TOutput>,
    private readonly workflowAttempt: number
  ) {}

  /**
   * Configure error handlers for specific error types
   * @param handlers - Map of error type names to handler functions
   * @returns This builder for chaining
   */
  onError(handlers: ErrorHandlerMap<TInput, TOutput>): StepBuilder<TInput, TOutput> {
    this.errorHandlers = { ...this.errorHandlers, ...handlers };
    return this;
  }

  /**
   * Configure circuit breaker for this step
   * @param config - Circuit breaker configuration
   * @returns This builder for chaining
   */
  withCircuitBreaker(config: CircuitBreakerConfig): StepBuilder<TInput, TOutput> {
    this.circuitBreakerConfig = config;
    return this;
  }

  /**
   * Configure a catch-all error handler
   * @param handler - Error handler function
   * @returns This builder for chaining
   */
  catch<TFallback = TOutput>(
    handler: ErrorHandler<TInput, TFallback>
  ): StepBuilder<TInput, TOutput | TFallback> {
    this.catchHandler = handler as ErrorHandler<TInput, unknown>;
    return this as StepBuilder<TInput, TOutput | TFallback>;
  }

  /**
   * Execute the step with all configured options
   * @returns Promise that resolves with step output
   */
  async execute(): Promise<TOutput> {
    // Check if step was already completed
    const existingStep = await Database.StepExecution.findByExecutionAndStep(
      this.executionId,
      this.stepName
    );

    if (existingStep?.status === 'completed') {
      // Step already completed, return cached result
      return existingStep.output as TOutput;
    }

    // Determine step attempt number
    const attempt = existingStep ? existingStep.attempt + 1 : 1;
    const maxAttempts = existingStep?.maxAttempts ?? 3;

    // Check circuit breaker if configured
    if (this.circuitBreakerConfig) {
      const canExecute = await this.checkCircuitBreaker();
      if (!canExecute && this.circuitBreakerConfig.onOpen) {
        const context = new WorkflowContextImpl(
          this.executionId,
          '', // workflow name not needed for onOpen
          undefined as TInput,
          this.workflowAttempt,
          {}
        );
        await this.circuitBreakerConfig.onOpen(context);
        throw new Error('Circuit breaker is open');
      }
    }

    let stepExecution: StepExecution;

    if (existingStep) {
      // Update existing step for retry
      stepExecution = (await Database.StepExecution.update(existingStep.id, {
        status: 'running',
        attempt,
        startedAt: new Date(),
      }))!;
    } else {
      // Create new step execution
      stepExecution = await Database.StepExecution.create({
        executionId: this.executionId,
        stepName: this.stepName,
        status: 'running',
        attempt,
        maxAttempts,
        startedAt: new Date(),
      });
    }

    try {
      // Execute the step function
      const result = await this.stepFunction();

      // Mark as completed
      await Database.StepExecution.update(stepExecution.id, {
        status: 'completed',
        output: result as Record<string, unknown>,
        completedAt: new Date(),
      });

      // Reset circuit breaker on success
      if (this.circuitBreakerConfig) {
        await this.resetCircuitBreaker();
      }

      return result;
    } catch (error) {
      const err = error as Error;

      // Record circuit breaker failure
      if (this.circuitBreakerConfig) {
        await this.recordCircuitBreakerFailure();
      }

      // Try to handle error with specific handlers
      const handlerResult = await this.handleError(err);
      if (handlerResult.handled) {
        // Error was handled, mark step as completed
        await Database.StepExecution.update(stepExecution.id, {
          status: 'completed',
          output: handlerResult.result as Record<string, unknown>,
          completedAt: new Date(),
        });
        return handlerResult.result;
      }

      // Check if we can retry
      if (attempt < maxAttempts) {
        // Mark as failed but retryable
        await Database.StepExecution.update(stepExecution.id, {
          status: 'retrying',
          error: {
            message: err.message,
            stack: err.stack,
            attempt,
          },
        });
        throw err; // Re-throw to trigger retry at workflow level
      }

      // Max attempts reached, mark as permanently failed
      await Database.StepExecution.update(stepExecution.id, {
        status: 'failed',
        error: {
          message: err.message,
          stack: err.stack,
          attempt,
          maxAttemptsReached: true,
        },
        completedAt: new Date(),
      });

      throw err;
    }
  }

  /**
   * Handle errors using configured error handlers
   */
  private async handleError(error: Error): Promise<{
    handled: boolean;
    result?: TOutput;
  }> {
    // Try specific error handlers first
    for (const [errorType, handler] of Object.entries(this.errorHandlers)) {
      if (errorType === 'default') continue;

      if (this.matchesErrorType(error, errorType)) {
        try {
          const context = new WorkflowContextImpl(
            this.executionId,
            '',
            undefined as TInput,
            this.workflowAttempt,
            {}
          );
          const result = await handler(error, context);
          return { handled: true, result };
        } catch (handlerError) {
          console.error(`Error handler '${errorType}' failed:`, handlerError);
          // Continue to next handler
        }
      }
    }

    // Try default error handler
    if (this.errorHandlers.default) {
      try {
        const context = new WorkflowContextImpl(
          this.executionId,
          '',
          undefined as TInput,
          this.workflowAttempt,
          {}
        );
        const result = await this.errorHandlers.default(error, context);
        return { handled: true, result };
      } catch (handlerError) {
        console.error('Default error handler failed:', handlerError);
      }
    }

    // Try catch handler
    if (this.catchHandler) {
      try {
        const context = new WorkflowContextImpl(
          this.executionId,
          '',
          undefined as TInput,
          this.workflowAttempt,
          {}
        );
        const result = await this.catchHandler(error, context);
        return { handled: true, result: result as TOutput };
      } catch (handlerError) {
        console.error('Catch handler failed:', handlerError);
      }
    }

    return { handled: false };
  }

  /**
   * Check if error matches a specific error type
   */
  private matchesErrorType(error: Error, errorType: string): boolean {
    // Check error name
    if (error.name === errorType) return true;

    // Check error constructor name
    if (error.constructor.name === errorType) return true;

    // Check custom error property
    if ('name' in error && error.name === errorType) return true;

    return false;
  }

  /**
   * Check circuit breaker state
   */
  private async checkCircuitBreaker(): Promise<boolean> {
    if (!this.circuitBreakerConfig) return true;

    const circuitBreakerName = `${this.executionId}-${this.stepName}`;
    const state = await Database.CircuitBreaker.getOrCreate(circuitBreakerName);

    switch (state.state) {
      case 'closed':
        return true;

      case 'open':
        // Check if reset timeout has passed
        if (state.nextAttemptAt && new Date() >= state.nextAttemptAt) {
          // Move to half-open state
          await Database.CircuitBreaker.update(circuitBreakerName, {
            state: 'half-open',
          });
          return true;
        }
        return false;

      case 'half-open':
        return true;

      default:
        return true;
    }
  }

  /**
   * Record circuit breaker failure
   */
  private async recordCircuitBreakerFailure(): Promise<void> {
    if (!this.circuitBreakerConfig) return;

    const circuitBreakerName = `${this.executionId}-${this.stepName}`;
    const state = await Database.CircuitBreaker.getOrCreate(circuitBreakerName);
    const newFailureCount = state.failureCount + 1;
    const now = new Date();

    if (newFailureCount >= this.circuitBreakerConfig.failureThreshold) {
      // Open the circuit breaker
      await Database.CircuitBreaker.update(circuitBreakerName, {
        state: 'open',
        failureCount: newFailureCount,
        lastFailureAt: now,
        nextAttemptAt: new Date(now.getTime() + this.circuitBreakerConfig.resetTimeout),
      });
    } else {
      // Increment failure count
      await Database.CircuitBreaker.update(circuitBreakerName, {
        failureCount: newFailureCount,
        lastFailureAt: now,
      });
    }
  }

  /**
   * Reset circuit breaker on success
   */
  private async resetCircuitBreaker(): Promise<void> {
    if (!this.circuitBreakerConfig) return;

    const circuitBreakerName = `${this.executionId}-${this.stepName}`;
    await Database.CircuitBreaker.reset(circuitBreakerName);
  }
}

/**
 * Workflow context namespace for utility functions
 */
namespace WorkflowContext {
  /**
   * Create a new workflow context instance
   * @param executionId - Workflow execution ID
   * @param workflowName - Name of the workflow
   * @param input - Input data for the workflow
   * @param attempt - Current attempt number
   * @param metadata - Additional metadata
   * @returns Workflow context instance
   */
  export const create = <TInput = unknown>(
    executionId: string,
    workflowName: string,
    input: TInput,
    attempt: number,
    metadata: Record<string, unknown> = {}
  ): WorkflowContext<TInput> => {
    return new WorkflowContextImpl(executionId, workflowName, input, attempt, metadata);
  };
}

export { WorkflowContext };