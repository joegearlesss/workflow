import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Workflow } from '../../src/workflow';
import { DatabaseClient, Database } from '../../src/database';
import { ErrorHandling } from '../../src/error-handling';
import { CircuitBreaker } from '../../src/circuit-breaker';
import type { WorkflowHandler } from '../../src/types';

describe('Error Recovery Integration', () => {
  beforeEach(async () => {
    await Workflow.initialize(':memory:');
  });

  afterEach(() => {
    DatabaseClient.close();
  });

  describe('multi-level error handling', () => {
    test('should handle errors with step-level, workflow-level, and system-level recovery', async () => {
      let networkCallCount = 0;
      let databaseCallCount = 0;

      const handler: WorkflowHandler = async (ctx) => {
        // Step 1: Network call with step-level error handling
        const networkResult = await ctx.step('network-call', async () => {
          networkCallCount++;
          if (networkCallCount <= 2) {
            throw new ErrorHandling.NetworkError('Network timeout', 503, 5);
          }
          return { data: 'network-success', attempts: networkCallCount };
        }).onError({
          NetworkError: async (error, ctx) => {
            if (ErrorHandling.NetworkError.is(error) && error.retryAfter) {
              await ctx.sleep(`network-backoff-${ctx.attempt}`, error.retryAfter * 1000);
            }
            
            // Log the attempt
            await ctx.step('log-network-retry', async () => {
              return { 
                attempt: networkCallCount, 
                error: error.message,
                timestamp: new Date(),
              };
            });
            
            throw error; // Re-throw to trigger retry
          },
        });

        // Step 2: Database operation with circuit breaker
        const databaseResult = await ctx.step('database-operation', async () => {
          databaseCallCount++;
          if (databaseCallCount <= 1) {
            throw new ErrorHandling.DatabaseError('Connection timeout', 'select');
          }
          return { data: 'database-success', attempts: databaseCallCount };
        }).withCircuitBreaker({
          failureThreshold: 3,
          resetTimeout: 100,
          onOpen: async (ctx) => {
            await ctx.step('database-circuit-fallback', async () => {
              return { fallback: true, message: 'Using cached database data' };
            });
          },
        }).catch(async (error, ctx) => {
          // Final fallback for database issues
          return { fallback: true, cached: true, error: error.message };
        });

        // Step 3: Validation with immediate fallback
        const validationResult = await ctx.step('data-validation', async () => {
          if (!networkResult.data || !databaseResult.data) {
            throw new ErrorHandling.ValidationError('Incomplete data', 'data');
          }
          return { valid: true, networkData: networkResult, databaseData: databaseResult };
        }).onError({
          ValidationError: async (error, ctx) => {
            // Use default values for validation errors
            return { 
              valid: false, 
              fallback: true,
              networkData: networkResult,
              databaseData: databaseResult,
            };
          },
        });

        return { 
          completed: true, 
          networkAttempts: networkCallCount,
          databaseAttempts: databaseCallCount,
          validation: validationResult,
        };
      };

      Workflow.define('multi-level-error-workflow', handler);

      const result = await Workflow.start('multi-level-error-workflow', 'multi-level-exec');

      expect(result.completed).toBe(true);
      expect(result.networkAttempts).toBe(3); // Failed twice, succeeded on third
      expect(result.databaseAttempts).toBe(2); // Failed once, succeeded on second
      expect(result.validation.valid).toBe(true);

      // Verify error recovery steps were created
      const steps = await Database.StepExecution.findByExecutionId('multi-level-exec');
      
      const logRetrySteps = steps.filter(s => s.stepName === 'log-network-retry');
      expect(logRetrySteps).toHaveLength(2); // Two network retry attempts

      const networkStep = steps.find(s => s.stepName === 'network-call');
      expect(networkStep?.status).toBe('completed');
      expect(networkStep?.output).toMatchObject({ data: 'network-success', attempts: 3 });

      const databaseStep = steps.find(s => s.stepName === 'database-operation');
      expect(databaseStep?.status).toBe('completed');
      expect(databaseStep?.output).toMatchObject({ data: 'database-success', attempts: 2 });
    });

    test('should handle cascading failures with graceful degradation', async () => {
      let serviceACallCount = 0;
      let serviceBCallCount = 0;

      const handler: WorkflowHandler = async (ctx) => {
        // Primary service call
        const primaryResult = await ctx.step('primary-service', async () => {
          serviceACallCount++;
          throw new ErrorHandling.ExternalServiceError(
            'Primary service unavailable', 
            'service-a', 
            'getData'
          );
        }).onError({
          ExternalServiceError: async (error, ctx) => {
            // Try secondary service
            const secondaryResult = await ctx.step('secondary-service', async () => {
              serviceBCallCount++;
              if (serviceBCallCount === 1) {
                throw new ErrorHandling.ExternalServiceError(
                  'Secondary service also failing',
                  'service-b',
                  'getData'
                );
              }
              return { data: 'secondary-success', source: 'service-b' };
            }).catch(async (error, ctx) => {
              // Use cached data as last resort
              await ctx.step('use-cached-data', async () => {
                return { 
                  data: 'cached-data',
                  source: 'cache',
                  reason: 'All services unavailable',
                };
              });
              
              return { data: 'cached-data', source: 'cache' };
            });

            return secondaryResult;
          },
        });

        // Data processing step that adapts to data source
        const processedResult = await ctx.step('process-data', async () => {
          const dataQuality = primaryResult.source === 'cache' ? 'degraded' : 'normal';
          return {
            processed: true,
            quality: dataQuality,
            source: primaryResult.source,
            data: primaryResult.data,
          };
        });

        return { 
          completed: true,
          primaryAttempts: serviceACallCount,
          secondaryAttempts: serviceBCallCount,
          result: processedResult,
        };
      };

      Workflow.define('cascading-failure-workflow', handler);

      const result = await Workflow.start('cascading-failure-workflow', 'cascading-exec');

      expect(result.completed).toBe(true);
      expect(result.primaryAttempts).toBe(1);
      expect(result.secondaryAttempts).toBe(1);
      expect(result.result.quality).toBe('degraded');
      expect(result.result.source).toBe('cache');

      // Verify fallback chain was executed
      const steps = await Database.StepExecution.findByExecutionId('cascading-exec');
      
      const primaryStep = steps.find(s => s.stepName === 'primary-service');
      expect(primaryStep?.status).toBe('completed'); // Completed via error handler

      const secondaryStep = steps.find(s => s.stepName === 'secondary-service');
      expect(secondaryStep?.status).toBe('completed'); // Completed via catch handler

      const cachedDataStep = steps.find(s => s.stepName === 'use-cached-data');
      expect(cachedDataStep?.status).toBe('completed');
    });
  });

  describe('circuit breaker integration with error recovery', () => {
    test('should coordinate circuit breakers across multiple workflow steps', async () => {
      let paymentCallCount = 0;
      let inventoryCallCount = 0;

      const handler: WorkflowHandler<{ orderId: string }, { orderProcessed: boolean }> = async (ctx) => {
        // Payment service with circuit breaker
        const paymentResult = await ctx.step('process-payment', async () => {
          paymentCallCount++;
          if (paymentCallCount <= 3) {
            throw new ErrorHandling.ExternalServiceError(
              'Payment service overloaded',
              'payment-service',
              'charge'
            );
          }
          return { charged: true, transactionId: `tx-${ctx.input.orderId}` };
        }).withCircuitBreaker({
          failureThreshold: 2,
          resetTimeout: 200,
          onOpen: async (ctx) => {
            await ctx.step('payment-circuit-open', async () => {
              return { message: 'Payment circuit breaker opened' };
            });
          },
        }).catch(async (error, ctx) => {
          // Use alternative payment method
          const alternativeResult = await ctx.step('alternative-payment', async () => {
            return { 
              charged: true, 
              transactionId: `alt-tx-${ctx.input.orderId}`,
              method: 'alternative',
            };
          });
          return alternativeResult;
        });

        // Inventory service with different circuit breaker
        const inventoryResult = await ctx.step('reserve-inventory', async () => {
          inventoryCallCount++;
          if (inventoryCallCount <= 2) {
            throw new ErrorHandling.ExternalServiceError(
              'Inventory service timeout',
              'inventory-service',
              'reserve'
            );
          }
          return { reserved: true, items: ['item1', 'item2'] };
        }).withCircuitBreaker({
          failureThreshold: 3,
          resetTimeout: 150,
        }).onError({
          ExternalServiceError: async (error, ctx) => {
            // Wait and retry for inventory
            await ctx.sleep('inventory-retry-delay', 50);
            throw error;
          },
        });

        // Coordination step
        await ctx.step('coordinate-services', async () => {
          if (paymentResult.method === 'alternative') {
            // Need to verify alternative payment
            return { coordination: 'alternative-payment-flow' };
          }
          return { coordination: 'standard-flow' };
        });

        return { 
          orderProcessed: true,
          payment: paymentResult,
          inventory: inventoryResult,
        };
      };

      Workflow.define('circuit-breaker-coordination-workflow', handler);

      const result = await Workflow.start(
        'circuit-breaker-coordination-workflow',
        'circuit-coord-exec',
        { orderId: 'order-123' }
      );

      expect(result.orderProcessed).toBe(true);
      expect(result.payment.charged).toBe(true);
      expect(result.payment.method).toBe('alternative'); // Should use alternative due to circuit breaker
      expect(result.inventory.reserved).toBe(true);

      // Verify circuit breaker states were managed
      const steps = await Database.StepExecution.findByExecutionId('circuit-coord-exec');
      
      const paymentCircuitStep = steps.find(s => s.stepName === 'payment-circuit-open');
      expect(paymentCircuitStep?.status).toBe('completed');

      const alternativePaymentStep = steps.find(s => s.stepName === 'alternative-payment');
      expect(alternativePaymentStep?.status).toBe('completed');
    });

    test('should handle circuit breaker recovery and state transitions', async () => {
      let serviceCallCount = 0;

      const handler: WorkflowHandler = async (ctx) => {
        const result = await ctx.step('flaky-service', async () => {
          serviceCallCount++;
          
          // Fail for first 2 calls, then succeed
          if (serviceCallCount <= 2) {
            throw new ErrorHandling.ExternalServiceError(
              'Service temporarily down',
              'flaky-service',
              'process'
            );
          }
          
          return { success: true, callCount: serviceCallCount };
        }).withCircuitBreaker({
          failureThreshold: 2,
          resetTimeout: 50, // Short timeout for test
        });

        return { completed: true, result };
      };

      Workflow.define('circuit-recovery-workflow', handler);

      // First execution should fail and open circuit
      await expect(
        Workflow.start('circuit-recovery-workflow', 'circuit-recovery-1', undefined, {
          retry: { maxAttempts: 1, backoffMs: 10, exponentialBackoff: false },
        })
      ).rejects.toThrow('Service temporarily down');

      // Wait for circuit breaker reset timeout
      await new Promise(resolve => setTimeout(resolve, 100));

      // Second execution should succeed (circuit moves to half-open, then closed)
      const result = await Workflow.start('circuit-recovery-workflow', 'circuit-recovery-2');

      expect(result.completed).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.callCount).toBe(3); // Total calls across both executions
    });
  });

  describe('workflow-level error recovery', () => {
    test('should handle workflow interruption and resume with state recovery', async () => {
      let stepCompletionState: Record<string, boolean> = {};

      const handler: WorkflowHandler = async (ctx) => {
        // Step 1: Always completes successfully
        await ctx.step('initialize', async () => {
          stepCompletionState.initialize = true;
          return { initialized: true, timestamp: Date.now() };
        });

        // Step 2: Fails on first workflow execution
        await ctx.step('process-data', async () => {
          if (!stepCompletionState.processData) {
            stepCompletionState.processData = true;
            throw new Error('Simulated workflow interruption');
          }
          return { processed: true, data: 'important-data' };
        });

        // Step 3: Should only execute after successful resume
        await ctx.step('finalize', async () => {
          stepCompletionState.finalize = true;
          return { finalized: true };
        });

        return { 
          completed: true, 
          state: stepCompletionState 
        };
      };

      Workflow.define('interruption-recovery-workflow', handler);

      // First execution should fail at process-data step
      await expect(
        Workflow.start('interruption-recovery-workflow', 'interruption-exec', undefined, {
          retry: { maxAttempts: 1, backoffMs: 10, exponentialBackoff: false },
        })
      ).rejects.toThrow('Simulated workflow interruption');

      // Verify initial step was completed and persisted
      let steps = await Database.StepExecution.findByExecutionId('interruption-exec');
      const initializeStep = steps.find(s => s.stepName === 'initialize');
      expect(initializeStep?.status).toBe('completed');

      const processDataStep = steps.find(s => s.stepName === 'process-data');
      expect(processDataStep?.status).toBe('failed');

      // Resume should continue from where it left off
      const result = await Workflow.resume('interruption-exec');

      expect(result.completed).toBe(true);
      expect(result.state.initialize).toBe(true);
      expect(result.state.processData).toBe(true);
      expect(result.state.finalize).toBe(true);

      // Verify all steps are now completed
      steps = await Database.StepExecution.findByExecutionId('interruption-exec');
      
      const finalizeStep = steps.find(s => s.stepName === 'finalize');
      expect(finalizeStep?.status).toBe('completed');
    });

    test('should handle complex data flow recovery across workflow resumption', async () => {
      const handler: WorkflowHandler<{ processId: string }, { result: any }> = async (ctx) => {
        // Step 1: Generate initial data
        const initialData = await ctx.step('generate-data', async () => {
          return {
            processId: ctx.input.processId,
            data: Array.from({ length: 5 }, (_, i) => ({ id: i, value: `item-${i}` })),
            timestamp: Date.now(),
          };
        });

        // Step 2: Transform data (may fail on first attempt)
        const transformedData = await ctx.step('transform-data', async () => {
          // Simulate failure on first attempt by checking execution attempt
          if (ctx.attempt === 1) {
            throw new Error('Transformation service temporarily unavailable');
          }
          
          return {
            processId: initialData.processId,
            transformed: initialData.data.map(item => ({
              ...item,
              processed: true,
              transformedAt: Date.now(),
            })),
            originalCount: initialData.data.length,
          };
        });

        // Step 3: Validate transformed data
        const validatedData = await ctx.step('validate-data', async () => {
          const validItems = transformedData.transformed.filter(item => item.processed);
          
          if (validItems.length !== transformedData.originalCount) {
            throw new ErrorHandling.ValidationError(
              'Data validation failed - count mismatch',
              'count'
            );
          }
          
          return {
            processId: transformedData.processId,
            validated: validItems,
            validationPassed: true,
          };
        }).onError({
          ValidationError: async (error, ctx) => {
            // Create validation report
            await ctx.step('create-validation-report', async () => {
              return {
                error: error.message,
                field: (error as any).field,
                timestamp: Date.now(),
                processId: transformedData.processId,
              };
            });
            
            // Use transformed data despite validation failure
            return {
              processId: transformedData.processId,
              validated: transformedData.transformed,
              validationPassed: false,
              validationError: error.message,
            };
          },
        });

        // Step 4: Final aggregation
        await ctx.step('aggregate-results', async () => {
          return {
            processId: validatedData.processId,
            totalItems: validatedData.validated.length,
            validationStatus: validatedData.validationPassed,
            completedAt: Date.now(),
          };
        });

        return {
          result: {
            processId: ctx.input.processId,
            dataFlow: {
              initial: initialData,
              transformed: transformedData,
              validated: validatedData,
            },
            status: 'completed',
          },
        };
      };

      Workflow.define('data-flow-recovery-workflow', handler);

      // First execution should fail at transform-data step
      await expect(
        Workflow.start(
          'data-flow-recovery-workflow',
          'data-flow-exec',
          { processId: 'proc-456' },
          { retry: { maxAttempts: 1, backoffMs: 10, exponentialBackoff: false } }
        )
      ).rejects.toThrow('Transformation service temporarily unavailable');

      // Resume should succeed and maintain data flow
      const result = await Workflow.resume('data-flow-exec');

      expect(result.result.status).toBe('completed');
      expect(result.result.processId).toBe('proc-456');
      expect(result.result.dataFlow.initial.processId).toBe('proc-456');
      expect(result.result.dataFlow.transformed.originalCount).toBe(5);
      expect(result.result.dataFlow.validated.validationPassed).toBe(true);

      // Verify data consistency across resumption
      const steps = await Database.StepExecution.findByExecutionId('data-flow-exec');
      
      const generateStep = steps.find(s => s.stepName === 'generate-data');
      const transformStep = steps.find(s => s.stepName === 'transform-data');
      const validateStep = steps.find(s => s.stepName === 'validate-data');
      const aggregateStep = steps.find(s => s.stepName === 'aggregate-results');

      expect(generateStep?.status).toBe('completed');
      expect(transformStep?.status).toBe('completed');
      expect(validateStep?.status).toBe('completed');
      expect(aggregateStep?.status).toBe('completed');

      // Verify data was preserved across resumption
      expect((generateStep?.output as any)?.processId).toBe('proc-456');
      expect((transformStep?.output as any)?.processId).toBe('proc-456');
      expect((validateStep?.output as any)?.processId).toBe('proc-456');
    });
  });

  describe('system-level error handling', () => {
    test('should handle database connection issues with graceful degradation', async () => {
      // This test simulates database issues by using error handlers
      let databaseIssueSimulated = false;

      const handler: WorkflowHandler = async (ctx) => {
        // Step that simulates database connectivity issues
        const result = await ctx.step('database-dependent-operation', async () => {
          if (!databaseIssueSimulated) {
            databaseIssueSimulated = true;
            throw new ErrorHandling.DatabaseError('Connection pool exhausted', 'select');
          }
          return { data: 'database-success' };
        }).onError({
          DatabaseError: async (error, ctx) => {
            // Implement graceful degradation
            await ctx.step('fallback-to-memory', async () => {
              return {
                fallback: true,
                data: 'memory-cache-data',
                reason: 'Database connectivity issue',
              };
            });
            
            // Return fallback result
            return { data: 'memory-cache-data', fallback: true };
          },
        });

        return { completed: true, result };
      };

      Workflow.define('database-resilience-workflow', handler);

      const result = await Workflow.start('database-resilience-workflow', 'db-resilience-exec');

      expect(result.completed).toBe(true);
      expect(result.result.fallback).toBe(true);
      expect(result.result.data).toBe('memory-cache-data');

      // Verify fallback step was created
      const steps = await Database.StepExecution.findByExecutionId('db-resilience-exec');
      const fallbackStep = steps.find(s => s.stepName === 'fallback-to-memory');
      expect(fallbackStep?.status).toBe('completed');
    });

    test('should handle memory pressure and resource constraints', async () => {
      const handler: WorkflowHandler = async (ctx) => {
        // Simulate memory-intensive operation
        const result = await ctx.step('memory-intensive-operation', async () => {
          // Simulate memory pressure detection
          const memoryUsage = process.memoryUsage();
          if (memoryUsage.heapUsed > 1000000000) { // 1GB threshold (unrealistic for test)
            throw new ErrorHandling.ResourceError(
              'Memory usage too high',
              'memory',
              1000000000,
              memoryUsage.heapUsed
            );
          }
          
          // Simulate processing large dataset
          const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            data: `large-data-item-${i}`,
          }));
          
          return { processed: largeDataset.length, memoryUsed: memoryUsage.heapUsed };
        }).onError({
          ResourceError: async (error, ctx) => {
            // Implement batch processing for memory constraints
            await ctx.step('batch-processing-fallback', async () => {
              // Process in smaller batches
              const batchSize = 100;
              const batches = Math.ceil(1000 / batchSize);
              
              return {
                processedInBatches: true,
                totalBatches: batches,
                batchSize,
                reason: 'Memory constraint mitigation',
              };
            });
            
            return { processed: 1000, fallback: true, batched: true };
          },
        });

        return { completed: true, processing: result };
      };

      Workflow.define('resource-constraint-workflow', handler);

      const result = await Workflow.start('resource-constraint-workflow', 'resource-exec');

      expect(result.completed).toBe(true);
      expect(result.processing.processed).toBe(1000);
      
      // Memory constraints are unlikely to trigger in test environment,
      // but workflow should complete successfully regardless
    });
  });
});