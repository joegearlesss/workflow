import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { WorkflowContext, WorkflowContextImpl } from './context';
import { DatabaseClient, Database } from './database';
import { ErrorHandling } from './error-handling';
import { Workflow } from './workflow';

describe('WorkflowContext', () => {
  beforeEach(async () => {
    await Workflow.initialize(':memory:');
  });

  afterEach(() => {
    DatabaseClient.close();
  });

  // Helper function to create workflow execution for testing
  const createTestExecution = async (executionId: string) => {
    // Create a workflow definition first
    const definition = await Database.WorkflowDefinition.create({
      name: `test-workflow-${executionId}`,
      version: '1.0.0',
      description: 'Test workflow definition',
      schema: { steps: [] },
      isActive: true
    });

    // Create the workflow execution
    return Database.WorkflowExecution.create({
      id: executionId,
      definitionId: definition.id,
      workflowName: 'test-workflow',
      status: 'running',
      input: {}
    });
  };

  describe('create', () => {
    test('should create workflow context with correct properties', () => {
      const context = WorkflowContext.create(
        'exec-123',
        'test-workflow',
        { input: 'test' },
        1,
        { metadata: 'test' }
      );

      expect(context.executionId).toBe('exec-123');
      expect(context.workflowName).toBe('test-workflow');
      expect(context.input).toEqual({ input: 'test' });
      expect(context.attempt).toBe(1);
      expect(context.metadata).toEqual({ metadata: 'test' });
    });
  });

  describe('step', () => {
    test('should execute step successfully and persist result', async () => {
      await createTestExecution('exec-step-1');
      const context = new WorkflowContextImpl('exec-step-1', 'test-workflow', {}, 1, {});

      const result = await context.step('test-step', async () => {
        return { output: 'step-result' };
      }).execute();

      expect(result).toEqual({ output: 'step-result' });

      // Verify step execution was persisted
      const stepExecution = await Database.StepExecution.findByExecutionAndStep(
        'exec-step-1',
        'test-step'
      );
      expect(stepExecution).toBeDefined();
      expect(stepExecution?.status).toBe('completed');
      expect(stepExecution?.output).toEqual({ output: 'step-result' });
    });

    test('should return cached result for completed step', async () => {
      await createTestExecution('exec-step-2');
      const context = new WorkflowContextImpl('exec-step-2', 'test-workflow', {}, 1, {});

      // First execution
      const result1 = await context.step('cached-step', async () => {
        return { output: 'first-run' };
      }).execute();

      // Second execution should return cached result
      const result2 = await context.step('cached-step', async () => {
        return { output: 'second-run' };
      }).execute();

      expect(result1).toEqual({ output: 'first-run' });
      expect(result2).toEqual({ output: 'first-run' }); // Should be cached
    });

    test('should handle step failure and retry', async () => {
      await createTestExecution('exec-step-3');
      const context = new WorkflowContextImpl('exec-step-3', 'test-workflow', {}, 1, {});
      let attempts = 0;

      try {
        await context.step('failing-step', async () => {
          attempts++;
          throw new Error('Step failed');
        }).execute();
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Step failed');
      }

      expect(attempts).toBe(1);

      // Verify step execution was persisted as retrying after first failure
      const stepExecution = await Database.StepExecution.findByExecutionAndStep(
        'exec-step-3',
        'failing-step'
      );
      expect(stepExecution?.status).toBe('retrying');
      expect(stepExecution?.attempt).toBe(1);
    });

    test('should handle error with error handlers', async () => {
      await createTestExecution('exec-step-4');
      const context = new WorkflowContextImpl('exec-step-4', 'test-workflow', {}, 1, {});

      const result = await context.step('error-handled-step', async () => {
        throw new ErrorHandling.ValidationError('Invalid data', 'field1');
      }).onError({
        ValidationError: async (error, ctx) => {
          return { fallback: true, error: error.message };
        },
      }).execute();

      expect(result).toEqual({ fallback: true, error: 'Invalid data' });

      // Verify step was marked as completed (error was handled)
      const stepExecution = await Database.StepExecution.findByExecutionAndStep(
        'exec-step-4',
        'error-handled-step'
      );
      expect(stepExecution?.status).toBe('completed');
    });

    test('should use default error handler when specific handler not found', async () => {
      await createTestExecution('exec-step-5');
      const context = new WorkflowContextImpl('exec-step-5', 'test-workflow', {}, 1, {});

      const result = await context.step('default-error-step', async () => {
        throw new Error('Unknown error');
      }).onError({
        ValidationError: async (error, ctx) => {
          return { handled: 'validation' };
        },
        default: async (error, ctx) => {
          return { handled: 'default', message: error.message };
        },
      }).execute();

      expect(result).toEqual({ handled: 'default', message: 'Unknown error' });
    });

    test('should use catch handler as fallback', async () => {
      await createTestExecution('exec-step-6');
      const context = new WorkflowContextImpl('exec-step-6', 'test-workflow', {}, 1, {});

      const result = await context.step('catch-step', async () => {
        throw new Error('Catch this');
      }).catch(async (error, ctx) => {
        return { caught: true, message: error.message };
      }).execute();

      expect(result).toEqual({ caught: true, message: 'Catch this' });
    });

    test('should handle circuit breaker configuration', async () => {
      await createTestExecution('exec-step-7');
      const context = new WorkflowContextImpl('exec-step-7', 'test-workflow', {}, 1, {});

      // This should work normally since circuit breaker starts closed
      const result = await context.step('circuit-step', async () => {
        return { success: true };
      }).withCircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 30000,
      }).execute();

      expect(result).toEqual({ success: true });
    });

    test('should handle step retry attempts', async () => {
      await createTestExecution('exec-step-8');
      const context = new WorkflowContextImpl('exec-step-8', 'test-workflow', {}, 1, {});

      // Create initial failed step
      await Database.StepExecution.create({
        executionId: 'exec-step-8',
        stepName: 'retry-step',
        status: 'failed',
        attempt: 1,
        maxAttempts: 3,
        input: {},
      });

      // Retry should increment attempt
      const result = await context.step('retry-step', async () => {
        return { retry: 'success' };
      }).execute();

      expect(result).toEqual({ retry: 'success' });

      const stepExecution = await Database.StepExecution.findByExecutionAndStep(
        'exec-step-8',
        'retry-step'
      );
      expect(stepExecution?.attempt).toBe(2);
      expect(stepExecution?.status).toBe('completed');
    });
  });

  describe('sleep', () => {
    test('should sleep for specified duration', async () => {
      await createTestExecution('exec-sleep-1');
      const context = new WorkflowContextImpl('exec-sleep-1', 'test-workflow', {}, 1, {});
      const startTime = Date.now();

      await context.sleep('test-sleep', 100);

      const endTime = Date.now();
      const elapsed = endTime - startTime;

      // Allow some tolerance for timing
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(200);

      // Verify sleep step was persisted
      const stepExecution = await Database.StepExecution.findByExecutionAndStep(
        'exec-sleep-1',
        'test-sleep'
      );
      expect(stepExecution).toBeDefined();
      expect(stepExecution?.status).toBe('completed');
      expect(stepExecution?.input).toEqual({ durationMs: 100 });
      expect(stepExecution?.output).toEqual({ sleptMs: 100 });
    });

    test('should skip sleep if already completed', async () => {
      await createTestExecution('exec-sleep-2');
      const context = new WorkflowContextImpl('exec-sleep-2', 'test-workflow', {}, 1, {});

      // First sleep
      await context.sleep('skip-sleep', 100);

      // Second sleep should be skipped (fast)
      const startTime = Date.now();
      await context.sleep('skip-sleep', 100);
      const endTime = Date.now();

      const elapsed = endTime - startTime;
      expect(elapsed).toBeLessThan(50); // Should be very fast since it's skipped
    });
  });

  describe('error matching', () => {
    test('should match error by name', async () => {
      await createTestExecution('exec-match-1');
      const context = new WorkflowContextImpl('exec-match-1', 'test-workflow', {}, 1, {});

      const customError = new Error('Custom error');
      customError.name = 'CustomError';

      const result = await context.step('match-by-name', async () => {
        throw customError;
      }).onError({
        CustomError: async (error, ctx) => {
          return { matched: 'by-name' };
        },
      }).execute();

      expect(result).toEqual({ matched: 'by-name' });
    });

    test('should match error by constructor name', async () => {
      await createTestExecution('exec-match-2');
      const context = new WorkflowContextImpl('exec-match-2', 'test-workflow', {}, 1, {});

      const result = await context.step('match-by-constructor', async () => {
        throw new ErrorHandling.NetworkError('Network failed', 500);
      }).onError({
        NetworkError: async (error, ctx) => {
          return { matched: 'by-constructor' };
        },
      }).execute();

      expect(result).toEqual({ matched: 'by-constructor' });
    });
  });

  describe('input handling', () => {
    test('should handle typed input correctly', () => {
      interface TestInput {
        userId: string;
        data: { value: number };
      }

      const testInput: TestInput = {
        userId: '123',
        data: { value: 42 },
      };

      const context = new WorkflowContextImpl<TestInput>(
        'exec-typed-1',
        'typed-workflow',
        testInput,
        1,
        {}
      );

      expect(context.input.userId).toBe('123');
      expect(context.input.data.value).toBe(42);
    });

    test('should handle undefined input', () => {
      const context = new WorkflowContextImpl(
        'exec-undefined-1',
        'undefined-workflow',
        undefined,
        1,
        {}
      );

      expect(context.input).toBeUndefined();
    });
  });
});