import type { ErrorHandler, ErrorHandlerMap, WorkflowContext } from './types';

/**
 * Error handling utilities and typed error classes
 */
namespace ErrorHandling {
  
  /**
   * Base workflow error class
   */
  export class WorkflowError extends Error {
    constructor(
      message: string,
      public readonly code: string,
      public readonly recoverable: boolean = true,
      public readonly retryable: boolean = true
    ) {
      super(message);
      this.name = 'WorkflowError';
    }
  }

  /**
   * Network/HTTP related errors
   */
  export class NetworkError extends WorkflowError {
    constructor(
      message: string,
      public readonly statusCode: number,
      public readonly retryAfter?: number
    ) {
      super(
        message, 
        'NETWORK_ERROR', 
        statusCode >= 500 || statusCode === 408 || statusCode === 429, // 5xx, timeout, rate limit are recoverable
        statusCode >= 500 || statusCode === 408 || statusCode === 429 // 5xx, timeout, rate limit are retryable
      );
      this.name = 'NetworkError';
    }

    static is(error: unknown): error is NetworkError {
      return error instanceof NetworkError || 
             (error instanceof Error && error.name === 'NetworkError');
    }

    static create(message: string, statusCode: number, retryAfter?: number): NetworkError {
      return new NetworkError(message, statusCode, retryAfter);
    }
  }

  /**
   * Validation related errors
   */
  export class ValidationError extends WorkflowError {
    constructor(
      message: string,
      public readonly field: string,
      public readonly value?: unknown
    ) {
      super(message, 'VALIDATION_ERROR', false, false); // Not recoverable or retryable
      this.name = 'ValidationError';
    }

    static is(error: unknown): error is ValidationError {
      return error instanceof ValidationError || 
             (error instanceof Error && error.name === 'ValidationError');
    }

    static create(message: string, field: string, value?: unknown): ValidationError {
      return new ValidationError(message, field, value);
    }
  }

  /**
   * External service errors
   */
  export class ExternalServiceError extends WorkflowError {
    constructor(
      message: string,
      public readonly service: string,
      public readonly operationType: string,
      recoverable = true
    ) {
      super(message, 'EXTERNAL_SERVICE_ERROR', recoverable, true);
      this.name = 'ExternalServiceError';
    }

    static is(error: unknown): error is ExternalServiceError {
      return error instanceof ExternalServiceError || 
             (error instanceof Error && error.name === 'ExternalServiceError');
    }

    static create(
      message: string, 
      service: string, 
      operationType: string, 
      recoverable = true
    ): ExternalServiceError {
      return new ExternalServiceError(message, service, operationType, recoverable);
    }
  }

  /**
   * Database related errors
   */
  export class DatabaseError extends WorkflowError {
    constructor(
      message: string,
      public readonly operation: string,
      public readonly constraint?: string
    ) {
      super(message, 'DATABASE_ERROR', true, true);
      this.name = 'DatabaseError';
    }

    static is(error: unknown): error is DatabaseError {
      return error instanceof DatabaseError || 
             (error instanceof Error && error.name === 'DatabaseError');
    }

    static create(message: string, operation: string, constraint?: string): DatabaseError {
      return new DatabaseError(message, operation, constraint);
    }
  }

  /**
   * Timeout related errors
   */
  export class TimeoutError extends WorkflowError {
    constructor(
      message: string,
      public readonly timeoutMs: number,
      public readonly operation: string
    ) {
      super(message, 'TIMEOUT_ERROR', true, true);
      this.name = 'TimeoutError';
    }

    static is(error: unknown): error is TimeoutError {
      return error instanceof TimeoutError || 
             (error instanceof Error && error.name === 'TimeoutError');
    }

    static create(message: string, timeoutMs: number, operation: string): TimeoutError {
      return new TimeoutError(message, timeoutMs, operation);
    }
  }

  /**
   * Resource exhaustion errors (memory, disk, etc.)
   */
  export class ResourceError extends WorkflowError {
    constructor(
      message: string,
      public readonly resource: string,
      public readonly limit?: number,
      public readonly current?: number
    ) {
      super(message, 'RESOURCE_ERROR', true, false); // Recoverable but not retryable
      this.name = 'ResourceError';
    }

