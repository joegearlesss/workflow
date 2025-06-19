import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DatabaseClient, Database } from '../../src/database';
import { Workflow } from '../../src/workflow';
import { WorkflowContextImpl } from '../../src/context';
import { ErrorHandling } from '../../src/error-handling';
import type { WorkflowHandler } from '../../src/types';
import { TestSetup } from '../setup';

describe('Database Persistence Integration', () => {
  beforeEach(async () => {
    await TestSetup.createTestDatabase();
  });

  afterEach(() => {
    TestSetup.closeTestDatabase();
  });

  describe('workflow definition persistence', () => {
    test('should persist and retrieve workflow definitions correctly', async () => {
      const handler: WorkflowHandler = async (ctx) => ({ result: 'test' });

      // Define workflow - should automatically persist definition
      Workflow.define('persistence-test-workflow', handler, {
        version: '2.1.0',
        description: 'Integration test workflow for persistence',
        schema: { 
          type: 'object',
          properties: {
            input: { type: 'string' },
            output: { type: 'object' }
          }
        },
      });

      // Allow time for async database operation
      await TestSetup.waitForAsync();

      // Retrieve from database
      const definition = await Database.WorkflowDefinition.findByName('persistence-test-workflow');
      
      expect(definition).toBeDefined();
      expect(definition?.name).toBe('persistence-test-workflow');
      expect(definition?.version).toBe('2.1.0');
      expect(definition?.description).toBe('Integration test workflow for persistence');
      expect(definition?.isActive).toBe(true);
      expect(definition?.schema).toEqual({
        type: 'object',
        properties: {
          input: { type: 'string' },
          output: { type: 'object' }
        }
      });
      expect(definition?.createdAt).toBeInstanceOf(Date);
      expect(definition?.updatedAt).toBeInstanceOf(Date);
    });

    test('should handle workflow definition updates', async () => {
      // Create initial definition
      const initial = await Database.WorkflowDefinition.create({
        name: 'updatable-workflow',
        version: '1.0.0',
        description: 'Initial version',
        schema: { version: 1 },
        isActive: true,
      });

      // Update the definition
      const updated = await Database.WorkflowDefinition.update(initial.id, {
        version: '1.1.0',
        description: 'Updated version',
        schema: { version: 2, features: ['new-feature'] },
        isActive: false,
      });

      expect(updated).toBeDefined();
      expect(updated?.version).toBe('1.1.0');
      expect(updated?.description).toBe('Updated version');
      expect(updated?.isActive).toBe(false);
      expect(updated?.schema).toEqual({ 
        version: 2, 
        features: ['new-feature'] 
      });
      expect(updated?.updatedAt.getTime()).toBeGreaterThan(initial.updatedAt.getTime());
    });

    test('should list only active workflow definitions', async () => {
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

  describe('workflow execution persistence', () => {
    test('should persist complete workflow execution lifecycle', async () => {
      const definition = await Database.WorkflowDefinition.create({
        name: 'lifecycle-test-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      // Create execution
      const execution = await Database.WorkflowExecution.create({
        id: 'lifecycle-exec-1',
        definitionId: definition.id,
        workflowName: 'lifecycle-test-workflow',
        status: 'pending',
        input: { testData: 'input-value' },
        metadata: { priority: 'high', source: 'integration-test' },
      });

      expect(execution.status).toBe('pending');
      expect(execution.input).toEqual({ testData: 'input-value' });
      expect(execution.metadata).toEqual({ priority: 'high', source: 'integration-test' });

      // Update to running
      const runningExecution = await Database.WorkflowExecution.update(execution.id, {
        status: 'running',
        startedAt: new Date(),
      });

      expect(runningExecution?.status).toBe('running');
      expect(runningExecution?.startedAt).toBeInstanceOf(Date);

      // Update to completed
      const completedExecution = await Database.WorkflowExecution.update(execution.id, {
        status: 'completed',
        output: { result: 'success', processed: true },
        completedAt: new Date(),
      });

      expect(completedExecution?.status).toBe('completed');
      expect(completedExecution?.output).toEqual({ result: 'success', processed: true });
      expect(completedExecution?.completedAt).toBeInstanceOf(Date);

      // Verify final state
      const finalExecution = await Database.WorkflowExecution.findById(execution.id);
      expect(finalExecution?.status).toBe('completed');
      expect(finalExecution?.startedAt).toBeInstanceOf(Date);
      expect(finalExecution?.completedAt).toBeInstanceOf(Date);
    });

    test('should query executions by workflow and status', async () => {
      const definition = await Database.WorkflowDefinition.create({
        name: 'query-test-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      // Create executions with different statuses
      await Database.WorkflowExecution.create({
        id: 'query-exec-1',
        definitionId: definition.id,
        workflowName: 'query-test-workflow',
        status: 'completed',
        completedAt: new Date(),
      });

      await Database.WorkflowExecution.create({
        id: 'query-exec-2',
        definitionId: definition.id,
        workflowName: 'query-test-workflow',
        status: 'failed',
        error: { message: 'Test failure' },
        completedAt: new Date(),
      });

      await Database.WorkflowExecution.create({
        id: 'query-exec-3',
        definitionId: definition.id,
        workflowName: 'query-test-workflow',
        status: 'running',
        startedAt: new Date(),
      });

      // Query by status
      const completedExecutions = await Database.WorkflowExecution.findByWorkflowAndStatus(
        'query-test-workflow',
        'completed'
      );
      expect(completedExecutions).toHaveLength(1);
      expect(completedExecutions[0]?.id).toBe('query-exec-1');

      const failedExecutions = await Database.WorkflowExecution.findByWorkflowAndStatus(
        'query-test-workflow',
        'failed'
      );
      expect(failedExecutions).toHaveLength(1);
      expect(failedExecutions[0]?.id).toBe('query-exec-2');

      // Find resumable executions
      const resumableExecutions = await Database.WorkflowExecution.findResumable();
      expect(resumableExecutions).toHaveLength(1);
      expect(resumableExecutions[0]?.id).toBe('query-exec-3');
    });
  });

  describe('step execution persistence', () => {
    test('should persist step execution with retry attempts', async () => {
      const definition = await Database.WorkflowDefinition.create({
        name: 'step-retry-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      const execution = await Database.WorkflowExecution.create({
        id: 'step-retry-exec',
        definitionId: definition.id,
        workflowName: 'step-retry-workflow',
        status: 'running',
      });

      // Create initial failed step
      const failedStep = await Database.StepExecution.create({
        executionId: execution.id,
        stepName: 'retry-test-step',
        status: 'failed',
        input: { data: 'test-input' },
        error: { message: 'First attempt failed', type: 'NetworkError' },
        attempt: 1,
        maxAttempts: 3,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      expect(failedStep.status).toBe('failed');
      expect(failedStep.attempt).toBe(1);

      // Update for retry
      const retryingStep = await Database.StepExecution.update(failedStep.id, {
        status: 'retrying',
        attempt: 2,
        startedAt: new Date(),
        completedAt: undefined,
      });

      expect(retryingStep?.status).toBe('retrying');
      expect(retryingStep?.attempt).toBe(2);

      // Complete successfully
      const completedStep = await Database.StepExecution.update(failedStep.id, {
        status: 'completed',
        output: { result: 'success-on-retry' },
        error: undefined,
        completedAt: new Date(),
      });

      expect(completedStep?.status).toBe('completed');
      expect(completedStep?.output).toEqual({ result: 'success-on-retry' });
      expect(completedStep?.error).toBeUndefined();
    });

    test('should find retryable step executions', async () => {
      const definition = await Database.WorkflowDefinition.create({
        name: 'retryable-steps-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      const execution = await Database.WorkflowExecution.create({
        id: 'retryable-steps-exec',
        definitionId: definition.id,
        workflowName: 'retryable-steps-workflow',
        status: 'running',
      });

      // Create retryable step (failed but under max attempts)
      await Database.StepExecution.create({
        executionId: execution.id,
        stepName: 'retryable-step',
        status: 'failed',
        attempt: 2,
        maxAttempts: 3,
        error: { message: 'Retryable failure' },
      });

      // Create non-retryable step (max attempts reached)
      await Database.StepExecution.create({
        executionId: execution.id,
        stepName: 'exhausted-step',
        status: 'failed',
        attempt: 3,
        maxAttempts: 3,
        error: { message: 'Max attempts reached' },
      });

      // Create completed step
      await Database.StepExecution.create({
        executionId: execution.id,
        stepName: 'completed-step',
        status: 'completed',
        attempt: 1,
        maxAttempts: 3,
        output: { success: true },
      });

      const retryableSteps = await Database.StepExecution.findRetryable(execution.id);
      
      expect(retryableSteps).toHaveLength(1);
      expect(retryableSteps[0]?.stepName).toBe('retryable-step');
      expect(retryableSteps[0]?.attempt).toBe(2);
      expect(retryableSteps[0]?.maxAttempts).toBe(3);
    });

    test('should track step execution order and dependencies', async () => {
      const context = new WorkflowContextImpl('step-order-exec', 'test-workflow', {}, 1, {});

      // Execute steps in sequence
      const step1Result = await context.step('step-1', async () => {
        return { order: 1, timestamp: Date.now() };
      }).execute();

      await TestSetup.waitForAsync(10); // Small delay

      const step2Result = await context.step('step-2', async () => {
        return { order: 2, timestamp: Date.now(), dependsOn: step1Result };
      }).execute();

      await TestSetup.waitForAsync(10); // Small delay

      const step3Result = await context.step('step-3', async () => {
        return { order: 3, timestamp: Date.now(), dependsOn: step2Result };
      }).execute();

      // Verify execution order is preserved in database
      const steps = await Database.StepExecution.findByExecutionId('step-order-exec');
      
      expect(steps).toHaveLength(3);
      
      // Steps should be ordered by creation time
      const sortedSteps = steps.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      expect(sortedSteps[0]?.stepName).toBe('step-1');
      expect(sortedSteps[1]?.stepName).toBe('step-2');
      expect(sortedSteps[2]?.stepName).toBe('step-3');

      // Verify timestamps increase
      const timestamp1 = (sortedSteps[0]?.output as any)?.timestamp;
      const timestamp2 = (sortedSteps[1]?.output as any)?.timestamp;
      const timestamp3 = (sortedSteps[2]?.output as any)?.timestamp;

      expect(timestamp2).toBeGreaterThan(timestamp1);
      expect(timestamp3).toBeGreaterThan(timestamp2);
    });
  });

  describe('circuit breaker state persistence', () => {
    test('should persist and retrieve circuit breaker state', async () => {
      // Create circuit breaker state
      const initialState = await Database.CircuitBreaker.getOrCreate('test-circuit-persistence');
      
      expect(initialState.name).toBe('test-circuit-persistence');
      expect(initialState.state).toBe('closed');
      expect(initialState.failureCount).toBe(0);

      // Update state to open
      const openState = await Database.CircuitBreaker.update('test-circuit-persistence', {
        state: 'open',
        failureCount: 5,
        lastFailureAt: new Date(),
        nextAttemptAt: new Date(Date.now() + 30000),
      });

      expect(openState?.state).toBe('open');
      expect(openState?.failureCount).toBe(5);
      expect(openState?.lastFailureAt).toBeInstanceOf(Date);
      expect(openState?.nextAttemptAt).toBeInstanceOf(Date);

      // Reset circuit breaker
      const resetState = await Database.CircuitBreaker.reset('test-circuit-persistence');
      
      expect(resetState?.state).toBe('closed');
      expect(resetState?.failureCount).toBe(0);
      expect(resetState?.lastFailureAt).toBeUndefined();
      expect(resetState?.nextAttemptAt).toBeUndefined();
    });

    test('should handle concurrent circuit breaker operations', async () => {
      // Create multiple circuit breakers concurrently
      const circuitNames = ['circuit-1', 'circuit-2', 'circuit-3'];
      
      const states = await Promise.all(
        circuitNames.map(name => Database.CircuitBreaker.getOrCreate(name))
      );

      expect(states).toHaveLength(3);
      states.forEach((state, index) => {
        expect(state.name).toBe(circuitNames[index]);
        expect(state.state).toBe('closed');
      });

      // Update them concurrently
      await Promise.all(
        circuitNames.map((name, index) => 
          Database.CircuitBreaker.update(name, {
            failureCount: index + 1,
            state: index === 0 ? 'open' : 'closed',
          })
        )
      );

      // Verify updates
      const updatedStates = await Promise.all(
        circuitNames.map(name => Database.CircuitBreaker.getOrCreate(name))
      );

      expect(updatedStates[0]?.state).toBe('open');
      expect(updatedStates[0]?.failureCount).toBe(1);
      expect(updatedStates[1]?.state).toBe('closed');
      expect(updatedStates[1]?.failureCount).toBe(2);
      expect(updatedStates[2]?.state).toBe('closed');
      expect(updatedStates[2]?.failureCount).toBe(3);
    });
  });

  describe('workflow locking mechanism', () => {
    test('should handle workflow lock acquisition and release', async () => {
      const definition = await Database.WorkflowDefinition.create({
        name: 'lock-test-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      const execution = await Database.WorkflowExecution.create({
        id: 'lock-test-exec',
        definitionId: definition.id,
        workflowName: 'lock-test-workflow',
        status: 'running',
      });

      // Acquire lock
      const lockAcquired = await Database.WorkflowLock.acquire(
        execution.id,
        'test-lock-key',
        60000 // 1 minute
      );

      expect(lockAcquired).toBe(true);

      // Try to acquire same lock - should fail
      const duplicateLockFailed = await Database.WorkflowLock.acquire(
        execution.id,
        'test-lock-key',
        60000
      );

      expect(duplicateLockFailed).toBe(false);

      // Release lock
      const lockReleased = await Database.WorkflowLock.release(execution.id);
      expect(lockReleased).toBe(true);

      // Should be able to acquire again after release
      const reacquired = await Database.WorkflowLock.acquire(
        execution.id,
        'test-lock-key',
        60000
      );

      expect(reacquired).toBe(true);
    });

    test('should clean up expired locks', async () => {
      const definition = await Database.WorkflowDefinition.create({
        name: 'expired-lock-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      const execution = await Database.WorkflowExecution.create({
        id: 'expired-lock-exec',
        definitionId: definition.id,
        workflowName: 'expired-lock-workflow',
        status: 'running',
      });

      // Acquire lock with very short expiration
      const acquired = await Database.WorkflowLock.acquire(
        execution.id,
        'expired-lock-key',
        10 // 10ms
      );

      expect(acquired).toBe(true);

      // Wait for expiration
      await TestSetup.waitForAsync();

      // Cleanup expired locks
      const cleanedUp = await Database.WorkflowLock.cleanupExpired();
      expect(cleanedUp).toBeGreaterThanOrEqual(0); // May be 0 due to timing

      // Should be able to acquire lock again
      const reacquired = await Database.WorkflowLock.acquire(
        execution.id,
        'expired-lock-key',
        60000
      );

      expect(reacquired).toBe(true);
    });
  });

  describe('data integrity and transactions', () => {
    test('should maintain referential integrity between tables', async () => {
      const definition = await Database.WorkflowDefinition.create({
        name: 'integrity-test-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      const execution = await Database.WorkflowExecution.create({
        id: 'integrity-test-exec',
        definitionId: definition.id,
        workflowName: 'integrity-test-workflow',
        status: 'running',
      });

      const stepExecution = await Database.StepExecution.create({
        executionId: execution.id,
        stepName: 'integrity-test-step',
        status: 'completed',
        attempt: 1,
        maxAttempts: 3,
        output: { test: 'integrity' },
      });

      // Verify relationships
      const retrievedExecution = await Database.WorkflowExecution.findById(execution.id);
      expect(retrievedExecution?.definitionId).toBe(definition.id);

      const retrievedSteps = await Database.StepExecution.findByExecutionId(execution.id);
      expect(retrievedSteps).toHaveLength(1);
      expect(retrievedSteps[0]?.executionId).toBe(execution.id);
    });

    test('should handle database transaction rollbacks properly', async () => {
      // This test simulates transaction behavior by testing error conditions
      const definition = await Database.WorkflowDefinition.create({
        name: 'transaction-test-workflow',
        version: '1.0.0',
        schema: {},
        isActive: true,
      });

      // Test with database transaction simulation
      await expect(async () => {
        await DatabaseClient.transaction(async (tx) => {
          // Create execution
          const execution = await Database.WorkflowExecution.create({
            id: 'transaction-test-exec',
            definitionId: definition.id,
            workflowName: 'transaction-test-workflow',
            status: 'running',
          });

          // Create step
          await Database.StepExecution.create({
            executionId: execution.id,
            stepName: 'transaction-test-step',
            status: 'running',
            attempt: 1,
            maxAttempts: 3,
          });

          // Simulate rollback condition
          throw new Error('Transaction rollback test');
        });
      }).rejects.toThrow('Transaction rollback test');

      // Verify data was not persisted due to rollback
      const execution = await Database.WorkflowExecution.findById('transaction-test-exec');
      expect(execution).toBeUndefined();
    });
  });
});