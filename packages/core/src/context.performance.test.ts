import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { WorkflowContextImpl } from './context';
import { DatabaseClient, Database } from './database';
import { ErrorHandling } from './error-handling';
import { Workflow } from './workflow';

describe('WorkflowContext Performance', () => {
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

  describe('step execution performance', () => {
    test('should execute simple step within 5ms', async () => {
      await createTestExecution('exec-perf-1');
      const context = new WorkflowContextImpl('exec-perf-1', 'test-workflow', {}, 1, {});

      const start = performance.now();
      const result = await context.step('fast-step', async () => {
        return { result: 'fast' };
      }).execute();
      const end = performance.now();

      expect(result).toEqual({ result: 'fast' });
      expect(end - start).toBeLessThan(5);
    });

    test('should handle step caching efficiently', async () => {
      await createTestExecution('exec-perf-2');
      const context = new WorkflowContextImpl('exec-perf-2', 'test-workflow', {}, 1, {});

      // First execution
      await context.step('cached-step', async () => {
        return { data: 'cached' };
      }).execute();

      // Second execution should be much faster (cached)
      const start = performance.now();
      const result = await context.step('cached-step', async () => {
        return { data: 'should-not-execute' };
      }).execute();
      const end = performance.now();

      expect(result).toEqual({ data: 'cached' });
      expect(end - start).toBeLessThan(2); // Should be very fast due to caching
    });

    test('should execute 20 sequential steps within 100ms', async () => {
      await createTestExecution('exec-perf-3');
      const context = new WorkflowContextImpl('exec-perf-3', 'test-workflow', {}, 1, {});

      const start = performance.now();
      for (let i = 0; i < 20; i++) {
        await context.step(`step-${i}`, async () => {
          return { stepNumber: i };
        }).execute();
      }
      const end = performance.now();

      expect(end - start).toBeLessThan(100);
    });

    test('should handle step failure efficiently', async () => {
      await createTestExecution('exec-perf-4');
      const context = new WorkflowContextImpl('exec-perf-4', 'test-workflow', {}, 1, {});

      const start = performance.now();
      try {
        await context.step('failing-step', async () => {
          throw new Error('Performance test error');
        }).execute();
      } catch (error) {
        const end = performance.now();
        expect(error).toBeInstanceOf(Error);
        expect(end - start).toBeLessThan(10);
      }
    });
  });

  describe('error handling performance', () => {
    test('should handle error with error handlers within 10ms', async () => {
      await createTestExecution('exec-perf-5');
      const context = new WorkflowContextImpl('exec-perf-5', 'test-workflow', {}, 1, {});

      const start = performance.now();
      const result = await context.step('error-handled-step', async () => {
        throw new ErrorHandling.ValidationError('Test error', 'field');
      }).onError({
        ValidationError: async (error, ctx) => {
          return { handled: true, error: error.message };
        },
      }).execute();
      const end = performance.now();

      expect(result).toEqual({ handled: true, error: 'Test error' });
      expect(end - start).toBeLessThan(10);
    });

    test('should handle complex error hierarchy efficiently', async () => {
      await createTestExecution('exec-perf-6');
      const context = new WorkflowContextImpl('exec-perf-6', 'test-workflow', {}, 1, {});

      const start = performance.now();
      const result = await context.step('complex-error-step', async () => {
        throw new ErrorHandling.NetworkError('Network failed', 500);
      }).onError({
        NetworkError: async (error, ctx) => ({ network: 'handled' }),
        ExternalServiceError: async (error, ctx) => ({ service: 'handled' }),
        DatabaseError: async (error, ctx) => ({ database: 'handled' }),
        ValidationError: async (error, ctx) => ({ validation: 'handled' }),
        TimeoutError: async (error, ctx) => ({ timeout: 'handled' }),
        default: async (error, ctx) => ({ default: 'handled' }),
      }).execute();
      const end = performance.now();

      expect(result).toEqual({ network: 'handled' });
      expect(end - start).toBeLessThan(15);
    });

    test('should handle catch handler efficiently', async () => {
      await createTestExecution('exec-perf-7');
      const context = new WorkflowContextImpl('exec-perf-7', 'test-workflow', {}, 1, {});

      const start = performance.now();
      const result = await context.step('catch-step', async () => {
        throw new Error('Caught error');
      }).catch(async (error, ctx) => {
        return { caught: true, message: error.message };
      }).execute();
      const end = performance.now();

      expect(result).toEqual({ caught: true, message: 'Caught error' });
      expect(end - start).toBeLessThan(8);
    });
  });

  describe('circuit breaker performance', () => {
    test('should handle circuit breaker checks efficiently', async () => {
      await createTestExecution('exec-perf-8');
      const context = new WorkflowContextImpl('exec-perf-8', 'test-workflow', {}, 1, {});

      const start = performance.now();
      const result = await context.step('circuit-step', async () => {
        return { circuit: 'success' };
      }).withCircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 30000,
      }).execute();
      const end = performance.now();

      expect(result).toEqual({ circuit: 'success' });
      expect(end - start).toBeLessThan(15);
    });

    test('should handle circuit breaker state updates efficiently', async () => {
      await createTestExecution('exec-perf-9');
      const context = new WorkflowContextImpl('exec-perf-9', 'test-workflow', {}, 1, {});

      // Execute multiple times to trigger circuit breaker logic
      const start = performance.now();
      for (let i = 0; i < 3; i++) {
        await context.step(`circuit-step-${i}`, async () => {
          return { iteration: i };
        }).withCircuitBreaker({
          failureThreshold: 10,
          resetTimeout: 30000,
        }).execute();
      }
      const end = performance.now();

      expect(end - start).toBeLessThan(50);
    });
  });

  describe('sleep performance', () => {
    test('should handle sleep efficiently', async () => {
      await createTestExecution('exec-perf-10');
      const context = new WorkflowContextImpl('exec-perf-10', 'test-workflow', {}, 1, {});

      const start = performance.now();
      await context.sleep('perf-sleep', 10);
      const end = performance.now();

      // Sleep should take approximately the specified time (10ms) plus minimal overhead
      expect(end - start).toBeGreaterThanOrEqual(8);
      expect(end - start).toBeLessThan(25);
    });

    test('should handle cached sleep efficiently', async () => {
      await createTestExecution('exec-perf-11');
      const context = new WorkflowContextImpl('exec-perf-11', 'test-workflow', {}, 1, {});

      // First sleep
      await context.sleep('cached-sleep', 10);

      // Second sleep should be cached and very fast
      const start = performance.now();
      await context.sleep('cached-sleep', 10);
      const end = performance.now();

      expect(end - start).toBeLessThan(2); // Should be very fast due to caching
    });

    test('should handle multiple sleep operations efficiently', async () => {
      await createTestExecution('exec-perf-12');
      const context = new WorkflowContextImpl('exec-perf-12', 'test-workflow', {}, 1, {});

      const start = performance.now();
      await Promise.all([
        context.sleep('sleep-1', 5),
        context.sleep('sleep-2', 5),
        context.sleep('sleep-3', 5),
      ]);
      const end = performance.now();

      // Parallel sleeps should complete in roughly the time of the longest sleep
      expect(end - start).toBeGreaterThanOrEqual(3);
      expect(end - start).toBeLessThan(20);
    });
  });

  describe('memory usage', () => {
    test('should not leak memory with many step executions', async () => {
      await createTestExecution('exec-memory-1');
      const context = new WorkflowContextImpl('exec-memory-1', 'test-workflow', {}, 1, {});
      const initialMemory = process.memoryUsage().heapUsed;

      // Execute many steps
      for (let i = 0; i < 100; i++) {
        await context.step(`memory-step-${i}`, async () => {
          // Create some temporary data
          const data = Array.from({ length: 100 }, (_, j) => ({ id: j, value: `data-${j}` }));
          return { processed: data.length };
        }).execute();
      }

      // Force garbage collection if available
      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB for 100 steps)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    test('should handle error handlers without memory leaks', async () => {
      await createTestExecution('exec-memory-2');
      const context = new WorkflowContextImpl('exec-memory-2', 'test-workflow', {}, 1, {});
      const initialMemory = process.memoryUsage().heapUsed;

      // Execute many error-handling scenarios
      for (let i = 0; i < 50; i++) {
        await context.step(`error-memory-step-${i}`, async () => {
          if (i % 2 === 0) {
            throw new ErrorHandling.NetworkError('Network error', 500);
          }
          return { success: true };
        }).onError({
          NetworkError: async (error, ctx) => ({ handled: 'network' }),
          default: async (error, ctx) => ({ handled: 'default' }),
        }).execute();
      }

      // Force garbage collection if available
      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 5MB for 50 error scenarios)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });
  });

  describe('database interaction performance', () => {
    test('should handle step persistence efficiently', async () => {
      await createTestExecution('exec-db-perf-1');
      const context = new WorkflowContextImpl('exec-db-perf-1', 'test-workflow', {}, 1, {});

      const start = performance.now();
      await context.step('db-persist-step', async () => {
        return { 
          data: Array.from({ length: 50 }, (_, i) => ({ id: i, value: `item-${i}` }))
        };
      }).execute();
      const end = performance.now();

      // Step with database persistence should complete within reasonable time
      expect(end - start).toBeLessThan(25);
    });

    test('should handle concurrent step executions efficiently', async () => {
      await createTestExecution('exec-db-perf-2');
      await createTestExecution('exec-db-perf-3');
      await createTestExecution('exec-db-perf-4');
      const context1 = new WorkflowContextImpl('exec-db-perf-2', 'test-workflow', {}, 1, {});
      const context2 = new WorkflowContextImpl('exec-db-perf-3', 'test-workflow', {}, 1, {});
      const context3 = new WorkflowContextImpl('exec-db-perf-4', 'test-workflow', {}, 1, {});

      const start = performance.now();
      await Promise.all([
        context1.step('concurrent-step-1', async () => ({ id: 1 })).execute(),
        context2.step('concurrent-step-2', async () => ({ id: 2 })).execute(),
        context3.step('concurrent-step-3', async () => ({ id: 3 })).execute(),
      ]);
      const end = performance.now();

      // Concurrent step executions should complete efficiently
      expect(end - start).toBeLessThan(50);
    });

    test('should handle step retry with database updates efficiently', async () => {
      await createTestExecution('exec-db-perf-5');
      const context = new WorkflowContextImpl('exec-db-perf-5', 'test-workflow', {}, 1, {});

      let attempts = 0;
      const start = performance.now();
      
      try {
        await context.step('retry-db-step', async () => {
          attempts++;
          throw new Error('Retry test');
        }).execute();
      } catch {
        // Expected to fail
      }

      // Second attempt (retry)
      const result = await context.step('retry-db-step', async () => {
        return { retried: true, attempts };
      }).execute();
      
      const end = performance.now();

      expect(result).toEqual({ retried: true, attempts: 1 });
      expect(end - start).toBeLessThan(30);
    });
  });

  describe('throughput tests', () => {
    test('should achieve minimum step execution throughput', async () => {
      await createTestExecution('exec-throughput-1');
      const context = new WorkflowContextImpl('exec-throughput-1', 'test-workflow', {}, 1, {});
      const stepCount = 50;

      const start = performance.now();
      const promises = Array.from({ length: stepCount }, (_, i) =>
        context.step(`throughput-step-${i}`, async () => ({ 
          index: i, 
          timestamp: Date.now() 
        })).execute()
      );

      await Promise.all(promises);
      const end = performance.now();

      const durationSeconds = (end - start) / 1000;
      const throughput = stepCount / durationSeconds;

      // Should achieve at least 100 steps per second
      expect(throughput).toBeGreaterThan(100);
    });

    test('should maintain performance with error handling throughput', async () => {
      await createTestExecution('exec-throughput-2');
      const context = new WorkflowContextImpl('exec-throughput-2', 'test-workflow', {}, 1, {});
      const stepCount = 30;

      const start = performance.now();
      const promises = Array.from({ length: stepCount }, (_, i) =>
        context.step(`error-throughput-step-${i}`, async () => {
          if (i % 3 === 0) {
            throw new ErrorHandling.ValidationError('Validation error', 'field');
          }
          return { index: i };
        }).onError({
          ValidationError: async (error, ctx) => ({ handled: true, index: i }),
        }).execute()
      );

      await Promise.all(promises);
      const end = performance.now();

      const durationSeconds = (end - start) / 1000;
      const throughput = stepCount / durationSeconds;

      // Should achieve at least 50 error-handled steps per second
      expect(throughput).toBeGreaterThan(50);
    });
  });
});