    static is(error: unknown): error is ResourceError {
      return error instanceof ResourceError || 
             (error instanceof Error && error.name === 'ResourceError');
    }

    static create(
      message: string, 
      resource: string, 
      limit?: number, 
      current?: number
    ): ResourceError {
      return new ResourceError(message, resource, limit, current);
    }
  }

  /**
   * Create common error handler patterns
   */
  export namespace Handlers {
    /**
     * Exponential backoff handler for retryable errors
     */
    export const exponentialBackoff = <TInput, TOutput>(
      baseDelayMs = 1000,
      maxDelayMs = 30000,
      maxAttempts = 3
    ): ErrorHandler<TInput, TOutput> => {
      return async (error: Error, ctx: WorkflowContext<TInput>): Promise<TOutput> => {
        const delay = Math.min(baseDelayMs * Math.pow(2, ctx.attempt - 1), maxDelayMs);
        
        if (ctx.attempt < maxAttempts) {
          await ctx.sleep(`backoff-${ctx.attempt}`, delay);
          throw error; // Re-throw to trigger retry
        }
        
        throw new Error(`Max retry attempts (${maxAttempts}) exceeded: ${error.message}`);
      };
    };

    /**
     * Fallback value handler
     */
    export const fallback = <TInput, TOutput>(
      fallbackValue: TOutput
    ): ErrorHandler<TInput, TOutput> => {
      return async (error: Error, ctx: WorkflowContext<TInput>): Promise<TOutput> => {
        console.warn(`Using fallback value due to error: ${error.message}`);
        return fallbackValue;
      };
    };

    /**
     * Log and re-throw handler
     */
    export const logAndRethrow = <TInput, TOutput>(
      logger?: (error: Error, ctx: WorkflowContext<TInput>) => void
    ): ErrorHandler<TInput, TOutput> => {
      return async (error: Error, ctx: WorkflowContext<TInput>): Promise<TOutput> => {
        if (logger) {
          logger(error, ctx);
        } else {
          console.error(`Workflow ${ctx.workflowName} (${ctx.executionId}) error:`, error);
        }
        throw error;
      };
    };

    /**
     * Circuit breaker fallback handler
     */
    export const circuitBreakerFallback = <TInput, TOutput>(
      fallbackFn: (ctx: WorkflowContext<TInput>) => Promise<TOutput>
    ): ErrorHandler<TInput, TOutput> => {
      return async (error: Error, ctx: WorkflowContext<TInput>): Promise<TOutput> => {
        console.warn(`Circuit breaker triggered, using fallback: ${error.message}`);
        return fallbackFn(ctx);
      };
    };

    /**
     * Conditional retry handler based on error type
     */
    export const conditionalRetry = <TInput, TOutput>(
      shouldRetry: (error: Error) => boolean,
      maxAttempts = 3,
      delayMs = 1000
    ): ErrorHandler<TInput, TOutput> => {
      return async (error: Error, ctx: WorkflowContext<TInput>): Promise<TOutput> => {
        if (shouldRetry(error) && ctx.attempt < maxAttempts) {
          await ctx.sleep(`conditional-retry-${ctx.attempt}`, delayMs);
          throw error; // Re-throw to trigger retry
        }
        
        throw error; // Don't retry
      };
    };

    /**
     * Alert and fail handler
     */
    export const alertAndFail = <TInput, TOutput>(
      alertFn: (error: Error, ctx: WorkflowContext<TInput>) => Promise<void>
    ): ErrorHandler<TInput, TOutput> => {
      return async (error: Error, ctx: WorkflowContext<TInput>): Promise<TOutput> => {
        try {
          await alertFn(error, ctx);
        } catch (alertError) {
          console.error('Failed to send alert:', alertError);
        }
        throw error;
      };
    };
  }

  /**
   * Pre-built error handler maps for common scenarios
   */
  export namespace HandlerMaps {
    /**
     * Basic retry pattern with exponential backoff
     */
    export const basicRetry = <TInput, TOutput>(
      fallbackValue?: TOutput
    ): ErrorHandlerMap<TInput, TOutput> => {
      const handlers: ErrorHandlerMap<TInput, TOutput> = {
        NetworkError: Handlers.exponentialBackoff(1000, 30000, 3),
        TimeoutError: Handlers.exponentialBackoff(2000, 60000, 2),
        ExternalServiceError: Handlers.exponentialBackoff(1500, 45000, 3),
        DatabaseError: Handlers.exponentialBackoff(500, 10000, 2),
        default: Handlers.logAndRethrow(),
      };

      if (fallbackValue !== undefined) {
        handlers.ValidationError = Handlers.fallback(fallbackValue);
        handlers.ResourceError = Handlers.fallback(fallbackValue);
      }

      return handlers;
    };

