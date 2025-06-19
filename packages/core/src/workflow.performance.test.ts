import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Workflow } from './workflow';
import { DatabaseClient } from './database';
import type { WorkflowHandler } from './types';

describe('Workflow Performance', () => {
  beforeEach(async () => {
    await DatabaseClient.initialize(':memory:');
  });

  afterEach(() => {
    DatabaseClient.close();
  });

  describe('workflow definition', () => {
    test('should define workflows within 1ms', () => {
      const handler: WorkflowHandler = async (ctx) => ({ result: 'success' });

      const start = performance.now();
      Workflow.define('perf-test-define', handler);
      const end = performance.now();

      expect(end - start).toBeLessThan(1);
    });

    test('should define 100 workflows within 100ms', () => {
      const handler: WorkflowHandler = async (ctx) => ({ result: 'success' });

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        Workflow.define(`perf-bulk-${i}`, handler);
      }
      const end = performance.now();

      expect(end - start).toBeLessThan(100);
    });
  });

  describe('workflow execution', () => {
    test('should start simple workflow within 50ms', async () => {
      const handler: WorkflowHandler = async (ctx) => ({ result: 'fast' });
      Workflow.define('perf-fast-start', handler);

      const start = performance.now();
      const result = await Workflow.start('perf-fast-start', 'exec-fast-1');
      const end = performance.now();

      expect(result).toEqual({ result: 'fast' });
      expect(end - start).toBeLessThan(50);
    });

    test('should handle 10 concurrent executions within 500ms', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        // Simulate minimal work
        await new Promise(resolve => setTimeout(resolve, 10));
        return { result: `concurrent-${ctx.executionId}` };
      };
      
      Workflow.define('perf-concurrent', handler);

      const start = performance.now();
      const promises = Array.from({ length: 10 }, (_, i) =>
        Workflow.start('perf-concurrent', `exec-concurrent-${i}`)
      );
      
      const results = await Promise.all(promises);
      const end = performance.now();

      expect(results).toHaveLength(10);
      expect(end - start).toBeLessThan(500);
    });

    test('should complete workflow with 5 steps within 100ms', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        await ctx.step('step1', async () => ({ step: 1 }));
        await ctx.step('step2', async () => ({ step: 2 }));
        await ctx.step('step3', async () => ({ step: 3 }));
        await ctx.step('step4', async () => ({ step: 4 }));
        await ctx.step('step5', async () => ({ step: 5 }));
        return { steps: 5 };
      };

      Workflow.define('perf-multi-step', handler);

      const start = performance.now();
      const result = await Workflow.start('perf-multi-step', 'exec-multi-step-1');
      const end = performance.now();

      expect(result).toEqual({ steps: 5 });
      expect(end - start).toBeLessThan(100);
    });

    test('should resume workflow within 30ms', async () => {
      let attempts = 0;
      const handler: WorkflowHandler = async (ctx) => {
        attempts++;
        if (attempts === 1) {
          throw new Error('First attempt fails');
        }
        return { resumed: true };
      };

      Workflow.define('perf-resume', handler);

      // First execution should fail
      try {
        await Workflow.start('perf-resume', 'exec-resume-perf', undefined, {
          retry: { maxAttempts: 1, backoffMs: 1, exponentialBackoff: false },
        });
      } catch {
        // Expected to fail
      }

      const start = performance.now();
      const result = await Workflow.resume('exec-resume-perf');
      const end = performance.now();

      expect(result).toEqual({ resumed: true });
      expect(end - start).toBeLessThan(30);
    });
  });

  describe('workflow queries', () => {
    test('should get execution details within 10ms', async () => {
      const handler: WorkflowHandler = async (ctx) => ({ result: 'query-test' });
      Workflow.define('perf-query', handler);
      
      await Workflow.start('perf-query', 'exec-query-perf');

      const start = performance.now();
      const execution = await Workflow.getExecution('exec-query-perf');
      const end = performance.now();

      expect(execution).toBeDefined();
      expect(end - start).toBeLessThan(10);
    });

    test('should list executions within 20ms', async () => {
      const handler: WorkflowHandler = async (ctx) => ({ result: 'list-test' });
      Workflow.define('perf-list', handler);

      // Create multiple executions
      await Promise.all([
        Workflow.start('perf-list', 'exec-list-1'),
        Workflow.start('perf-list', 'exec-list-2'),
        Workflow.start('perf-list', 'exec-list-3'),
      ]);

      const start = performance.now();
      const executions = await Workflow.listExecutions('perf-list');
      const end = performance.now();

      expect(executions).toHaveLength(3);
      expect(end - start).toBeLessThan(20);
    });

    test('should list definitions within 15ms', async () => {
      // Create multiple definitions
      const handler: WorkflowHandler = async (ctx) => ({ result: 'def-test' });
      for (let i = 0; i < 5; i++) {
        Workflow.define(`perf-def-${i}`, handler);
      }

      // Allow time for database writes
      await new Promise(resolve => setTimeout(resolve, 50));

      const start = performance.now();
      const definitions = await Workflow.listDefinitions();
      const end = performance.now();

      expect(definitions.length).toBeGreaterThanOrEqual(5);
      expect(end - start).toBeLessThan(15);
    });
  });

  describe('error handling performance', () => {
    test('should handle workflow failure within 25ms', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        throw new Error('Performance test error');
      };

      Workflow.define('perf-error', handler);

      const start = performance.now();
      try {
        await Workflow.start('perf-error', 'exec-error-perf', undefined, {
          retry: { maxAttempts: 1, backoffMs: 1, exponentialBackoff: false },
        });
      } catch (error) {
        const end = performance.now();
        expect(error).toBeInstanceOf(Error);
        expect(end - start).toBeLessThan(25);
      }
    });

    test('should handle retry with exponential backoff efficiently', async () => {
      let attempts = 0;
      const handler: WorkflowHandler = async (ctx) => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry test error');
        }
        return { success: true };
      };

      Workflow.define('perf-retry', handler);

      const start = performance.now();
      const result = await Workflow.start('perf-retry', 'exec-retry-perf', undefined, {
        retry: { maxAttempts: 3, backoffMs: 1, exponentialBackoff: true },
      });
      const end = performance.now();

      expect(result).toEqual({ success: true });
      // Should complete quickly since backoff is very short
      expect(end - start).toBeLessThan(50);
    });
  });

  describe('memory usage', () => {
    test('should not leak memory when creating many workflows', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create many workflow definitions
      for (let i = 0; i < 1000; i++) {
        const handler: WorkflowHandler = async (ctx) => ({ id: i });
        Workflow.define(`memory-test-${i}`, handler);
      }

      // Force garbage collection if available
      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB for 1000 workflows)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });

    test('should handle workflow execution without significant memory growth', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        // Create some data structures
        const data = Array.from({ length: 100 }, (_, i) => ({ value: i }));
        return { processed: data.length };
      };

      Workflow.define('memory-execution-test', handler);

      const initialMemory = process.memoryUsage().heapUsed;

      // Execute workflow multiple times
      for (let i = 0; i < 100; i++) {
        await Workflow.start('memory-execution-test', `exec-memory-${i}`);
      }

      // Force garbage collection if available
      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 20MB for 100 executions)
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024);
    });
  });

  describe('database performance', () => {
    test('should handle database operations efficiently', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        // Workflow that creates database entries
        await ctx.step('db-step-1', async () => ({ db: 'operation1' }));
        await ctx.step('db-step-2', async () => ({ db: 'operation2' }));
        return { dbOps: 2 };
      };

      Workflow.define('perf-db', handler);

      const start = performance.now();
      await Workflow.start('perf-db', 'exec-db-perf');
      const end = performance.now();

      // Database operations should complete within reasonable time
      expect(end - start).toBeLessThan(100);
    });

    test('should maintain performance with multiple concurrent database operations', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        await ctx.step('concurrent-db-step', async () => ({ 
          timestamp: Date.now(),
          execution: ctx.executionId 
        }));
        return { completed: true };
      };

      Workflow.define('perf-concurrent-db', handler);

      const start = performance.now();
      const promises = Array.from({ length: 20 }, (_, i) =>
        Workflow.start('perf-concurrent-db', `exec-concurrent-db-${i}`)
      );

      await Promise.all(promises);
      const end = performance.now();

      // 20 concurrent workflows with DB operations should complete within reasonable time
      expect(end - start).toBeLessThan(1000);
    });
  });

  describe('throughput tests', () => {
    test('should achieve minimum workflow throughput', async () => {
      const handler: WorkflowHandler = async (ctx) => ({ 
        processed: true,
        timestamp: Date.now() 
      });

      Workflow.define('throughput-test', handler);

      const batchSize = 50;
      const start = performance.now();

      // Process workflows in batches to measure throughput
      const promises = Array.from({ length: batchSize }, (_, i) =>
        Workflow.start('throughput-test', `exec-throughput-${i}`)
      );

      await Promise.all(promises);
      const end = performance.now();

      const durationSeconds = (end - start) / 1000;
      const throughput = batchSize / durationSeconds;

      // Should achieve at least 10 workflows per second
      expect(throughput).toBeGreaterThan(10);
    });
  });
});