import { DatabaseClient } from '../src/database';

export namespace TestSetup {
  let testDbCounter = 0;
  const activeDatabases = new Set<string>();
  const dbLocks = new Map<string, Promise<void>>();

  export const createTestDatabase = async (): Promise<string> => {
    // Use process ID and timestamp for better uniqueness across parallel processes
    const uniqueId = `${process.pid}_${Date.now()}_${testDbCounter++}_${Math.random().toString(36).substr(2, 9)}`;
    const dbPath = `:memory:${uniqueId}`;
    activeDatabases.add(dbPath);
    
    // Ensure database initialization is atomic
    const initPromise = initializeDatabase(dbPath);
    dbLocks.set(dbPath, initPromise);
    
    await initPromise;
    
    return dbPath;
  };

  const initializeDatabase = async (dbPath: string): Promise<void> => {
    const db = DatabaseClient.initialize(dbPath);
    
    // Create the database schema manually since we don't have migrations
    await createSchema();
    
    // Wait for initialization to complete
    await new Promise(resolve => setTimeout(resolve, 5));
  };

  const createSchema = async (): Promise<void> => {
    const sql = `
      CREATE TABLE IF NOT EXISTS workflow_definitions (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT UNIQUE NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0.0',
        description TEXT,
        schema TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workflow_executions (
        id TEXT PRIMARY KEY NOT NULL,
        definition_id TEXT NOT NULL,
        workflow_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        input TEXT,
        output TEXT,
        error TEXT,
        metadata TEXT,
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (definition_id) REFERENCES workflow_definitions(id)
      );

      CREATE TABLE IF NOT EXISTS step_executions (
        id TEXT PRIMARY KEY NOT NULL,
        execution_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        input TEXT,
        output TEXT,
        error TEXT,
        attempt INTEGER NOT NULL DEFAULT 1,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (execution_id) REFERENCES workflow_executions(id)
      );

      CREATE TABLE IF NOT EXISTS circuit_breaker_states (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT UNIQUE NOT NULL,
        state TEXT NOT NULL DEFAULT 'closed',
        failure_count INTEGER NOT NULL DEFAULT 0,
        last_failure_at INTEGER,
        next_attempt_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workflow_locks (
        id TEXT PRIMARY KEY NOT NULL,
        execution_id TEXT UNIQUE NOT NULL,
        lock_key TEXT NOT NULL,
        acquired_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        metadata TEXT,
        FOREIGN KEY (execution_id) REFERENCES workflow_executions(id)
      );
    `;

    // Split and execute each CREATE TABLE statement separately
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        DatabaseClient.raw(statement.trim());
      }
    }
  };

  export const closeTestDatabase = (dbPath?: string): void => {
    if (dbPath) {
      activeDatabases.delete(dbPath);
    }
    
    try {
      // Clear all data from tables before closing
      clearAllTables();
      DatabaseClient.close();
    } catch (error) {
      // Ignore close errors in tests
    }
  };

  const clearAllTables = (): void => {
    try {
      DatabaseClient.raw('DELETE FROM workflow_locks');
      DatabaseClient.raw('DELETE FROM step_executions');
      DatabaseClient.raw('DELETE FROM workflow_executions');
      DatabaseClient.raw('DELETE FROM circuit_breaker_states');
      DatabaseClient.raw('DELETE FROM workflow_definitions');
    } catch (error) {
      // Ignore clear errors
    }
  };

  export const cleanupAllDatabases = (): void => {
    for (const dbPath of activeDatabases) {
      activeDatabases.delete(dbPath);
    }
    
    try {
      DatabaseClient.close();
    } catch (error) {
      // Ignore close errors
    }
  };

  export const withTestDatabase = async <T>(
    testFn: () => Promise<T>
  ): Promise<T> => {
    const dbPath = await createTestDatabase();
    
    try {
      return await testFn();
    } finally {
      closeTestDatabase(dbPath);
    }
  };

  export const createTestData = {
    workflowDefinition: (overrides: any = {}) => {
      const uniqueId = `${process.pid}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        name: `test-workflow-${uniqueId}`,
        version: '1.0.0',
        description: 'Test workflow definition',
        schema: { type: 'object' },
        isActive: true,
        ...overrides,
      };
    },

    workflowExecution: (overrides: any = {}) => {
      const uniqueId = `${process.pid}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        id: `test-exec-${uniqueId}`,
        definitionId: 'test-def-id',
        workflowName: 'test-workflow',
        status: 'pending' as const,
        input: { test: 'data' },
        metadata: {},
        ...overrides,
      };
    },

    stepExecution: (overrides: any = {}) => {
      const uniqueId = `${process.pid}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        executionId: 'test-exec-id',
        stepName: `test-step-${uniqueId}`,
        status: 'pending' as const,
        attempt: 1,
        maxAttempts: 3,
        input: { test: 'input' },
        ...overrides,
      };
    },

    circuitBreaker: (overrides: any = {}) => {
      const uniqueId = `${process.pid}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        name: `test-circuit-${uniqueId}`,
        ...overrides,
      };
    },
  };

  export const waitForAsync = (ms: number = 50): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  export const retry = async <T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 100
  ): Promise<T> => {
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxAttempts) {
          await waitForAsync(delay);
        }
      }
    }
    
    throw lastError || new Error('Retry failed');
  };
}