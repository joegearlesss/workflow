import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Workflow } from '../../src/workflow';
import { DatabaseClient, Database } from '../../src/database';
import { ErrorHandling } from '../../src/error-handling';
import type { WorkflowHandler } from '../../src/types';

describe('Workflow Execution Integration', () => {
  beforeEach(async () => {
    await Workflow.initialize(':memory:');
  });

  afterEach(() => {
    DatabaseClient.close();
  });

  describe('complete workflow lifecycle', () => {
    test('should execute multi-step workflow with database persistence', async () => {
      const handler: WorkflowHandler<{ userId: string }, { processed: boolean }> = async (ctx) => {
        // Step 1: Validate input
        const validationResult = await ctx.step('validate-input', async () => {
          if (!ctx.input.userId) {
            throw new ErrorHandling.ValidationError('User ID is required', 'userId');
          }
          return { valid: true, userId: ctx.input.userId };
        });

        // Step 2: Fetch user data
        const userData = await ctx.step('fetch-user-data', async () => {
          return { 
            id: validationResult.userId,
            name: 'Test User',
            email: 'test@example.com',
          };
        });

        // Step 3: Process data
        const processedData = await ctx.step('process-data', async () => {
          return {
            processed: true,
            timestamp: new Date(),
            user: userData,
          };
        });

        // Step 4: Save results
        await ctx.step('save-results', async () => {
          return { saved: true, id: processedData.user.id };
        });

        return { processed: true };
      };

      Workflow.define('integration-test-workflow', handler);

      const result = await Workflow.start(
        'integration-test-workflow',
        'integration-exec-1',
        { userId: 'user-123' }
      );

      expect(result).toEqual({ processed: true });

      // Verify workflow execution was persisted
      const execution = await Workflow.getExecution('integration-exec-1');
      expect(execution).toBeDefined();
      expect(execution?.status).toBe('completed');
      expect(execution?.input).toEqual({ userId: 'user-123' });
      expect(execution?.output).toEqual({ processed: true });

      // Verify all steps were persisted
      const steps = await Database.StepExecution.findByExecutionId('integration-exec-1');
      expect(steps).toHaveLength(4);
      
      const stepNames = steps.map(s => s.stepName);
      expect(stepNames).toContain('validate-input');
      expect(stepNames).toContain('fetch-user-data');
      expect(stepNames).toContain('process-data');
      expect(stepNames).toContain('save-results');

      // Verify all steps completed successfully
      steps.forEach(step => {
        expect(step.status).toBe('completed');
        expect(step.output).toBeDefined();
      });
    });

    test('should handle workflow with error recovery and continuation', async () => {
      let attempts = 0;
      const handler: WorkflowHandler = async (ctx) => {
        // Step 1: Always succeeds
        await ctx.step('setup', async () => {
          return { setup: 'complete' };
        });

        // Step 2: Fails first time, succeeds on retry
        await ctx.step('unreliable-operation', async () => {
          attempts++;
          if (attempts === 1) {
            throw new ErrorHandling.NetworkError('Service temporarily unavailable', 503);
          }
          return { attempt: attempts, success: true };
        }).onError({
          NetworkError: async (error, ctx) => {
            // Log the error but allow retry
            await ctx.step('log-error', async () => {
              return { 
                logged: true, 
                error: error.message,
                timestamp: new Date(),
              };
            });
            throw error; // Re-throw to trigger retry
          },
        });

        // Step 3: Cleanup
        await ctx.step('cleanup', async () => {
          return { cleanup: 'complete' };
        });

        return { completed: true, totalAttempts: attempts };
      };

      Workflow.define('error-recovery-workflow', handler);

      // First execution should fail
      await expect(
        Workflow.start('error-recovery-workflow', 'error-recovery-exec', undefined, {
          retry: { maxAttempts: 1, backoffMs: 10, exponentialBackoff: false },
        })
      ).rejects.toThrow('Service temporarily unavailable');

      // Resume should succeed
      const result = await Workflow.resume('error-recovery-exec');
      expect(result).toEqual({ completed: true, totalAttempts: 2 });

      // Verify execution history
      const execution = await Workflow.getExecution('error-recovery-exec');
      expect(execution?.status).toBe('completed');

      const steps = await Database.StepExecution.findByExecutionId('error-recovery-exec');
      
      // Should have: setup, unreliable-operation (failed), log-error, unreliable-operation (success), cleanup
      expect(steps.length).toBeGreaterThanOrEqual(4);
      
      const setupStep = steps.find(s => s.stepName === 'setup');
      expect(setupStep?.status).toBe('completed');
      
      const cleanupStep = steps.find(s => s.stepName === 'cleanup');
      expect(cleanupStep?.status).toBe('completed');
      
      const errorLogStep = steps.find(s => s.stepName === 'log-error');
      expect(errorLogStep?.status).toBe('completed');
    });

    test('should handle concurrent workflow executions independently', async () => {
      const handler: WorkflowHandler<{ id: string }, { processed: string }> = async (ctx) => {
        await ctx.step('process-item', async () => {
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 10));
          return { itemId: ctx.input.id, processed: true };
        });

        await ctx.step('finalize', async () => {
          return { finalized: true, id: ctx.input.id };
        });

        return { processed: ctx.input.id };
      };

      Workflow.define('concurrent-workflow', handler);

      // Start multiple workflows concurrently
      const executions = await Promise.all([
        Workflow.start('concurrent-workflow', 'concurrent-1', { id: 'item-1' }),
        Workflow.start('concurrent-workflow', 'concurrent-2', { id: 'item-2' }),
        Workflow.start('concurrent-workflow', 'concurrent-3', { id: 'item-3' }),
      ]);

      expect(executions).toHaveLength(3);
      expect(executions[0]).toEqual({ processed: 'item-1' });
      expect(executions[1]).toEqual({ processed: 'item-2' });
      expect(executions[2]).toEqual({ processed: 'item-3' });

      // Verify all executions were stored independently
      for (let i = 1; i <= 3; i++) {
        const execution = await Workflow.getExecution(`concurrent-${i}`);
        expect(execution?.status).toBe('completed');
        expect(execution?.input).toEqual({ id: `item-${i}` });
        expect(execution?.output).toEqual({ processed: `item-${i}` });

        const steps = await Database.StepExecution.findByExecutionId(`concurrent-${i}`);
        expect(steps).toHaveLength(2);
        steps.forEach(step => {
          expect(step.status).toBe('completed');
        });
      }
    });
  });

  describe('error handling integration', () => {
    test('should handle complex error scenarios with database rollback', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        // Step 1: Create some data
        const createdData = await ctx.step('create-data', async () => {
          return { 
            id: 'data-123',
            created: true,
            timestamp: new Date(),
          };
        });

        // Step 2: Validate data (will fail)
        await ctx.step('validate-data', async () => {
          throw new ErrorHandling.ValidationError('Data validation failed', 'data');
        }).onError({
          ValidationError: async (error, ctx) => {
            // Rollback: Delete created data
            await ctx.step('rollback-data', async () => {
              return { 
                rolledBack: true,
                deletedId: createdData.id,
                reason: error.message,
              };
            });
            
            // Return error result instead of throwing
            return { 
              error: true, 
              message: error.message,
              rolledBack: true,
            };
          },
        });

        // Step 3: This should still execute after error handling
        await ctx.step('cleanup', async () => {
          return { cleanup: 'complete' };
        });

        return { completed: true };
      };

      Workflow.define('rollback-workflow', handler);

      const result = await Workflow.start('rollback-workflow', 'rollback-exec');
      expect(result).toEqual({ completed: true });

      // Verify the rollback step was created
      const steps = await Database.StepExecution.findByExecutionId('rollback-exec');
      const rollbackStep = steps.find(s => s.stepName === 'rollback-data');
      expect(rollbackStep).toBeDefined();
      expect(rollbackStep?.status).toBe('completed');
      expect(rollbackStep?.output).toMatchObject({
        rolledBack: true,
        deletedId: 'data-123',
        reason: 'Data validation failed',
      });
    });

    test('should integrate circuit breaker with workflow steps', async () => {
      let callCount = 0;
      const handler: WorkflowHandler = async (ctx) => {
        // Step with circuit breaker that will fail multiple times
        const result = await ctx.step('external-api-call', async () => {
          callCount++;
          if (callCount <= 3) {
            throw new ErrorHandling.ExternalServiceError(
              'Service unavailable', 
              'external-api', 
              'getData'
            );
          }
          return { data: 'api-response', callCount };
        }).withCircuitBreaker({
          failureThreshold: 2,
          resetTimeout: 100,
          onOpen: async (ctx) => {
            await ctx.step('circuit-breaker-fallback', async () => {
              return { 
                fallback: true,
                message: 'Using cached data due to circuit breaker',
              };
            });
          },
        }).catch(async (error, ctx) => {
          // Final fallback
          return { 
            fallback: true, 
            cached: true,
            error: error.message,
          };
        });

        return { 
          success: true, 
          data: result, 
          totalCalls: callCount 
        };
      };

      Workflow.define('circuit-breaker-workflow', handler);

      const result = await Workflow.start('circuit-breaker-workflow', 'circuit-exec');
      
      // Should succeed with fallback data
      expect(result.success).toBe(true);
      expect(result.data.fallback).toBe(true);

      // Verify circuit breaker fallback step was created
      const steps = await Database.StepExecution.findByExecutionId('circuit-exec');
      const fallbackStep = steps.find(s => s.stepName === 'circuit-breaker-fallback');
      expect(fallbackStep).toBeDefined();
      expect(fallbackStep?.status).toBe('completed');
    });
  });

  describe('workflow state management', () => {
    test('should handle workflow pause and resume correctly', async () => {
      let stepCount = 0;
      const handler: WorkflowHandler = async (ctx) => {
        await ctx.step('step-1', async () => {
          stepCount++;
          return { step: 1, count: stepCount };
        });

        await ctx.step('step-2', async () => {
          stepCount++;
          if (stepCount === 2) {
            // Simulate a condition that causes workflow to pause
            throw new Error('Workflow paused for external dependency');
          }
          return { step: 2, count: stepCount };
        });

        await ctx.step('step-3', async () => {
          stepCount++;
          return { step: 3, count: stepCount };
        });

        return { completed: true, totalSteps: stepCount };
      };

      Workflow.define('pause-resume-workflow', handler);

      // First execution should fail at step 2
      await expect(
        Workflow.start('pause-resume-workflow', 'pause-resume-exec', undefined, {
          retry: { maxAttempts: 1, backoffMs: 10, exponentialBackoff: false },
        })
      ).rejects.toThrow('Workflow paused for external dependency');

      // Verify step 1 was completed and persisted
      let steps = await Database.StepExecution.findByExecutionId('pause-resume-exec');
      const step1 = steps.find(s => s.stepName === 'step-1');
      expect(step1?.status).toBe('completed');
      expect(step1?.output).toEqual({ step: 1, count: 1 });

      // Resume should continue from step 2
      const result = await Workflow.resume('pause-resume-exec');
      expect(result).toEqual({ completed: true, totalSteps: 3 });

      // Verify all steps are now completed
      steps = await Database.StepExecution.findByExecutionId('pause-resume-exec');
      expect(steps).toHaveLength(3);
      
      const step2 = steps.find(s => s.stepName === 'step-2');
      expect(step2?.status).toBe('completed');
      expect(step2?.output).toEqual({ step: 2, count: 3 }); // stepCount continued from where it left off
      
      const step3 = steps.find(s => s.stepName === 'step-3');
      expect(step3?.status).toBe('completed');
      expect(step3?.output).toEqual({ step: 3, count: 3 });
    });

    test('should handle workflow cancellation properly', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        await ctx.step('long-running-step', async () => {
          // Simulate long-running operation
          await new Promise(resolve => setTimeout(resolve, 100));
          return { longOperation: 'completed' };
        });

        await ctx.step('cleanup-step', async () => {
          return { cleanup: 'done' };
        });

        return { completed: true };
      };

      Workflow.define('cancellable-workflow', handler);

      // Start workflow
      const executionPromise = Workflow.start('cancellable-workflow', 'cancel-exec');

      // Cancel it while running (after a short delay)
      setTimeout(() => {
        Workflow.cancel('cancel-exec');
      }, 10);

      // Wait for either completion or cancellation
      try {
        await executionPromise;
      } catch {
        // May throw if cancelled during execution
      }

      // Wait a bit for cancellation to take effect
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify execution was cancelled
      const execution = await Workflow.getExecution('cancel-exec');
      expect(execution?.status).toBe('cancelled');
      expect(execution?.completedAt).toBeDefined();
    });
  });

  describe('workflow querying and monitoring', () => {
    test('should support comprehensive workflow monitoring', async () => {
      const handler: WorkflowHandler<{ processId: string }, { result: string }> = async (ctx) => {
        await ctx.step('initialize', async () => {
          return { initialized: true, processId: ctx.input.processId };
        });

        await ctx.sleep('processing-delay', 50);

        await ctx.step('process', async () => {
          return { processed: true, result: `processed-${ctx.input.processId}` };
        });

        return { result: `completed-${ctx.input.processId}` };
      };

      Workflow.define('monitoring-workflow', handler);

      // Create multiple workflow executions with different statuses
      const completed = await Workflow.start(
        'monitoring-workflow', 
        'monitoring-completed', 
        { processId: 'proc-1' }
      );

      // Start one that will fail
      try {
        await Workflow.start('monitoring-workflow', 'monitoring-failed', { processId: 'proc-2' });
        // Artificially mark as failed by updating database
        await Database.WorkflowExecution.update('monitoring-failed', { status: 'failed' });
      } catch {
        // Expected in some scenarios
      }

      // Verify we can query executions by status
      const completedExecutions = await Workflow.listExecutions('monitoring-workflow', 'completed');
      expect(completedExecutions).toHaveLength(1);
      expect(completedExecutions[0]?.id).toBe('monitoring-completed');

      const failedExecutions = await Workflow.listExecutions('monitoring-workflow', 'failed');
      expect(failedExecutions).toHaveLength(1);
      expect(failedExecutions[0]?.id).toBe('monitoring-failed');

      // Verify we can get all executions
      const allExecutions = await Workflow.listExecutions('monitoring-workflow');
      expect(allExecutions.length).toBeGreaterThanOrEqual(2);

      // Verify workflow definitions
      const definitions = await Workflow.listDefinitions();
      const monitoringDef = definitions.find(d => d.name === 'monitoring-workflow');
      expect(monitoringDef).toBeDefined();
      expect(monitoringDef?.isActive).toBe(true);
    });
  });
});