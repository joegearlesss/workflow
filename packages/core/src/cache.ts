/**
 * Step execution caching for improved performance
 */
namespace StepCache {
  interface CacheEntry<T> {
    value: T;
    timestamp: Date;
    accessCount: number;
    lastAccessed: Date;
  }

  // In-memory cache with LRU eviction
  const cache = new Map<string, CacheEntry<any>>();
  const maxCacheSize = 1000;
  const defaultTtlMs = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate cache key for step execution
   */
  const generateKey = (executionId: string, stepName: string, input?: any): string => {
    const inputHash = input ? JSON.stringify(input) : '';
    return `${executionId}:${stepName}:${inputHash}`;
  };

  /**
   * Check if cache entry is valid
   */
  const isValid = (entry: CacheEntry<any>, ttlMs = defaultTtlMs): boolean => {
    const now = Date.now();
    return (now - entry.timestamp.getTime()) < ttlMs;
  };

  /**
   * Evict least recently used entries
   */
  const evictLru = (): void => {
    if (cache.size <= maxCacheSize) return;

    // Sort by last accessed time and remove oldest entries
    const entries = Array.from(cache.entries()).sort((a, b) => 
      a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime()
    );

    const toRemove = entries.slice(0, cache.size - maxCacheSize);
    toRemove.forEach(([key]) => cache.delete(key));
  };

  /**
   * Get cached step result
   */
  export const get = <T>(
    executionId: string, 
    stepName: string, 
    input?: any,
    ttlMs = defaultTtlMs
  ): T | undefined => {
    const key = generateKey(executionId, stepName, input);
    const entry = cache.get(key);

    if (!entry || !isValid(entry, ttlMs)) {
      if (entry) {
        cache.delete(key); // Remove expired entry
      }
      return undefined;
    }

    // Update access metrics
    entry.accessCount++;
    entry.lastAccessed = new Date();

    return entry.value as T;
  };

  /**
   * Set cached step result
   */
  export const set = <T>(
    executionId: string,
    stepName: string,
    value: T,
    input?: any
  ): void => {
    const key = generateKey(executionId, stepName, input);
    const now = new Date();

    cache.set(key, {
      value,
      timestamp: now,
      accessCount: 0,
      lastAccessed: now,
    });

    evictLru();
  };

  /**
   * Invalidate cache for specific execution
   */
  export const invalidateExecution = (executionId: string): void => {
    const keysToDelete = Array.from(cache.keys()).filter(key => 
      key.startsWith(`${executionId}:`)
    );
    
    keysToDelete.forEach(key => cache.delete(key));
  };

  /**
   * Invalidate cache for specific step across all executions
   */
  export const invalidateStep = (stepName: string): void => {
    const keysToDelete = Array.from(cache.keys()).filter(key => 
      key.includes(`:${stepName}:`)
    );
    
    keysToDelete.forEach(key => cache.delete(key));
  };

  /**
   * Clear all cached entries
   */
  export const clear = (): void => {
    cache.clear();
  };

  /**
   * Get cache statistics
   */
  export const getStats = (): {
    size: number;
    maxSize: number;
    hitRatio: number;
    totalAccesses: number;
    averageAccessCount: number;
  } => {
    const entries = Array.from(cache.values());
    const totalAccesses = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    
    return {
      size: cache.size,
      maxSize: maxCacheSize,
      hitRatio: totalAccesses > 0 ? cache.size / totalAccesses : 0,
      totalAccesses,
      averageAccessCount: cache.size > 0 ? totalAccesses / cache.size : 0,
    };
  };

  /**
   * Clean up expired entries
   */
  export const cleanup = (ttlMs = defaultTtlMs): number => {
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of cache.entries()) {
      if (!isValid(entry, ttlMs)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => cache.delete(key));
    return keysToDelete.length;
  };

  /**
   * Start automatic cleanup interval
   */
  export const startCleanupInterval = (intervalMs = 60000): NodeJS.Timeout => {
    return setInterval(() => {
      const cleaned = cleanup();
      if (cleaned > 0) {
        console.debug(`StepCache: Cleaned up ${cleaned} expired entries`);
      }
    }, intervalMs);
  };
}

/**
 * Simple result memoization cache for expensive computations
 */
namespace MemoCache {
  const memoCache = new Map<string, any>();
  const maxMemoSize = 500;

  /**
   * Memoize function results
   */
  export const memoize = <T extends (...args: any[]) => any>(
    fn: T,
    keyGenerator?: (...args: Parameters<T>) => string
  ): T => {
    const generateKey = keyGenerator || ((...args) => JSON.stringify(args));

    return ((...args: Parameters<T>) => {
      const key = generateKey(...args);
      
      if (memoCache.has(key)) {
        return memoCache.get(key);
      }

      const result = fn(...args);
      
      // Evict oldest entries if cache is full
      if (memoCache.size >= maxMemoSize) {
        const firstKey = memoCache.keys().next().value;
        if (firstKey !== undefined) {
          memoCache.delete(firstKey);
        }
      }
      
      memoCache.set(key, result);
      return result;
    }) as T;
  };

  /**
   * Clear memoization cache
   */
  export const clear = (): void => {
    memoCache.clear();
  };

  /**
   * Get memoization cache stats
   */
  export const getStats = (): { size: number; maxSize: number } => {
    return {
      size: memoCache.size,
      maxSize: maxMemoSize,
    };
  };
}

export { StepCache, MemoCache };