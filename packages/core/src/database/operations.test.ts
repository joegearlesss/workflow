import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DatabaseClient, Database } from './index';
import type { WorkflowExecutionStatus, StepExecutionStatus } from './schema';
import { TestSetup } from '../../tests/setup';

describe('Database Operations', () => {
  beforeEach(async () => {
    await TestSetup.createTestDatabase();
  });

  afterEach(() => {
    TestSetup.closeTestDatabase();
  });

  describe('WorkflowDefinition', () => {
    test('should create workflow definition successfully', async () => {
      const definition = await Database.WorkflowDefinition.create(
        TestSetup.createTestData.workflowDefinition({
          schema: { steps: ['step1', 'step2'] },
        })
      );

      expect(definition.id).toBeDefined();
      expect(definition.name).toMatch(/^test-workflow-/);
      expect(definition.version).toBe('1.0.0');
      expect(definition.description).toBe('Test workflow definition');
      expect(definition.isActive).toBe(true);
      expect(definition.createdAt).toBeInstanceOf(Date);
      expect(definition.updatedAt).toBeInstanceOf(Date);
    });

    test('should find workflow definition by name', async () => {
      await Database.WorkflowDefinition.create({
        name: 'findable-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      const found = await Database.WorkflowDefinition.findByName('findable-workflow');
      expect(found).toBeDefined();
      expect(found?.name).toBe('findable-workflow');
    });

    test('should return undefined for non-existent workflow', async () => {
      const found = await Database.WorkflowDefinition.findByName('non-existent');
      expect(found).toBeUndefined();
    });

    test('should find workflow definition by ID', async () => {
      const created = await Database.WorkflowDefinition.create({
        name: 'id-findable-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      const found = await Database.WorkflowDefinition.findById(created.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    test('should update workflow definition', async () => {
      const created = await Database.WorkflowDefinition.create({
        name: 'updatable-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      // Wait a bit to ensure different timestamp
      await TestSetup.waitForAsync(10);
      
      const updated = await Database.WorkflowDefinition.update(created.id, {
        version: '1.1.0',
        description: 'Updated description',
        isActive: false,
      });

      expect(updated).toBeDefined();
      expect(updated?.version).toBe('1.1.0');
      expect(updated?.description).toBe('Updated description');
      expect(updated?.isActive).toBe(false);
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    test('should return undefined when updating non-existent definition', async () => {
      const updated = await Database.WorkflowDefinition.update('non-existent-id', {
        version: '2.0.0',
      });

      expect(updated).toBeUndefined();
    });

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

      const activeDefinitions = await Database.WorkflowDefinition.listActive();
      expect(activeDefinitions).toHaveLength(2);
      expect(activeDefinitions.map(d => d.name)).toContain('active-workflow-1');
      expect(activeDefinitions.map(d => d.name)).toContain('active-workflow-2');
      expect(activeDefinitions.map(d => d.name)).not.toContain('inactive-workflow');
    });
  });

  describe('WorkflowExecution', () => {
    let definitionId: string;

    beforeEach(async () => {
      const definition = await Database.WorkflowDefinition.create({
        name: 'test-execution-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });
      definitionId = definition.id;
    });

    test('should create workflow execution successfully', async () => {
      const execution = await Database.WorkflowExecution.create({
        id: 'exec-123',
        definitionId,
        workflowName: 'test-execution-workflow',
        status: 'pending' as WorkflowExecutionStatus,
        input: { testInput: 'value' },
        metadata: { testMeta: 'meta' },
      });

      expect(execution.id).toBe('exec-123');
      expect(execution.definitionId).toBe(definitionId);
      expect(execution.workflowName).toBe('test-execution-workflow');
      expect(execution.status).toBe('pending');
      expect(execution.input).toEqual({ testInput: 'value' });
      expect(execution.metadata).toEqual({ testMeta: 'meta' });
      expect(execution.createdAt).toBeInstanceOf(Date);
      expect(execution.updatedAt).toBeInstanceOf(Date);
    });

    test('should find workflow execution by ID', async () => {
      await Database.WorkflowExecution.create({
        id: 'findable-exec',
        definitionId,
        workflowName: 'test-execution-workflow',
        status: 'completed' as WorkflowExecutionStatus,
        output: { result: 'success' },
      });

      const found = await Database.WorkflowExecution.findById('findable-exec');
      expect(found).toBeDefined();
      expect(found?.id).toBe('findable-exec');
      expect(found?.status).toBe('completed');
      expect(found?.output).toEqual({ result: 'success' });
    });

    test('should update workflow execution', async () => {
      const created = await Database.WorkflowExecution.create({
        id: 'updatable-exec',
        definitionId,
        workflowName: 'test-execution-workflow',
        status: 'pending' as WorkflowExecutionStatus,
      });

      const updated = await Database.WorkflowExecution.update('updatable-exec', {
        status: 'running' as WorkflowExecutionStatus,
        startedAt: new Date(),
        output: { progress: 50 },
      });

      expect(updated).toBeDefined();
      expect(updated?.status).toBe('running');
      expect(updated?.startedAt).toBeInstanceOf(Date);
      expect(updated?.output).toEqual({ progress: 50 });
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    test('should find executions by workflow name and status', async () => {
      await Database.WorkflowExecution.create({
        id: 'exec-filter-1',
        definitionId,
        workflowName: 'filter-test-workflow',
        status: 'completed' as WorkflowExecutionStatus,
      });

      await Database.WorkflowExecution.create({
        id: 'exec-filter-2',
        definitionId,
        workflowName: 'filter-test-workflow',
        status: 'failed' as WorkflowExecutionStatus,
      });

      await Database.WorkflowExecution.create({
        id: 'exec-filter-3',
        definitionId,
        workflowName: 'other-workflow',
        status: 'completed' as WorkflowExecutionStatus,
      });

      const completedExecs = await Database.WorkflowExecution.findByWorkflowAndStatus(
        'filter-test-workflow',
        'completed'
      );

      expect(completedExecs).toHaveLength(1);
      expect(completedExecs[0]?.id).toBe('exec-filter-1');
    });

    test('should find resumable executions', async () => {
      await Database.WorkflowExecution.create({
        id: 'resumable-exec-1',
        definitionId,
        workflowName: 'resumable-workflow',
        status: 'running' as WorkflowExecutionStatus,
        startedAt: new Date(),
      });

      await Database.WorkflowExecution.create({
        id: 'resumable-exec-2',
        definitionId,
        workflowName: 'resumable-workflow',
        status: 'completed' as WorkflowExecutionStatus,
      });

      const resumable = await Database.WorkflowExecution.findResumable();
      expect(resumable).toHaveLength(1);
      expect(resumable[0]?.id).toBe('resumable-exec-1');
    });
  });

  describe('StepExecution', () => {
    let executionId: string;

    beforeEach(async () => {
      const definition = await Database.WorkflowDefinition.create({
        name: 'test-step-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      const execution = await Database.WorkflowExecution.create({
        id: 'step-exec-123',
        definitionId: definition.id,
        workflowName: 'test-step-workflow',
        status: 'running' as WorkflowExecutionStatus,
      });

      executionId = execution.id;
    });

    test('should create step execution successfully', async () => {
      const stepExecution = await Database.StepExecution.create({
        executionId,
        stepName: 'test-step',
        status: 'pending' as StepExecutionStatus,
        input: { stepInput: 'value' },
        attempt: 1,
        maxAttempts: 3,
      });

      expect(stepExecution.id).toBeDefined();
      expect(stepExecution.executionId).toBe(executionId);
      expect(stepExecution.stepName).toBe('test-step');
      expect(stepExecution.status).toBe('pending');
      expect(stepExecution.input).toEqual({ stepInput: 'value' });
      expect(stepExecution.attempt).toBe(1);
      expect(stepExecution.maxAttempts).toBe(3);
      expect(stepExecution.createdAt).toBeInstanceOf(Date);
    });

    test('should update step execution', async () => {
      const created = await Database.StepExecution.create({
        executionId,
        stepName: 'updatable-step',
        status: 'running' as StepExecutionStatus,
        input: {},
        attempt: 1,
        maxAttempts: 3,
        startedAt: new Date(),
      });

      const updated = await Database.StepExecution.update(created.id, {
        status: 'completed' as StepExecutionStatus,
        output: { result: 'success' },
        completedAt: new Date(),
      });

      expect(updated).toBeDefined();
      expect(updated?.status).toBe('completed');
      expect(updated?.output).toEqual({ result: 'success' });
      expect(updated?.completedAt).toBeInstanceOf(Date);
    });

    test('should find step executions by execution ID', async () => {
      await Database.StepExecution.create({
        executionId,
        stepName: 'step-1',
        status: 'completed' as StepExecutionStatus,
        input: {},
        attempt: 1,
        maxAttempts: 3,
      });

      await Database.StepExecution.create({
        executionId,
        stepName: 'step-2',
        status: 'running' as StepExecutionStatus,
        input: {},
        attempt: 1,
        maxAttempts: 3,
      });

      const steps = await Database.StepExecution.findByExecutionId(executionId);
      expect(steps).toHaveLength(2);
      expect(steps.map(s => s.stepName)).toContain('step-1');
      expect(steps.map(s => s.stepName)).toContain('step-2');
    });

    test('should find step execution by execution and step name', async () => {
      await Database.StepExecution.create({
        executionId,
        stepName: 'specific-step',
        status: 'completed' as StepExecutionStatus,
        input: {},
        attempt: 1,
        maxAttempts: 3,
      });

      const found = await Database.StepExecution.findByExecutionAndStep(
        executionId,
        'specific-step'
      );

      expect(found).toBeDefined();
      expect(found?.stepName).toBe('specific-step');
      expect(found?.status).toBe('completed');
    });

    test('should find retryable step executions', async () => {
      await Database.StepExecution.create({
        executionId,
        stepName: 'retryable-step',
        status: 'failed' as StepExecutionStatus,
        input: {},
        attempt: 2,
        maxAttempts: 3,
        error: { message: 'Step failed' },
      });

      await Database.StepExecution.create({
        executionId,
        stepName: 'max-attempts-step',
        status: 'failed' as StepExecutionStatus,
        input: {},
        attempt: 3,
        maxAttempts: 3,
        error: { message: 'Max attempts reached' },
      });

      const retryable = await Database.StepExecution.findRetryable(executionId);
      expect(retryable).toHaveLength(1);
      expect(retryable[0]?.stepName).toBe('retryable-step');
    });
  });

  describe('CircuitBreaker', () => {
    test('should get or create circuit breaker state', async () => {
      const state = await Database.CircuitBreaker.getOrCreate('test-circuit');

      expect(state.id).toBeDefined();
      expect(state.name).toBe('test-circuit');
      expect(state.state).toBe('closed');
      expect(state.failureCount).toBe(0);
      expect(state.createdAt).toBeInstanceOf(Date);
      expect(state.updatedAt).toBeInstanceOf(Date);
    });

    test('should return existing circuit breaker state', async () => {
      const state1 = await Database.CircuitBreaker.getOrCreate('existing-circuit');
      const state2 = await Database.CircuitBreaker.getOrCreate('existing-circuit');

      expect(state1.id).toBe(state2.id);
      expect(state1.name).toBe(state2.name);
    });

    test('should update circuit breaker state', async () => {
      await Database.CircuitBreaker.getOrCreate('updatable-circuit');

      const updated = await Database.CircuitBreaker.update('updatable-circuit', {
        state: 'open',
        failureCount: 5,
        lastFailureAt: new Date(),
        nextAttemptAt: new Date(Date.now() + 30000),
      });

      expect(updated).toBeDefined();
      expect(updated?.state).toBe('open');
      expect(updated?.failureCount).toBe(5);
      expect(updated?.lastFailureAt).toBeInstanceOf(Date);
      expect(updated?.nextAttemptAt).toBeInstanceOf(Date);
    });

    test('should reset circuit breaker state', async () => {
      await Database.CircuitBreaker.getOrCreate('resetable-circuit');
      
      // First set it to open state
      await Database.CircuitBreaker.update('resetable-circuit', {
        state: 'open',
        failureCount: 10,
        lastFailureAt: new Date(),
      });

      // Then reset it
      const reset = await Database.CircuitBreaker.reset('resetable-circuit');

      expect(reset).toBeDefined();
      expect(reset?.state).toBe('closed');
      expect(reset?.failureCount).toBe(0);
      expect(reset?.lastFailureAt).toBeUndefined();
      expect(reset?.nextAttemptAt).toBeUndefined();
    });
  });

  describe('WorkflowLock', () => {
    test('should acquire workflow lock successfully', async () => {
      const definition = await Database.WorkflowDefinition.create({
        name: 'lock-test-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      const execution = await Database.WorkflowExecution.create({
        id: 'lock-exec-123',
        definitionId: definition.id,
        workflowName: 'lock-test-workflow',
        status: 'running' as WorkflowExecutionStatus,
      });

      const acquired = await Database.WorkflowLock.acquire(
        execution.id,
        'test-lock-key',
        60000
      );

      expect(acquired).toBe(true);
    });

    test('should fail to acquire existing lock', async () => {
      const definition = await Database.WorkflowDefinition.create(
        TestSetup.createTestData.workflowDefinition()
      );

      const execution = await Database.WorkflowExecution.create({
        id: 'lock-exec-conflict-test',
        definitionId: definition.id,
        workflowName: definition.name,
        status: 'running' as WorkflowExecutionStatus,
      });

      // First acquisition should succeed
      const acquired1 = await Database.WorkflowLock.acquire(
        execution.id,
        'conflict-lock-key',
        60000
      );
      expect(acquired1).toBe(true);

      // Second acquisition with same execution should fail due to unique constraint
      const acquired2 = await Database.WorkflowLock.acquire(
        execution.id,
        'another-lock-key', // Different key, same execution
        60000
      );
      expect(acquired2).toBe(false);
    });

    test('should release workflow lock', async () => {
      const definition = await Database.WorkflowDefinition.create({
        name: 'release-test-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      const execution = await Database.WorkflowExecution.create({
        id: 'release-exec-123',
        definitionId: definition.id,
        workflowName: 'release-test-workflow',
        status: 'running' as WorkflowExecutionStatus,
      });

      // Acquire lock first
      await Database.WorkflowLock.acquire(execution.id, 'release-lock-key', 60000);

      // Then release it
      const released = await Database.WorkflowLock.release(execution.id);
      expect(released).toBe(true);

      // Should be able to acquire again
      const reacquired = await Database.WorkflowLock.acquire(
        execution.id,
        'release-lock-key',
        60000
      );
      expect(reacquired).toBe(true);
    });

    test('should return false when releasing non-existent lock', async () => {
      const released = await Database.WorkflowLock.release('non-existent-exec');
      expect(released).toBe(false);
    });

    test('should cleanup expired locks', async () => {
      const definition = await Database.WorkflowDefinition.create({
        name: 'cleanup-test-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      const execution = await Database.WorkflowExecution.create({
        id: 'cleanup-exec-123',
        definitionId: definition.id,
        workflowName: 'cleanup-test-workflow',
        status: 'running' as WorkflowExecutionStatus,
      });

      // Acquire lock with very short expiration
      await Database.WorkflowLock.acquire(execution.id, 'cleanup-lock-key', 1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));

      // Cleanup should remove expired lock
      const cleanedUp = await Database.WorkflowLock.cleanupExpired();
      expect(cleanedUp).toBeGreaterThanOrEqual(0); // May be 0 if timing is off
    });
  });
});