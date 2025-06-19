import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { CircuitBreaker, CircuitBreakerRegistry, CircuitBreakerUtils } from './circuit-breaker';
import { DatabaseClient } from './database';

describe('CircuitBreaker Performance', () => {
  beforeEach(async () => {
    await DatabaseClient.initialize(':memory:');
    CircuitBreakerRegistry.clear();
  });

  afterEach(() => {
    DatabaseClient.close();
    CircuitBreakerRegistry.clear();
  });

  describe('circuit breaker creation performance', () => {
    test('should create circuit breaker within 1ms', () => {
      const config = {
        name: 'perf-test-create',
        failureThreshold: 5,
        resetTimeout: 30000,
      };

      const start = performance.now();
      const circuitBreaker = CircuitBreaker.create(config);
      const end = performance.now();

      expect(circuitBreaker).toBeDefined();
      expect(end - start).toBeLessThan(1);
    });

    test('should create 100 circuit breakers within 50ms', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        CircuitBreaker.create({
          name: `perf-bulk-${i}`,
          failureThreshold: 5,
          resetTimeout: 30000,
        });
      }
      
      const end = performance.now();

      expect(end - start).toBeLessThan(50);
    });
  });

  describe('circuit breaker execution performance', () => {
    test('should execute operation within 10ms when circuit is closed', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'perf-execute-closed',
        failureThreshold: 5,
        resetTimeout: 30000,
      });

      const operation = async () => ({ result: 'success' });

      const start = performance.now();
      const result = await circuitBreaker.execute(operation);
      const end = performance.now();

      expect(result).toEqual({ result: 'success' });
      expect(end - start).toBeLessThan(10);
    });

    test('should handle circuit breaker state checks efficiently', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'perf-state-check',
        failureThreshold: 3,
        resetTimeout: 30000,
      });

      const operation = async () => ({ check: 'state' });

      const start = performance.now();
      
      // Execute multiple operations to trigger state checks
      for (let i = 0; i < 10; i++) {
        await circuitBreaker.execute(operation);
      }
      
      const end = performance.now();

      expect(end - start).toBeLessThan(50);
    });

    test('should handle failure recording efficiently', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'perf-failure-recording',
        failureThreshold: 10,
        resetTimeout: 30000,
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      const start = performance.now();
      
      // Execute multiple failures to test recording performance
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch {
          // Expected to fail
        }
      }
      
      const end = performance.now();

      expect(end - start).toBeLessThan(100);
    });

    test('should handle circuit opening efficiently', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'perf-circuit-open',
        failureThreshold: 2,
        resetTimeout: 30000,
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      const start = performance.now();
      
      // Trigger circuit to open
      try {
        await circuitBreaker.execute(failingOperation);
      } catch {}
      try {
        await circuitBreaker.execute(failingOperation);
      } catch {}
      
      // This should be blocked by open circuit
      try {
        await circuitBreaker.execute(failingOperation);
      } catch {}
      
      const end = performance.now();

      expect(end - start).toBeLessThan(75);
    });
  });

  describe('fallback performance', () => {
    test('should execute fallback efficiently when circuit is open', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'perf-fallback',
        failureThreshold: 1,
        resetTimeout: 30000,
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      const fallback = async () => ({ fallback: 'result' });

      // Open the circuit
      try {
        await circuitBreaker.execute(failingOperation);
      } catch {}

      const start = performance.now();
      const result = await circuitBreaker.execute(failingOperation, fallback);
      const end = performance.now();

      expect(result).toEqual({ fallback: 'result' });
      expect(end - start).toBeLessThan(5);
    });

    test('should handle multiple fallback executions efficiently', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'perf-multiple-fallback',
        failureThreshold: 1,
        resetTimeout: 30000,
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      const fallback = async () => ({ fallback: 'fast' });

      // Open the circuit
      try {
        await circuitBreaker.execute(failingOperation);
      } catch {}

      const start = performance.now();
      
      // Execute multiple fallbacks
      const promises = Array.from({ length: 20 }, (_, i) =>
        circuitBreaker.execute(failingOperation, fallback)
      );
      
      await Promise.all(promises);
      const end = performance.now();

      expect(end - start).toBeLessThan(50);
    });
  });

  describe('state transition performance', () => {
    test('should handle half-open transition efficiently', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'perf-half-open',
        failureThreshold: 1,
        resetTimeout: 10, // Very short for testing
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Open the circuit
      try {
        await circuitBreaker.execute(failingOperation);
      } catch {}

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 15));

      const start = performance.now();
      
      // This should transition to half-open and execute
      try {
        await circuitBreaker.execute(failingOperation);
      } catch {}
      
      const end = performance.now();

      expect(end - start).toBeLessThan(20);
    });

    test('should handle success after half-open efficiently', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'perf-half-open-success',
        failureThreshold: 1,
        resetTimeout: 10,
      });

      let shouldFail = true;
      const conditionalOperation = async () => {
        if (shouldFail) {
          throw new Error('Operation failed');
        }
        return { success: true };
      };

      // Open the circuit
      try {
        await circuitBreaker.execute(conditionalOperation);
      } catch {}

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 15));

      // Make operation succeed
      shouldFail = false;

      const start = performance.now();
      const result = await circuitBreaker.execute(conditionalOperation);
      const end = performance.now();

      expect(result).toEqual({ success: true });
      expect(end - start).toBeLessThan(15);
    });
  });

  describe('registry performance', () => {
    test('should handle registry operations efficiently', () => {
      const start = performance.now();
      
      // Create multiple circuit breakers through registry
      for (let i = 0; i < 50; i++) {
        CircuitBreakerRegistry.getOrCreate({
          name: `registry-perf-${i}`,
          failureThreshold: 5,
          resetTimeout: 30000,
        });
      }
      
      // Access existing circuit breakers
      for (let i = 0; i < 50; i++) {
        CircuitBreakerRegistry.get(`registry-perf-${i}`);
      }
      
      // List all circuit breakers
      CircuitBreakerRegistry.list();
      
      const end = performance.now();

      expect(end - start).toBeLessThan(25);
    });

    test('should handle registry cleanup efficiently', () => {
      // Populate registry
      for (let i = 0; i < 100; i++) {
        CircuitBreakerRegistry.getOrCreate({
          name: `cleanup-perf-${i}`,
          failureThreshold: 5,
          resetTimeout: 30000,
        });
      }

      const start = performance.now();
      
      // Remove half of them
      for (let i = 0; i < 50; i++) {
        CircuitBreakerRegistry.remove(`cleanup-perf-${i}`);
      }
      
      // Clear the rest
      CircuitBreakerRegistry.clear();
      
      const end = performance.now();

      expect(end - start).toBeLessThan(10);
    });
  });

  describe('utility functions performance', () => {
    test('should create utility configurations within 0.1ms', () => {
      const start = performance.now();
      
      CircuitBreakerUtils.fastFail('fast-fail-perf');
      CircuitBreakerUtils.resilient('resilient-perf');
      CircuitBreakerUtils.sensitive('sensitive-perf');
      CircuitBreakerUtils.withFallback('fallback-perf', { fallback: 'value' });
      
      const end = performance.now();

      expect(end - start).toBeLessThan(0.1);
    });

    test('should create 100 utility configurations efficiently', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        CircuitBreakerUtils.fastFail(`fast-fail-${i}`);
        CircuitBreakerUtils.resilient(`resilient-${i}`);
        CircuitBreakerUtils.sensitive(`sensitive-${i}`);
        CircuitBreakerUtils.withFallback(`fallback-${i}`, { value: i });
      }
      
      const end = performance.now();

      expect(end - start).toBeLessThan(10);
    });
  });

  describe('database operations performance', () => {
    test('should handle database state operations efficiently', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'perf-db-ops',
        failureThreshold: 3,
        resetTimeout: 30000,
      });

      const operation = async () => ({ db: 'operation' });

      const start = performance.now();
      
      // Multiple operations that will update database state
      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation);
      await circuitBreaker.execute(operation);
      
      const end = performance.now();

      expect(end - start).toBeLessThan(75);
    });

    test('should handle concurrent database operations efficiently', async () => {
      const start = performance.now();
      
      // Create multiple circuit breakers concurrently
      const promises = Array.from({ length: 10 }, (_, i) => {
        const circuitBreaker = CircuitBreaker.create({
          name: `perf-concurrent-db-${i}`,
          failureThreshold: 5,
          resetTimeout: 30000,
        });
        
        return circuitBreaker.execute(async () => ({ concurrent: i }));
      });
      
      await Promise.all(promises);
      const end = performance.now();

      expect(end - start).toBeLessThan(200);
    });

    test('should handle statistics retrieval efficiently', async () => {
      // Create some circuit breaker state
      const circuitBreaker = CircuitBreaker.create({
        name: 'perf-stats',
        failureThreshold: 3,
        resetTimeout: 30000,
      });

      await circuitBreaker.execute(async () => ({ stats: 'test' }));

      const start = performance.now();
      const stats = await circuitBreaker.getStatistics();
      const end = performance.now();

      expect(stats).toBeDefined();
      expect(end - start).toBeLessThan(10);
    });
  });

  describe('memory usage', () => {
    test('should not leak memory with many circuit breakers', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create many circuit breakers
      for (let i = 0; i < 200; i++) {
        CircuitBreaker.create({
          name: `memory-test-${i}`,
          failureThreshold: 5,
          resetTimeout: 30000,
        });
      }

      // Force garbage collection if available
      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 5MB for 200 circuit breakers)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });

    test('should not leak memory with operation executions', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'memory-execution-test',
        failureThreshold: 10,
        resetTimeout: 30000,
      });

      const initialMemory = process.memoryUsage().heapUsed;

      // Execute many operations
      for (let i = 0; i < 100; i++) {
        await circuitBreaker.execute(async () => {
          // Create some temporary data
          const data = Array.from({ length: 50 }, (_, j) => ({ id: j, value: `data-${j}` }));
          return { processed: data.length };
        });
      }

      // Force garbage collection if available
      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 10MB for 100 executions)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });
  });

  describe('throughput tests', () => {
    test('should achieve minimum operation throughput', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'throughput-test',
        failureThreshold: 100,
        resetTimeout: 30000,
      });

      const operationCount = 100;
      const operation = async () => ({ 
        processed: true,
        timestamp: Date.now() 
      });

      const start = performance.now();
      
      const promises = Array.from({ length: operationCount }, (_, i) =>
        circuitBreaker.execute(operation)
      );
      
      await Promise.all(promises);
      const end = performance.now();

      const durationSeconds = (end - start) / 1000;
      const throughput = operationCount / durationSeconds;

      // Should achieve at least 200 operations per second
      expect(throughput).toBeGreaterThan(200);
    });

    test('should maintain throughput with failures', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'failure-throughput-test',
        failureThreshold: 1000, // High threshold to avoid opening
        resetTimeout: 30000,
      });

      const operationCount = 50;

      const start = performance.now();
      
      const promises = Array.from({ length: operationCount }, (_, i) =>
        circuitBreaker.execute(async () => {
          if (i % 3 === 0) {
            throw new Error('Planned failure');
          }
          return { success: true, index: i };
        }).catch(() => ({ failed: true, index: i }))
      );
      
      await Promise.all(promises);
      const end = performance.now();

      const durationSeconds = (end - start) / 1000;
      const throughput = operationCount / durationSeconds;

      // Should achieve at least 100 operations per second even with failures
      expect(throughput).toBeGreaterThan(100);
    });

    test('should handle state transitions efficiently under load', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'state-transition-throughput',
        failureThreshold: 5,
        resetTimeout: 50,
      });

      const start = performance.now();

      // Cause failures to open circuit
      for (let i = 0; i < 6; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Failure');
          });
        } catch {}
      }

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 60));

      // Execute success to close circuit
      await circuitBreaker.execute(async () => ({ success: true }));

      const end = performance.now();

      // Complete state transition cycle should be efficient
      expect(end - start).toBeLessThan(200);
    });
  });
});