    /**
     * API call pattern with circuit breaker support
     */
    export const apiCall = <TInput, TOutput>(
      fallbackFn?: (ctx: WorkflowContext<TInput>) => Promise<TOutput>
    ): ErrorHandlerMap<TInput, TOutput> => {
      const handlers: ErrorHandlerMap<TInput, TOutput> = {
        NetworkError: Handlers.conditionalRetry(
          (error) => NetworkError.is(error) && error.statusCode >= 500,
          3,
          2000
        ),
        TimeoutError: Handlers.exponentialBackoff(3000, 30000, 2),
        ExternalServiceError: Handlers.exponentialBackoff(2000, 60000, 3),
        ValidationError: Handlers.logAndRethrow(),
        default: Handlers.logAndRethrow(),
      };

      if (fallbackFn) {
        handlers.default = Handlers.circuitBreakerFallback(fallbackFn);
      }

      return handlers;
    };

    /**
     * Data processing pattern
     */
    export const dataProcessing = <TInput, TOutput>(
      onValidationError?: (error: ValidationError) => Promise<TOutput>
    ): ErrorHandlerMap<TInput, TOutput> => {
      const handlers: ErrorHandlerMap<TInput, TOutput> = {
        ValidationError: onValidationError 
          ? async (error, ctx) => onValidationError(error as ValidationError)
          : Handlers.logAndRethrow(),
        ResourceError: Handlers.logAndRethrow(), // Don't retry resource errors
        DatabaseError: Handlers.exponentialBackoff(1000, 15000, 2),
        default: Handlers.exponentialBackoff(1000, 10000, 2),
      };

      return handlers;
    };
  }

  /**
   * Error classification utilities
   */
  export namespace Classification {
    /**
     * Check if error is retryable
     */
    export const isRetryable = (error: Error): boolean => {
      if (error instanceof WorkflowError) {
        return error.retryable;
      }

      // Default classification for unknown errors
      return !isValidationError(error) && !isAuthenticationError(error);
    };

    /**
     * Check if error is recoverable
     */
    export const isRecoverable = (error: Error): boolean => {
      if (error instanceof WorkflowError) {
        return error.recoverable;
      }

      // Default classification
      return !isValidationError(error);
    };

    /**
     * Check if error is a validation error
     */
    export const isValidationError = (error: Error): boolean => {
      return ValidationError.is(error) || 
             error.message.toLowerCase().includes('validation') ||
             error.message.toLowerCase().includes('invalid');
    };

    /**
     * Check if error is an authentication error
     */
    export const isAuthenticationError = (error: Error): boolean => {
      return error.message.toLowerCase().includes('auth') ||
             error.message.toLowerCase().includes('unauthorized') ||
             error.message.toLowerCase().includes('forbidden');
    };

    /**
     * Check if error is a temporary failure
     */
    export const isTemporary = (error: Error): boolean => {
      if (NetworkError.is(error)) {
        return error.statusCode >= 500 || error.statusCode === 408 || error.statusCode === 429;
      }

      return TimeoutError.is(error) || 
             ExternalServiceError.is(error) ||
             DatabaseError.is(error);
    };

    /**
     * Get recommended retry delay for error
     */
    export const getRetryDelay = (error: Error, attempt: number): number => {
      if (NetworkError.is(error) && error.retryAfter) {
        return error.retryAfter * 1000; // Convert to milliseconds
      }

      if (TimeoutError.is(error)) {
        return Math.min(5000 * Math.pow(2, attempt - 1), 60000); // Longer delays for timeouts
      }

      if (ExternalServiceError.is(error)) {
        return Math.min(2000 * Math.pow(2, attempt - 1), 30000);
      }

      // Default exponential backoff
      return Math.min(1000 * Math.pow(2, attempt - 1), 15000);
    };
  }
}

export { ErrorHandling };