import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';

/**
 * Database client configuration and connection management
 */
namespace DatabaseClient {
  let db: ReturnType<typeof drizzle> | undefined;
  let sqlite: Database | undefined;
  
  // Performance tracking
  const queryMetrics = {
    totalQueries: 0,
    totalTime: 0,
    slowQueries: [] as Array<{ sql: string; duration: number; timestamp: Date }>,
  };
  
  // Prepared statement cache
  const statementCache = new Map<string, any>();
  const maxCacheSize = 100;

  /**
   * Initialize database connection with Bun SQLite client
   * @param dbPath - Path to SQLite database file
   * @returns Drizzle database instance
   */
  export const initialize = (dbPath = './workflow.db'): ReturnType<typeof drizzle> => {
    if (db) {
      return db;
    }

    sqlite = new Database(dbPath, { create: true });
    
    // Enable WAL mode for better concurrency and performance
    sqlite.exec('PRAGMA journal_mode = WAL');
    sqlite.exec('PRAGMA synchronous = NORMAL');
    sqlite.exec('PRAGMA cache_size = -64000'); // 64MB cache
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec('PRAGMA temp_store = MEMORY');
    sqlite.exec('PRAGMA mmap_size = 268435456'); // 256MB memory map
    sqlite.exec('PRAGMA page_size = 4096'); // Larger page size for better performance
    sqlite.exec('PRAGMA busy_timeout = 30000'); // 30 second busy timeout

    db = drizzle(sqlite, { schema });
    return db;
  };

  /**
   * Get the current database instance
   * @returns Drizzle database instance
   * @throws Error if database is not initialized
   */
  export const getDatabase = (): ReturnType<typeof drizzle> => {
    if (!db) {
      throw new Error('Database not initialized. Call DatabaseClient.initialize() first.');
    }
    return db;
  };

  /**
   * Run database migrations
   * @param migrationsFolder - Path to migrations folder
   */
  export const runMigrations = async (migrationsFolder = './src/database/migrations'): Promise<void> => {
    const database = getDatabase();
    await migrate(database, { migrationsFolder });
  };

  /**
   * Close database connection and clear caches
   */
  export const close = (): void => {
    if (sqlite) {
      sqlite.close();
      sqlite = undefined;
      db = undefined;
    }
    
    // Clear caches and reset metrics
    statementCache.clear();
    queryMetrics.totalQueries = 0;
    queryMetrics.totalTime = 0;
    queryMetrics.slowQueries.length = 0;
  };

  /**
   * Execute raw SQL query with performance tracking and caching
   * @param sql - SQL query string
   * @param params - Query parameters
   * @returns Query results
   */
  export const raw = <T = unknown>(sql: string, params?: unknown[]): T[] => {
    if (!sqlite) {
      throw new Error('Database not initialized');
    }
    
    const startTime = performance.now();
    
    // Try to get cached prepared statement
    let stmt = statementCache.get(sql);
    if (!stmt) {
      stmt = sqlite.prepare(sql);
      
      // Cache the statement if we have room
      if (statementCache.size < maxCacheSize) {
        statementCache.set(sql, stmt);
      }
    }
    
    const result = params ? stmt.all(...params) as T[] : stmt.all() as T[];
    
    // Track performance metrics
    const duration = performance.now() - startTime;
    queryMetrics.totalQueries++;
    queryMetrics.totalTime += duration;
    
    // Track slow queries (> 50ms)
    if (duration > 50) {
      queryMetrics.slowQueries.push({
        sql: sql.substring(0, 100), // Truncate for logging
        duration,
        timestamp: new Date(),
      });
      
      // Keep only the last 50 slow queries
      if (queryMetrics.slowQueries.length > 50) {
        queryMetrics.slowQueries.shift();
      }
    }
    
    return result;
  };

  /**
   * Begin database transaction
   * @param fn - Function to execute within transaction
   * @returns Transaction result
   */
  export const transaction = async <T>(
    fn: (tx: ReturnType<typeof drizzle>) => Promise<T>
  ): Promise<T> => {
    const database = getDatabase();
    return database.transaction(fn);
  };

  /**
   * Check if database is healthy
   * @returns True if database is responsive
   */
  export const healthCheck = (): boolean => {
    try {
      if (!sqlite) return false;
      
      // Simple query to test database responsiveness
      const result = sqlite.prepare('SELECT 1 as test').get();
      return result !== undefined;
    } catch {
      return false;
    }
  };

  /**
   * Get database statistics
   * @returns Database statistics object
   */
  export const getStats = (): {
    pageCount: number;
    pageSize: number;
    freeListCount: number;
    cacheSize: number;
    walMode: boolean;
  } => {
    if (!sqlite) {
      throw new Error('Database not initialized');
    }

    const pageCount = sqlite.prepare('PRAGMA page_count').get() as { page_count: number };
    const pageSize = sqlite.prepare('PRAGMA page_size').get() as { page_size: number };
    const freeListCount = sqlite.prepare('PRAGMA freelist_count').get() as { freelist_count: number };
    const cacheSize = sqlite.prepare('PRAGMA cache_size').get() as { cache_size: number };
    const journalMode = sqlite.prepare('PRAGMA journal_mode').get() as { journal_mode: string };

    return {
      pageCount: pageCount.page_count,
      pageSize: pageSize.page_size,
      freeListCount: freeListCount.freelist_count,
      cacheSize: Math.abs(cacheSize.cache_size), // Can be negative
      walMode: journalMode.journal_mode === 'wal',
    };
  };

  /**
   * Get query performance metrics
   * @returns Performance metrics object
   */
  export const getPerformanceMetrics = (): {
    totalQueries: number;
    averageQueryTime: number;
    totalTime: number;
    slowQueries: Array<{ sql: string; duration: number; timestamp: Date }>;
    cacheHitRatio: number;
  } => {
    return {
      totalQueries: queryMetrics.totalQueries,
      averageQueryTime: queryMetrics.totalQueries > 0 
        ? queryMetrics.totalTime / queryMetrics.totalQueries 
        : 0,
      totalTime: queryMetrics.totalTime,
      slowQueries: [...queryMetrics.slowQueries],
      cacheHitRatio: statementCache.size > 0 
        ? (queryMetrics.totalQueries - statementCache.size) / queryMetrics.totalQueries 
        : 0,
    };
  };

  /**
   * Clear performance metrics and statement cache
   */
  export const clearCache = (): void => {
    statementCache.clear();
    queryMetrics.totalQueries = 0;
    queryMetrics.totalTime = 0;
    queryMetrics.slowQueries.length = 0;
  };

  /**
   * Optimize database for performance
   */
  export const optimize = (): void => {
    if (!sqlite) {
      throw new Error('Database not initialized');
    }
    
    // Run VACUUM to defragment and reclaim space
    sqlite.exec('VACUUM');
    
    // Analyze tables for better query planning
    sqlite.exec('ANALYZE');
    
    // Update table statistics
    sqlite.exec('PRAGMA optimize');
  };
}

export { DatabaseClient };