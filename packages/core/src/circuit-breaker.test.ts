import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { CircuitBreaker, CircuitBreakerRegistry, CircuitBreakerUtils } from './circuit-breaker';
import { DatabaseClient, Database } from './database';

describe('CircuitBreaker', () => {
  beforeEach(async () => {
    await DatabaseClient.initialize(':memory:');
    CircuitBreakerRegistry.clear();
  });

  afterEach(() => {
    DatabaseClient.close();
    CircuitBreakerRegistry.clear();
  });

  describe('create', () => {
    test('should create circuit breaker instance', () => {
      const config = {
        name: 'test-circuit',
        failureThreshold: 5,
        resetTimeout: 30000,
      };

      const circuitBreaker = CircuitBreaker.create(config);
      expect(circuitBreaker).toBeDefined();
    });
  });

  describe('CircuitBreaker instance', () => {
    test('should execute operation successfully when circuit is closed', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'test-success',
        failureThreshold: 3,
        resetTimeout: 30000,
      });

      const operation = async () => ({ result: 'success' });
      const result = await circuitBreaker.execute(operation);

      expect(result).toEqual({ result: 'success' });
    });

    test('should record failure and open circuit after threshold', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'test-failure',
        failureThreshold: 2,
        resetTimeout: 30000,
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // First failure
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');
      
      // Second failure should open circuit
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');

      // Third attempt should be blocked by open circuit
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow(
        'Circuit breaker \'test-failure\' is open'
      );

      const state = await circuitBreaker.getState();
      expect(state).toBe('open');
    });

    test('should use fallback when circuit is open', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'test-fallback',
        failureThreshold: 1,
        resetTimeout: 30000,
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      const fallback = async () => ({ fallback: 'result' });

      // Trigger circuit to open
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');

      // Next call should use fallback
      const result = await circuitBreaker.execute(failingOperation, fallback);
      expect(result).toEqual({ fallback: 'result' });
    });

    test('should transition to half-open after reset timeout', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'test-half-open',
        failureThreshold: 1,
        resetTimeout: 100, // Short timeout for testing
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Open the circuit
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');
      
      expect(await circuitBreaker.getState()).toBe('open');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Next execution should transition to half-open and allow the call
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');
      
      // Circuit should be open again after failure in half-open state
      expect(await circuitBreaker.getState()).toBe('open');
    });

    test('should close circuit after successful execution in half-open state', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'test-close',
        failureThreshold: 1,
        resetTimeout: 100,
      });

      let shouldFail = true;
      const conditionalOperation = async () => {
        if (shouldFail) {
          throw new Error('Operation failed');
        }
        return { result: 'success' };
      };

      // Open the circuit
      await expect(circuitBreaker.execute(conditionalOperation)).rejects.toThrow('Operation failed');
      expect(await circuitBreaker.getState()).toBe('open');

      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));

      // Make operation succeed
      shouldFail = false;

      // Should succeed and close circuit
      const result = await circuitBreaker.execute(conditionalOperation);
      expect(result).toEqual({ result: 'success' });
      expect(await circuitBreaker.getState()).toBe('closed');
    });

    test('should reset failure count on success in closed state', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'test-reset-failures',
        failureThreshold: 3,
        resetTimeout: 30000,
      });

      let shouldFail = true;
      const conditionalOperation = async () => {
        if (shouldFail) {
          throw new Error('Operation failed');
        }
        return { result: 'success' };
      };

      // Two failures (below threshold)
      await expect(circuitBreaker.execute(conditionalOperation)).rejects.toThrow('Operation failed');
      await expect(circuitBreaker.execute(conditionalOperation)).rejects.toThrow('Operation failed');

      // Success should reset failure count
      shouldFail = false;
      await circuitBreaker.execute(conditionalOperation);

      // Start failing again - should need 3 failures to open (not 1)
      shouldFail = true;
      await expect(circuitBreaker.execute(conditionalOperation)).rejects.toThrow('Operation failed');
      await expect(circuitBreaker.execute(conditionalOperation)).rejects.toThrow('Operation failed');
      
      // Circuit should still be closed after 2 failures
      expect(await circuitBreaker.getState()).toBe('closed');
    });

    test('should call onOpen callback when circuit opens', async () => {
      let onOpenCalled = false;
      const circuitBreaker = CircuitBreaker.create({
        name: 'test-on-open',
        failureThreshold: 1,
        resetTimeout: 30000,
        onOpen: async () => {
          onOpenCalled = true;
        },
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Open circuit - should call onOpen callback
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');
      
      // Try to execute when circuit is open
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow(
        'Circuit breaker \'test-on-open\' is open'
      );

      expect(onOpenCalled).toBe(true);
    });

    test('should handle onOpen callback errors gracefully', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'test-on-open-error',
        failureThreshold: 1,
        resetTimeout: 30000,
        onOpen: async () => {
          throw new Error('Callback failed');
        },
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Open circuit
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');
      
      // Should still throw circuit breaker error despite callback failure
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow(
        'Circuit breaker \'test-on-open-error\' is open'
      );
    });

    test('should reset circuit breaker manually', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'test-manual-reset',
        failureThreshold: 1,
        resetTimeout: 30000,
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Open circuit
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');
      expect(await circuitBreaker.getState()).toBe('open');

      // Manual reset
      await circuitBreaker.reset();
      expect(await circuitBreaker.getState()).toBe('closed');

      // Should be able to execute again
      const successOperation = async () => ({ result: 'success' });
      const result = await circuitBreaker.execute(successOperation);
      expect(result).toEqual({ result: 'success' });
    });

    test('should provide circuit breaker statistics', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'test-statistics',
        failureThreshold: 2,
        resetTimeout: 30000,
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Execute and fail once
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');

      const stats = await circuitBreaker.getStatistics();
      expect(stats.state).toBe('closed');
      expect(stats.failureCount).toBe(1);
      expect(stats.lastFailureAt).toBeDefined();
    });
  });

  describe('CircuitBreakerRegistry', () => {
    test('should get or create circuit breaker instances', () => {
      const config = {
        name: 'registry-test',
        failureThreshold: 3,
        resetTimeout: 30000,
      };

      const instance1 = CircuitBreakerRegistry.getOrCreate(config);
      const instance2 = CircuitBreakerRegistry.getOrCreate(config);

      expect(instance1).toBe(instance2); // Should return same instance
    });

    test('should get existing circuit breaker', () => {
      const config = {
        name: 'get-test',
        failureThreshold: 3,
        resetTimeout: 30000,
      };

      const created = CircuitBreakerRegistry.getOrCreate(config);
      const retrieved = CircuitBreakerRegistry.get('get-test');

      expect(retrieved).toBe(created);
    });

    test('should return undefined for non-existent circuit breaker', () => {
      const retrieved = CircuitBreakerRegistry.get('non-existent');
      expect(retrieved).toBeUndefined();
    });

    test('should remove circuit breaker from registry', () => {
      const config = {
        name: 'remove-test',
        failureThreshold: 3,
        resetTimeout: 30000,
      };

      CircuitBreakerRegistry.getOrCreate(config);
      const removed = CircuitBreakerRegistry.remove('remove-test');
      expect(removed).toBe(true);

      const retrieved = CircuitBreakerRegistry.get('remove-test');
      expect(retrieved).toBeUndefined();
    });

    test('should list all registered circuit breakers', () => {
      const config1 = { name: 'list-test-1', failureThreshold: 3, resetTimeout: 30000 };
      const config2 = { name: 'list-test-2', failureThreshold: 3, resetTimeout: 30000 };

      CircuitBreakerRegistry.getOrCreate(config1);
      CircuitBreakerRegistry.getOrCreate(config2);

      const list = CircuitBreakerRegistry.list();
      expect(list).toContain('list-test-1');
      expect(list).toContain('list-test-2');
    });

    test('should clear all circuit breakers', () => {
      const config = {
        name: 'clear-test',
        failureThreshold: 3,
        resetTimeout: 30000,
      };

      CircuitBreakerRegistry.getOrCreate(config);
      CircuitBreakerRegistry.clear();

      const list = CircuitBreakerRegistry.list();
      expect(list).toHaveLength(0);
    });
  });

  describe('CircuitBreakerUtils', () => {
    test('should create fast-fail configuration', () => {
      const config = CircuitBreakerUtils.fastFail('fast-fail-test');

      expect(config.name).toBe('fast-fail-test');
      expect(config.failureThreshold).toBe(5);
      expect(config.resetTimeout).toBe(30000);
      expect(config.successThreshold).toBe(2);
    });

    test('should create resilient configuration', () => {
      const config = CircuitBreakerUtils.resilient('resilient-test');

      expect(config.name).toBe('resilient-test');
      expect(config.failureThreshold).toBe(10);
      expect(config.resetTimeout).toBe(60000);
      expect(config.successThreshold).toBe(5);
    });

    test('should create sensitive configuration', () => {
      const config = CircuitBreakerUtils.sensitive('sensitive-test');

      expect(config.name).toBe('sensitive-test');
      expect(config.failureThreshold).toBe(3);
      expect(config.resetTimeout).toBe(15000);
      expect(config.successThreshold).toBe(1);
    });

    test('should create configuration with fallback', () => {
      const config = CircuitBreakerUtils.withFallback('fallback-test', { fallback: 'value' });

      expect(config.name).toBe('fallback-test');
      expect(config.failureThreshold).toBe(5);
      expect(config.resetTimeout).toBe(30000);
      expect(config.successThreshold).toBe(3);
      expect(config.onOpen).toBeDefined();
    });

    test('should merge custom config with fallback defaults', () => {
      const config = CircuitBreakerUtils.withFallback(
        'custom-fallback-test',
        { fallback: 'value' },
        { failureThreshold: 10, resetTimeout: 60000 }
      );

      expect(config.failureThreshold).toBe(10);
      expect(config.resetTimeout).toBe(60000);
      expect(config.successThreshold).toBe(3); // Default
    });
  });

  describe('global functions', () => {
    test('should get circuit breaker statistics', async () => {
      // Create a circuit breaker state in database
      await Database.CircuitBreaker.getOrCreate('stats-test');

      const stats = await CircuitBreaker.getStatistics('stats-test');
      expect(stats).toBeDefined();
      expect(stats?.state).toBe('closed');
      expect(stats?.failureCount).toBe(0);
    });

    test('should return undefined for non-existent circuit breaker statistics', async () => {
      const stats = await CircuitBreaker.getStatistics('non-existent-stats');
      expect(stats).toBeUndefined();
    });

    test('should reset circuit breaker globally', async () => {
      // Create and modify a circuit breaker state
      await Database.CircuitBreaker.getOrCreate('global-reset-test');
      await Database.CircuitBreaker.update('global-reset-test', {
        state: 'open',
        failureCount: 5,
      });

      const resetResult = await CircuitBreaker.reset('global-reset-test');
      expect(resetResult).toBe(true);

      const state = await Database.CircuitBreaker.getOrCreate('global-reset-test');
      expect(state.state).toBe('closed');
      expect(state.failureCount).toBe(0);
    });

    test('should return false when resetting non-existent circuit breaker', async () => {
      const resetResult = await CircuitBreaker.reset('non-existent-reset');
      expect(resetResult).toBe(false);
    });

    test('should list all circuit breakers (placeholder)', async () => {
      const list = await CircuitBreaker.listAll();
      expect(Array.isArray(list)).toBe(true);
      // Currently returns empty array as implementation is placeholder
      expect(list).toHaveLength(0);
    });
  });

  describe('state transitions', () => {
    test('should notify state change listeners', async () => {
      const stateChanges: Array<{ state: string; name: string }> = [];
      
      const circuitBreaker = CircuitBreaker.create({
        name: 'state-listener-test',
        failureThreshold: 1,
        resetTimeout: 100,
        stateChangeListener: (state, name) => {
          stateChanges.push({ state, name });
        },
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Should trigger state change to 'open'
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');

      expect(stateChanges).toHaveLength(1);
      expect(stateChanges[0]).toEqual({ state: 'open', name: 'state-listener-test' });
    });

    test('should handle state change listener errors gracefully', async () => {
      const circuitBreaker = CircuitBreaker.create({
        name: 'listener-error-test',
        failureThreshold: 1,
        resetTimeout: 30000,
        stateChangeListener: () => {
          throw new Error('Listener failed');
        },
      });

      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Should not throw despite listener error
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('Operation failed');
      expect(await circuitBreaker.getState()).toBe('open');
    });
  });
});