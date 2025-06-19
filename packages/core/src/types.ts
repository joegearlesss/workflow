import type { z } from 'zod';

/**
 * Core workflow type definitions
 */

export type WorkflowHandler<TInput = unknown, TOutput = unknown> = (
  ctx: WorkflowContext<TInput>
) => Promise<TOutput>;

export type StepFunction<TInput = unknown, TOutput = unknown> = (
  input?: TInput
) => Promise<TOutput>;

export type StepResult<T = unknown> = {
  readonly success: true;
  readonly data: T;
} | {
  readonly success: false;
  readonly error: Error;
};

export type ErrorHandler<TInput = unknown, TOutput = unknown> = (
  error: Error,
  ctx: WorkflowContext<TInput>
) => Promise<TOutput>;

export type ErrorHandlerMap<TInput = unknown, TOutput = unknown> = {
  readonly [K: string]: ErrorHandler<TInput, TOutput>;
  readonly default?: ErrorHandler<TInput, TOutput>;
};

export interface CircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly resetTimeout: number;
  readonly onOpen?: (ctx: WorkflowContext) => Promise<void>;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly schema: Record<string, unknown>;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkflowExecution {
  readonly id: string;
  readonly definitionId: string;
  readonly workflowName: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled';
  readonly input?: Record<string, unknown>;
  readonly output?: Record<string, unknown>;
  readonly error?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StepExecution {
  readonly id: string;
  readonly executionId: string;
  readonly stepName: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'retrying';
  readonly input?: Record<string, unknown>;
  readonly output?: Record<string, unknown>;
  readonly error?: Record<string, unknown>;
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkflowContext<TInput = unknown> {
  readonly executionId: string;
  readonly workflowName: string;
  readonly input: TInput;
  readonly attempt: number;
  readonly metadata: Record<string, unknown>;
  
  step<TStepInput = unknown, TStepOutput = unknown>(
    name: string,
    fn: StepFunction<TStepInput, TStepOutput>
  ): StepBuilder<TStepInput, TStepOutput>;
  
  sleep(name: string, durationMs: number): Promise<void>;
}

export interface StepBuilder<TInput = unknown, TOutput = unknown> {
  onError(handlers: ErrorHandlerMap<TInput, TOutput>): StepBuilder<TInput, TOutput>;
  withCircuitBreaker(config: CircuitBreakerConfig): StepBuilder<TInput, TOutput>;
  catch<TFallback = TOutput>(
    handler: ErrorHandler<TInput, TFallback>
  ): StepBuilder<TInput, TOutput | TFallback>;
  execute(): Promise<TOutput>;
}

export interface WorkflowRetryConfig {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly exponentialBackoff: boolean;
}

export interface WorkflowStartOptions {
  readonly retry?: Partial<WorkflowRetryConfig>;
  readonly metadata?: Record<string, unknown>;
  readonly timeout?: number;
}