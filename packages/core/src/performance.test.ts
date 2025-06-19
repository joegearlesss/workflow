import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DatabaseClient } from './database';
import { StepCache, MemoCache } from './cache';
import { TestSetup } from '../tests/setup';

describe('Performance Optimizations', () => {
  beforeEach(async () => {
    await TestSetup.createTestDatabase();
  });

  afterEach(() => {
    TestSetup.closeTestDatabase();
    StepCache.clear();
    MemoCache.clear();
  });

  describe('Database Performance', () => {
    test('should track query performance metrics', async () => {
      // Clear metrics first
      DatabaseClient.clearCache();
      
      // Execute some queries
      DatabaseClient.raw('SELECT 1 as test');
      DatabaseClient.raw('SELECT 2 as test');
      DatabaseClient.raw('SELECT 3 as test');
      
      const metrics = DatabaseClient.getPerformanceMetrics();
      
      expect(metrics.totalQueries).toBe(3);
      expect(metrics.averageQueryTime).toBeGreaterThan(0);
      expect(metrics.totalTime).toBeGreaterThan(0);
    });

    test('should cache prepared statements', async () => {
      DatabaseClient.clearCache();
      
      const sql = 'SELECT ?1 as value';
      
      // First execution should create statement
      const result1 = DatabaseClient.raw(sql, [1]);
      expect(result1).toEqual([{ value: 1 }]);
      
      // Second execution should use cached statement
      const result2 = DatabaseClient.raw(sql, [2]);
      expect(result2).toEqual([{ value: 2 }]);
      
      const metrics = DatabaseClient.getPerformanceMetrics();
      expect(metrics.totalQueries).toBe(2);
    });

    test('should optimize database', () => {
      expect(() => DatabaseClient.optimize()).not.toThrow();
    });

    test('should provide database stats', () => {
      const stats = DatabaseClient.getStats();
      
      expect(stats.pageCount).toBeGreaterThan(0);
      expect(stats.pageSize).toBeGreaterThan(0);
      expect(stats.cacheSize).toBeGreaterThan(0);
      expect(stats.walMode).toBe(true);
    });
  });

  describe('Step Execution Cache', () => {
    test('should cache and retrieve step results', () => {
      const executionId = 'test-exec-1';
      const stepName = 'test-step';
      const input = { data: 'test' };
      const result = { output: 'result' };

      // Cache should be empty initially
      expect(StepCache.get(executionId, stepName, input)).toBeUndefined();

      // Set cache entry
      StepCache.set(executionId, stepName, result, input);

      // Should retrieve cached result
      expect(StepCache.get(executionId, stepName, input)).toEqual(result);
    });

    test('should handle cache expiration', async () => {
      const executionId = 'test-exec-2';
      const stepName = 'test-step';
      const result = { output: 'result' };
      const shortTtl = 10; // 10ms

      StepCache.set(executionId, stepName, result);

      // Should be available immediately
      expect(StepCache.get(executionId, stepName, undefined, shortTtl)).toEqual(result);

      // Wait for expiration
      await TestSetup.waitForAsync(20);

      // Should be expired
      expect(StepCache.get(executionId, stepName, undefined, shortTtl)).toBeUndefined();
    });

    test('should invalidate cache by execution', () => {
      const executionId = 'test-exec-3';
      
      StepCache.set(executionId, 'step-1', { result: 1 });
      StepCache.set(executionId, 'step-2', { result: 2 });
      StepCache.set('other-exec', 'step-1', { result: 3 });

      // Verify cache entries exist
      expect(StepCache.get(executionId, 'step-1')).toEqual({ result: 1 });
      expect(StepCache.get(executionId, 'step-2')).toEqual({ result: 2 });
      expect(StepCache.get('other-exec', 'step-1')).toEqual({ result: 3 });

      // Invalidate specific execution
      StepCache.invalidateExecution(executionId);

      // Execution cache should be cleared
      expect(StepCache.get(executionId, 'step-1')).toBeUndefined();
      expect(StepCache.get(executionId, 'step-2')).toBeUndefined();
      
      // Other execution should remain
      expect(StepCache.get('other-exec', 'step-1')).toEqual({ result: 3 });
    });

    test('should provide cache statistics', () => {
      StepCache.clear();
      
      StepCache.set('exec-1', 'step-1', { result: 1 });
      StepCache.set('exec-2', 'step-2', { result: 2 });
      
      // Access entries to increase access count
      StepCache.get('exec-1', 'step-1');
      StepCache.get('exec-1', 'step-1');
      StepCache.get('exec-2', 'step-2');

      const stats = StepCache.getStats();
      
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBeGreaterThan(0);
      expect(stats.totalAccesses).toBe(3);
      expect(stats.averageAccessCount).toBe(1.5);
    });

    test('should cleanup expired entries', async () => {
      StepCache.clear();
      
      const shortTtl = 10; // 10ms
      
      StepCache.set('exec-1', 'step-1', { result: 1 });
      StepCache.set('exec-2', 'step-2', { result: 2 });
      
      // Wait for expiration
      await TestSetup.waitForAsync(20);
      
      const cleaned = StepCache.cleanup(shortTtl);
      expect(cleaned).toBe(2);
      
      const stats = StepCache.getStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Memoization Cache', () => {
    test('should memoize function results', () => {
      let callCount = 0;
      
      const expensiveFunction = (x: number, y: number): number => {
        callCount++;
        return x + y;
      };

      const memoizedFunction = MemoCache.memoize(expensiveFunction);

      // First call should execute function
      expect(memoizedFunction(1, 2)).toBe(3);
      expect(callCount).toBe(1);

      // Second call with same args should use cache
      expect(memoizedFunction(1, 2)).toBe(3);
      expect(callCount).toBe(1);

      // Different args should execute function again
      expect(memoizedFunction(2, 3)).toBe(5);
      expect(callCount).toBe(2);
    });

    test('should use custom key generator', () => {
      let callCount = 0;
      
      const fn = (obj: { id: number; name: string }): string => {
        callCount++;
        return `${obj.id}-${obj.name}`;
      };

      // Use only id for cache key
      const memoizedFn = MemoCache.memoize(fn, (obj) => obj.id.toString());

      expect(memoizedFn({ id: 1, name: 'test1' })).toBe('1-test1');
      expect(callCount).toBe(1);

      // Different name but same ID should use cache
      expect(memoizedFn({ id: 1, name: 'test2' })).toBe('1-test1');
      expect(callCount).toBe(1);

      // Different ID should execute function
      expect(memoizedFn({ id: 2, name: 'test1' })).toBe('2-test1');
      expect(callCount).toBe(2);
    });

    test('should provide memoization stats', () => {
      MemoCache.clear();
      
      const fn = (x: number) => x * 2;
      const memoizedFn = MemoCache.memoize(fn);
      
      memoizedFn(1);
      memoizedFn(2);
      memoizedFn(3);
      
      const stats = MemoCache.getStats();
      expect(stats.size).toBe(3);
      expect(stats.maxSize).toBeGreaterThan(0);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should demonstrate caching performance benefits', async () => {
      const iterations = 100;
      
      // Simulate expensive computation
      const expensiveComputation = (n: number): number => {
        let result = 0;
        for (let i = 0; i < n * 1000; i++) {
          result += Math.sqrt(i);
        }
        return result;
      };
      
      // Benchmark without memoization
      const startUncached = performance.now();
      for (let i = 0; i < iterations; i++) {
        expensiveComputation(10);
      }
      const uncachedTime = performance.now() - startUncached;
      
      // Benchmark with memoization
      const memoizedComputation = MemoCache.memoize(expensiveComputation);
      const startCached = performance.now();
      for (let i = 0; i < iterations; i++) {
        memoizedComputation(10); // Same input, should be cached after first call
      }
      const cachedTime = performance.now() - startCached;
      
      // Cached version should be significantly faster
      expect(cachedTime).toBeLessThan(uncachedTime / 10);
      
      console.log(`Performance improvement: ${(uncachedTime / cachedTime).toFixed(2)}x faster with caching`);
    });
  });
});