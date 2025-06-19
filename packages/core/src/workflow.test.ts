import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Workflow } from './workflow';
import { DatabaseClient, Database } from './database';
import type { WorkflowHandler, WorkflowContext } from './types';

describe('Workflow', () => {
  beforeEach(async () => {
    // Initialize in-memory database for testing
    await DatabaseClient.initialize(':memory:');
  });

  afterEach(() => {
    // Clean up database connection
    DatabaseClient.close();
  });

  describe('define', () => {
    test('should define a new workflow successfully', () => {
      const handler: WorkflowHandler = async (ctx) => {
        return { result: 'success' };
      };

      expect(() => {
        Workflow.define('test-workflow', handler, {
          version: '1.0.0',
          description: 'Test workflow',
        });
      }).not.toThrow();
    });

    test('should throw error when defining duplicate workflow', () => {
      const handler: WorkflowHandler = async (ctx) => {
        return { result: 'success' };
      };

      Workflow.define('duplicate-workflow', handler);

      expect(() => {
        Workflow.define('duplicate-workflow', handler);
      }).toThrow('Workflow \'duplicate-workflow\' is already defined');
    });

    test('should use default version when not specified', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        return { result: 'success' };
      };

      Workflow.define('version-test', handler);

      // Allow time for async database operation
      await new Promise(resolve => setTimeout(resolve, 10));

      const definition = await Database.WorkflowDefinition.findByName('version-test');
      expect(definition?.version).toBe('1.0.0');
    });
  });

  describe('start', () => {
    test('should start workflow execution successfully', async () => {
      const handler: WorkflowHandler<{ input: string }, { output: string }> = async (ctx) => {
        return { output: `processed-${ctx.input.input}` };
      };

      Workflow.define('start-test', handler);

      const result = await Workflow.start('start-test', 'exec-1', { input: 'test-data' });

      expect(result).toEqual({ output: 'processed-test-data' });
    });

    test('should throw error for undefined workflow', async () => {
      await expect(
        Workflow.start('undefined-workflow', 'exec-1')
      ).rejects.toThrow('Workflow \'undefined-workflow\' is not defined');
    });

    test('should return cached result for completed execution', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        return { result: 'first-run' };
      };

      Workflow.define('cache-test', handler);

      // First execution
      const result1 = await Workflow.start('cache-test', 'exec-cache-1');
      expect(result1).toEqual({ result: 'first-run' });

      // Second execution with same ID should return cached result
      const result2 = await Workflow.start('cache-test', 'exec-cache-1');
      expect(result2).toEqual({ result: 'first-run' });
    });

    test('should throw error for already running execution', async () => {
      // Create a workflow execution that's marked as running
      await Database.WorkflowExecution.create({
        id: 'running-exec',
        definitionId: 'test-def-id',
        workflowName: 'test-workflow',
        status: 'running',
      });

      const handler: WorkflowHandler = async (ctx) => {
        return { result: 'success' };
      };

      Workflow.define('running-test', handler);

      await expect(
        Workflow.start('running-test', 'running-exec')
      ).rejects.toThrow('Workflow execution \'running-exec\' is already running');
    });

    test('should handle workflow execution with retry config', async () => {
      let attempts = 0;
      const handler: WorkflowHandler = async (ctx) => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Temporary failure');
        }
        return { result: 'success-after-retry' };
      };

      Workflow.define('retry-test', handler);

      const result = await Workflow.start('retry-test', 'exec-retry-1', undefined, {
        retry: {
          maxAttempts: 3,
          backoffMs: 100,
          exponentialBackoff: false,
        },
      });

      expect(result).toEqual({ result: 'success-after-retry' });
      expect(attempts).toBe(2);
    });

    test('should fail after max retry attempts', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        throw new Error('Persistent failure');
      };

      Workflow.define('fail-test', handler);

      await expect(
        Workflow.start('fail-test', 'exec-fail-1', undefined, {
          retry: {
            maxAttempts: 2,
            backoffMs: 10,
            exponentialBackoff: false,
          },
        })
      ).rejects.toThrow('Persistent failure');

      // Check that execution is marked as failed
      const execution = await Database.WorkflowExecution.findById('exec-fail-1');
      expect(execution?.status).toBe('failed');
    });
  });

  describe('resume', () => {
    test('should resume a failed workflow execution', async () => {
      let attempts = 0;
      const handler: WorkflowHandler = async (ctx) => {
        attempts++;
        if (attempts === 1) {
          throw new Error('First attempt fails');
        }
        return { result: 'resumed-success' };
      };

      Workflow.define('resume-test', handler);

      // First execution should fail
      await expect(
        Workflow.start('resume-test', 'exec-resume-1', undefined, {
          retry: { maxAttempts: 1, backoffMs: 10, exponentialBackoff: false },
        })
      ).rejects.toThrow('First attempt fails');

      // Resume should succeed
      const result = await Workflow.resume('exec-resume-1');
      expect(result).toEqual({ result: 'resumed-success' });
      expect(attempts).toBe(2);
    });

    test('should return cached result for completed execution on resume', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        return { result: 'completed' };
      };

      Workflow.define('resume-completed-test', handler);

      // Complete execution
      const result1 = await Workflow.start('resume-completed-test', 'exec-resume-completed');
      expect(result1).toEqual({ result: 'completed' });

      // Resume should return same result
      const result2 = await Workflow.resume('exec-resume-completed');
      expect(result2).toEqual({ result: 'completed' });
    });

    test('should throw error for non-existent execution', async () => {
      await expect(
        Workflow.resume('non-existent-exec')
      ).rejects.toThrow('Workflow execution \'non-existent-exec\' not found');
    });
  });

  describe('cancel', () => {
    test('should cancel a running workflow execution', async () => {
      // Create a running execution
      await Database.WorkflowExecution.create({
        id: 'cancel-exec',
        definitionId: 'test-def',
        workflowName: 'test-workflow',
        status: 'running',
      });

      const result = await Workflow.cancel('cancel-exec');
      expect(result).toBe(true);

      const execution = await Database.WorkflowExecution.findById('cancel-exec');
      expect(execution?.status).toBe('cancelled');
      expect(execution?.completedAt).toBeDefined();
    });

    test('should return false for non-existent execution', async () => {
      const result = await Workflow.cancel('non-existent');
      expect(result).toBe(false);
    });

    test('should return false for already completed execution', async () => {
      await Database.WorkflowExecution.create({
        id: 'completed-exec',
        definitionId: 'test-def',
        workflowName: 'test-workflow',
        status: 'completed',
      });

      const result = await Workflow.cancel('completed-exec');
      expect(result).toBe(false);
    });
  });

  describe('getExecution', () => {
    test('should return workflow execution details', async () => {
      const testExecution = await Database.WorkflowExecution.create({
        id: 'get-exec-test',
        definitionId: 'test-def',
        workflowName: 'test-workflow',
        status: 'completed',
        input: { test: 'input' },
        output: { test: 'output' },
      });

      const execution = await Workflow.getExecution('get-exec-test');
      expect(execution).toBeDefined();
      expect(execution?.id).toBe('get-exec-test');
      expect(execution?.status).toBe('completed');
      expect(execution?.input).toEqual({ test: 'input' });
      expect(execution?.output).toEqual({ test: 'output' });
    });

    test('should return undefined for non-existent execution', async () => {
      const execution = await Workflow.getExecution('non-existent');
      expect(execution).toBeUndefined();
    });
  });

  describe('listExecutions', () => {
    test('should list executions by workflow name', async () => {
      await Database.WorkflowExecution.create({
        id: 'list-exec-1',
        definitionId: 'test-def',
        workflowName: 'list-test-workflow',
        status: 'completed',
      });

      await Database.WorkflowExecution.create({
        id: 'list-exec-2',
        definitionId: 'test-def',
        workflowName: 'list-test-workflow',
        status: 'failed',
      });

      const executions = await Workflow.listExecutions('list-test-workflow');
      expect(executions).toHaveLength(2);
      expect(executions.map(e => e.id)).toContain('list-exec-1');
      expect(executions.map(e => e.id)).toContain('list-exec-2');
    });

    test('should filter executions by status', async () => {
      await Database.WorkflowExecution.create({
        id: 'filter-exec-1',
        definitionId: 'test-def',
        workflowName: 'filter-test-workflow',
        status: 'completed',
      });

      await Database.WorkflowExecution.create({
        id: 'filter-exec-2',
        definitionId: 'test-def',
        workflowName: 'filter-test-workflow',
        status: 'failed',
      });

      const completedExecutions = await Workflow.listExecutions('filter-test-workflow', 'completed');
      expect(completedExecutions).toHaveLength(1);
      expect(completedExecutions[0]?.id).toBe('filter-exec-1');
    });
  });

  describe('listDefinitions', () => {
    test('should list active workflow definitions', async () => {
      await Database.WorkflowDefinition.create({
        name: 'active-workflow-1',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      await Database.WorkflowDefinition.create({
        name: 'active-workflow-2',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      await Database.WorkflowDefinition.create({
        name: 'inactive-workflow',
        version: '1.0.0',
        schema: {},
        isActive: false,
      });

      const definitions = await Workflow.listDefinitions();
      expect(definitions).toHaveLength(2);
      expect(definitions.map(d => d.name)).toContain('active-workflow-1');
      expect(definitions.map(d => d.name)).toContain('active-workflow-2');
      expect(definitions.map(d => d.name)).not.toContain('inactive-workflow');
    });
  });

  describe('resumeInterrupted', () => {
    test('should resume interrupted workflow executions', async () => {
      let resumed = false;
      const handler: WorkflowHandler = async (ctx) => {
        resumed = true;
        return { result: 'resumed' };
      };

      Workflow.define('interrupted-test', handler);

      // Create an interrupted execution
      await Database.WorkflowExecution.create({
        id: 'interrupted-exec',
        definitionId: 'test-def',
        workflowName: 'interrupted-test',
        status: 'running',
      });

      const resumedCount = await Workflow.resumeInterrupted();
      expect(resumedCount).toBe(1);
      expect(resumed).toBe(true);

      const execution = await Database.WorkflowExecution.findById('interrupted-exec');
      expect(execution?.status).toBe('completed');
    });

    test('should mark failed resumes as failed', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        throw new Error('Resume failed');
      };

      Workflow.define('failed-resume-test', handler);

      await Database.WorkflowExecution.create({
        id: 'failed-resume-exec',
        definitionId: 'test-def',
        workflowName: 'failed-resume-test',
        status: 'running',
      });

      const resumedCount = await Workflow.resumeInterrupted();
      expect(resumedCount).toBe(0);

      const execution = await Database.WorkflowExecution.findById('failed-resume-exec');
      expect(execution?.status).toBe('failed');
    });
  });

  describe('initialize', () => {
    test('should initialize database and run migrations', async () => {
      // Close existing connection
      DatabaseClient.close();

      await expect(Workflow.initialize(':memory:')).resolves.not.toThrow();

      // Verify database is working
      expect(DatabaseClient.healthCheck()).toBe(true);
    });
  });
});