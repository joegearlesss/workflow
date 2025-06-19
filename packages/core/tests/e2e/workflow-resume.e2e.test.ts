import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Workflow } from '../../src/workflow';
import { DatabaseClient, Database } from '../../src/database';
import { ErrorHandling } from '../../src/error-handling';
import type { WorkflowHandler } from '../../src/types';
import { TestSetup } from '../setup';

describe('Workflow Resume E2E Tests', () => {
  beforeEach(async () => {
    await TestSetup.createTestDatabase();
    await Workflow.initialize();
  });

  afterEach(() => {
    TestSetup.closeTestDatabase();
  });

  describe('long-running batch processing workflow', () => {
    test('should handle interruption and resume of batch processing workflow', async () => {
      // Simulate external state that persists across workflow executions
      const batchProcessingState = {
        processedBatches: [] as any[],
        currentBatch: 0,
        totalBatches: 5,
        interruptionOccurred: false,
      };

      const batchProcessingHandler: WorkflowHandler<{
        jobId: string;
        batchSize: number;
        totalItems: number;
      }, {
        completed: boolean;
        processedItems: number;
        totalBatches: number;
      }> = async (ctx) => {
        const { jobId, batchSize, totalItems } = ctx.input;

        // Step 1: Initialize batch processing
        const initialization = await ctx.step('initialize-batch-processing', async () => {
          const totalBatches = Math.ceil(totalItems / batchSize);
          
          if (batchProcessingState.currentBatch === 0) {
            batchProcessingState.totalBatches = totalBatches;
          }

          return {
            jobId,
            totalBatches,
            batchSize,
            totalItems,
            initializedAt: new Date(),
          };
        });

        // Step 2: Process batches sequentially
        for (let batchIndex = batchProcessingState.currentBatch; batchIndex < initialization.totalBatches; batchIndex++) {
          const batchResult = await ctx.step(`process-batch-${batchIndex}`, async () => {
            // Simulate batch processing
            const startItem = batchIndex * batchSize;
            const endItem = Math.min(startItem + batchSize, totalItems);
            const batchItems = Array.from(
              { length: endItem - startItem }, 
              (_, i) => ({ id: startItem + i, data: `item-${startItem + i}` })
            );

            // Simulate interruption on batch 3 during first execution
            if (batchIndex === 3 && !batchProcessingState.interruptionOccurred && ctx.attempt === 1) {
              batchProcessingState.interruptionOccurred = true;
              throw new Error('System interruption during batch processing');
            }

            // Process the batch
            const processedItems = batchItems.map(item => ({
              ...item,
              processed: true,
              processedAt: new Date(),
              batchIndex,
            }));

            batchProcessingState.processedBatches.push({
              batchIndex,
              items: processedItems,
              processedAt: new Date(),
            });

            batchProcessingState.currentBatch = batchIndex + 1;

            return {
              batchIndex,
              itemsProcessed: processedItems.length,
              startItem,
              endItem,
              processedAt: new Date(),
            };
          }).onError({
            default: async (error, ctx) => {
              // Log batch failure
              await ctx.step(`log-batch-failure-${batchIndex}`, async () => {
                return {
                  batchIndex,
                  error: error.message,
                  failedAt: new Date(),
                  canRetry: true,
                };
              });
              
              throw error; // Re-throw to fail workflow
            },
          });

          // Step 3: Update progress after each batch
          await ctx.step(`update-progress-${batchIndex}`, async () => {
            const completedBatches = batchIndex + 1;
            const progressPercentage = (completedBatches / initialization.totalBatches) * 100;
            
            return {
              completedBatches,
              totalBatches: initialization.totalBatches,
              progressPercentage,
              updatedAt: new Date(),
            };
          });

          // Add small delay between batches to simulate processing time
          await ctx.sleep(`batch-delay-${batchIndex}`, 5);
        }

        // Step 4: Finalize processing
        const finalization = await ctx.step('finalize-batch-processing', async () => {
          const totalProcessedItems = batchProcessingState.processedBatches.reduce(
            (sum, batch) => sum + batch.items.length,
            0
          );

          return {
            jobId,
            totalProcessedItems,
            totalBatches: batchProcessingState.processedBatches.length,
            finalizedAt: new Date(),
            allBatchesCompleted: batchProcessingState.currentBatch >= initialization.totalBatches,
          };
        });

        // Step 5: Cleanup
        await ctx.step('cleanup-batch-resources', async () => {
          return {
            cleaned: true,
            resourcesFreed: ['temp-files', 'memory-cache', 'batch-locks'],
            cleanedAt: new Date(),
          };
        });

        return {
          completed: true,
          processedItems: finalization.totalProcessedItems,
          totalBatches: finalization.totalBatches,
        };
      };

      Workflow.define('batch-processing-workflow', batchProcessingHandler);

      const batchJob = {
        jobId: 'batch-job-e2e-001',
        batchSize: 10,
        totalItems: 50, // 5 batches
      };

      // First execution should fail on batch 3
      await expect(
        Workflow.start('batch-processing-workflow', 'batch-resume-exec-001', batchJob, {
          retry: { maxAttempts: 1, backoffMs: 10, exponentialBackoff: false },
        })
      ).rejects.toThrow('System interruption during batch processing');

      // Verify partial progress was saved
      let steps = await Database.StepExecution.findByExecutionId('batch-resume-exec-001');
      
      // Should have completed batches 0, 1, 2 and failed on batch 3
      const completedBatchSteps = steps.filter(s => 
        s.stepName.startsWith('process-batch-') && s.status === 'completed'
      );
      expect(completedBatchSteps).toHaveLength(3); // batches 0, 1, 2

      const failedBatchStep = steps.find(s => 
        s.stepName === 'process-batch-3' && s.status === 'failed'
      );
      expect(failedBatchStep).toBeDefined();

      // Verify external state reflects partial progress
      expect(batchProcessingState.processedBatches).toHaveLength(3);
      expect(batchProcessingState.currentBatch).toBe(3);

      // Resume workflow - should continue from batch 3
      const result = await Workflow.resume('batch-resume-exec-001');

      expect(result.completed).toBe(true);
      expect(result.processedItems).toBe(50);
      expect(result.totalBatches).toBe(5);

      // Verify all batches were eventually processed
      expect(batchProcessingState.processedBatches).toHaveLength(5);
      expect(batchProcessingState.currentBatch).toBe(5);

      // Verify final workflow state
      const execution = await Database.WorkflowExecution.findById('batch-resume-exec-001');
      expect(execution?.status).toBe('completed');

      // Verify all steps eventually completed
      steps = await Database.StepExecution.findByExecutionId('batch-resume-exec-001');
      
      const allBatchSteps = steps.filter(s => s.stepName.startsWith('process-batch-'));
      expect(allBatchSteps).toHaveLength(5);
      
      const completedBatchStepsAfterResume = allBatchSteps.filter(s => s.status === 'completed');
      expect(completedBatchStepsAfterResume).toHaveLength(5);

      // Verify finalization and cleanup steps completed
      const finalizationStep = steps.find(s => s.stepName === 'finalize-batch-processing');
      expect(finalizationStep?.status).toBe('completed');

      const cleanupStep = steps.find(s => s.stepName === 'cleanup-batch-resources');
      expect(cleanupStep?.status).toBe('completed');
    });
  });

  describe('multi-stage data migration workflow', () => {
    test('should handle complex data migration with interruption and state recovery', async () => {
      // Simulate migration state
      const migrationState = {
        sourceRecords: Array.from({ length: 100 }, (_, i) => ({ 
          id: i + 1, 
          legacy_data: `legacy-${i + 1}`,
          migrated: false 
        })),
        migratedRecords: [] as any[],
        currentStage: 'not-started',
        stageProgress: {} as Record<string, number>,
        interruptionPoint: null as string | null,
      };

      const dataMigrationHandler: WorkflowHandler<{
        migrationId: string;
        sourceSystem: string;
        targetSystem: string;
      }, {
        migrationCompleted: boolean;
        recordsMigrated: number;
        stages: string[];
      }> = async (ctx) => {
        const { migrationId, sourceSystem, targetSystem } = ctx.input;

        // Stage 1: Pre-migration validation
        const validation = await ctx.step('pre-migration-validation', async () => {
          if (migrationState.currentStage === 'not-started') {
            migrationState.currentStage = 'validation';
          }

          // Validate source data
          const invalidRecords = migrationState.sourceRecords.filter(record => 
            !record.legacy_data || record.legacy_data.length === 0
          );

          if (invalidRecords.length > 0) {
            throw new ErrorHandling.ValidationError(
              `Found ${invalidRecords.length} invalid records`,
              'source-data'
            );
          }

          migrationState.stageProgress.validation = 100;
          return {
            totalRecords: migrationState.sourceRecords.length,
            validRecords: migrationState.sourceRecords.length - invalidRecords.length,
            validationPassed: true,
          };
        }).onError({
          ValidationError: async (error, ctx) => {
            // Clean invalid records
            await ctx.step('clean-invalid-records', async () => {
              const cleanedRecords = migrationState.sourceRecords.filter(record => 
                record.legacy_data && record.legacy_data.length > 0
              );
              
              migrationState.sourceRecords = cleanedRecords;
              
              return {
                cleanedRecords: cleanedRecords.length,
                removedRecords: migrationState.sourceRecords.length - cleanedRecords.length,
              };
            });
            
            return {
              totalRecords: migrationState.sourceRecords.length,
              validRecords: migrationState.sourceRecords.length,
              validationPassed: true,
              cleaned: true,
            };
          },
        });

        // Stage 2: Schema transformation
        const schemaTransformation = await ctx.step('schema-transformation', async () => {
          if (migrationState.currentStage !== 'transformation') {
            migrationState.currentStage = 'transformation';
          }

          // Simulate interruption during schema transformation
          if (ctx.attempt === 1 && !migrationState.interruptionPoint) {
            migrationState.interruptionPoint = 'schema-transformation';
            throw new Error('Network interruption during schema transformation');
          }

          // Transform schema for each record
          const transformedRecords = migrationState.sourceRecords.map(record => ({
            new_id: `new_${record.id}`,
            modern_data: record.legacy_data.replace('legacy-', 'modern-'),
            migrated_at: new Date(),
            original_id: record.id,
          }));

          migrationState.stageProgress.transformation = 100;
          return {
            transformedRecords,
            transformationRules: ['id_mapping', 'data_modernization', 'timestamp_addition'],
          };
        });

        // Stage 3: Data migration in batches
        const batchSize = 20;
        const totalBatches = Math.ceil(schemaTransformation.transformedRecords.length / batchSize);
        
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
          await ctx.step(`migrate-batch-${batchIndex}`, async () => {
            if (migrationState.currentStage !== 'migration') {
              migrationState.currentStage = 'migration';
            }

            const startIndex = batchIndex * batchSize;
            const endIndex = Math.min(startIndex + batchSize, schemaTransformation.transformedRecords.length);
            const batchRecords = schemaTransformation.transformedRecords.slice(startIndex, endIndex);

            // Simulate interruption during batch 2
            if (batchIndex === 2 && ctx.attempt === 1 && migrationState.interruptionPoint === 'schema-transformation') {
              migrationState.interruptionPoint = `migrate-batch-${batchIndex}`;
              throw new Error('Database timeout during batch migration');
            }

            // "Migrate" the batch
            const migratedBatch = batchRecords.map(record => ({
              ...record,
              migrated: true,
              batch_index: batchIndex,
              migrated_at: new Date(),
            }));

            migrationState.migratedRecords.push(...migratedBatch);
            
            // Update progress
            const currentProgress = ((batchIndex + 1) / totalBatches) * 100;
            migrationState.stageProgress.migration = currentProgress;

            return {
              batchIndex,
              recordsMigrated: migratedBatch.length,
              totalMigrated: migrationState.migratedRecords.length,
              progressPercentage: currentProgress,
            };
          }).onError({
            default: async (error, ctx) => {
              // Log batch migration error
              await ctx.step(`log-migration-error-${batchIndex}`, async () => {
                return {
                  batchIndex,
                  error: error.message,
                  timestamp: new Date(),
                  retryable: true,
                };
              });
              
              throw error;
            },
          });

          // Add delay between batches
          await ctx.sleep(`migration-batch-delay-${batchIndex}`, 2);
        }

        // Stage 4: Post-migration validation
        const postValidation = await ctx.step('post-migration-validation', async () => {
          migrationState.currentStage = 'post-validation';

          const sourceCount = validation.validRecords;
          const migratedCount = migrationState.migratedRecords.length;

          if (sourceCount !== migratedCount) {
            throw new ErrorHandling.ValidationError(
              `Record count mismatch: source=${sourceCount}, migrated=${migratedCount}`,
              'record-count'
            );
          }

          // Validate data integrity
          const corruptedRecords = migrationState.migratedRecords.filter(record =>
            !record.new_id || !record.modern_data
          );

          if (corruptedRecords.length > 0) {
            throw new ErrorHandling.ValidationError(
              `Found ${corruptedRecords.length} corrupted records`,
              'data-integrity'
            );
          }

          migrationState.stageProgress.postValidation = 100;
          return {
            sourceRecords: sourceCount,
            migratedRecords: migratedCount,
            validationPassed: true,
            integrityChecked: true,
          };
        });

        // Stage 5: Finalization
        await ctx.step('finalize-migration', async () => {
          migrationState.currentStage = 'completed';

          // Mark source records as migrated
          migrationState.sourceRecords.forEach(record => {
            record.migrated = true;
          });

          return {
            migrationId,
            completedAt: new Date(),
            sourceSystem,
            targetSystem,
            finalRecordCount: migrationState.migratedRecords.length,
            allStagesCompleted: Object.keys(migrationState.stageProgress).length === 3,
          };
        });

        return {
          migrationCompleted: true,
          recordsMigrated: migrationState.migratedRecords.length,
          stages: ['validation', 'transformation', 'migration', 'post-validation'],
        };
      };

      Workflow.define('data-migration-workflow', dataMigrationHandler);

      const migrationJob = {
        migrationId: 'migration-e2e-001',
        sourceSystem: 'legacy-db',
        targetSystem: 'modern-db',
      };

      // First execution should fail during migration batch 2
      await expect(
        Workflow.start('data-migration-workflow', 'migration-resume-exec-001', migrationJob, {
          retry: { maxAttempts: 1, backoffMs: 10, exponentialBackoff: false },
        })
      ).rejects.toThrow('Database timeout during batch migration');

      // Verify partial progress
      let steps = await Database.StepExecution.findByExecutionId('migration-resume-exec-001');
      
      // Should have completed validation, transformation, and first 2 migration batches
      const validationStep = steps.find(s => s.stepName === 'pre-migration-validation');
      expect(validationStep?.status).toBe('completed');

      const transformationStep = steps.find(s => s.stepName === 'schema-transformation');
      expect(transformationStep?.status).toBe('completed');

      const completedMigrationBatches = steps.filter(s => 
        s.stepName.startsWith('migrate-batch-') && s.status === 'completed'
      );
      expect(completedMigrationBatches).toHaveLength(2); // batches 0 and 1

      // Verify external state reflects partial migration
      expect(migrationState.currentStage).toBe('migration');
      expect(migrationState.migratedRecords.length).toBe(40); // 2 batches × 20 records
      expect(migrationState.stageProgress.validation).toBe(100);
      expect(migrationState.stageProgress.transformation).toBe(100);

      // Resume workflow - should continue from failed batch
      const result = await Workflow.resume('migration-resume-exec-001');

      expect(result.migrationCompleted).toBe(true);
      expect(result.recordsMigrated).toBe(100);
      expect(result.stages).toContain('validation');
      expect(result.stages).toContain('transformation');
      expect(result.stages).toContain('migration');
      expect(result.stages).toContain('post-validation');

      // Verify final migration state
      expect(migrationState.currentStage).toBe('completed');
      expect(migrationState.migratedRecords).toHaveLength(100);
      expect(migrationState.stageProgress.migration).toBe(100);
      expect(migrationState.stageProgress.postValidation).toBe(100);

      // Verify workflow completion
      const execution = await Database.WorkflowExecution.findById('migration-resume-exec-001');
      expect(execution?.status).toBe('completed');

      // Verify all migration batches completed
      steps = await Database.StepExecution.findByExecutionId('migration-resume-exec-001');
      const allMigrationBatches = steps.filter(s => s.stepName.startsWith('migrate-batch-'));
      expect(allMigrationBatches).toHaveLength(5); // 5 batches total
      
      const completedBatches = allMigrationBatches.filter(s => s.status === 'completed');
      expect(completedBatches).toHaveLength(5);

      // Verify post-validation and finalization completed
      const postValidationStep = steps.find(s => s.stepName === 'post-migration-validation');
      expect(postValidationStep?.status).toBe('completed');

      const finalizationStep = steps.find(s => s.stepName === 'finalize-migration');
      expect(finalizationStep?.status).toBe('completed');
    });
  });

  describe('external service integration workflow', () => {
    test('should handle external service failures and resume with service recovery', async () => {
      // Simulate external services with varying availability
      const externalServices = {
        authService: { available: false, calls: 0 },
        dataService: { available: true, calls: 0 },
        processingService: { available: false, calls: 0 },
        notificationService: { available: true, calls: 0 },
      };

      // Simulate service recovery after some time
      setTimeout(() => {
        externalServices.authService.available = true;
        externalServices.processingService.available = true;
      }, 50);

      const serviceIntegrationHandler: WorkflowHandler<{
        userId: string;
        operation: string;
        data: any;
      }, {
        completed: boolean;
        servicesUsed: string[];
        operationResult: any;
      }> = async (ctx) => {
        const { userId, operation, data } = ctx.input;

        // Step 1: Authenticate with auth service
        const authentication = await ctx.step('authenticate-user', async () => {
          externalServices.authService.calls++;
          
          if (!externalServices.authService.available) {
            throw new ErrorHandling.ExternalServiceError(
              'Authentication service unavailable',
              'auth-service',
              'authenticate'
            );
          }

          return {
            userId,
            token: `auth-token-${userId}-${Date.now()}`,
            authenticatedAt: new Date(),
          };
        }).withCircuitBreaker({
          failureThreshold: 3,
          resetTimeout: 100,
          onOpen: async (ctx) => {
            await ctx.step('auth-circuit-open', async () => {
              return { message: 'Auth service circuit breaker opened' };
            });
          },
        }).onError({
          ExternalServiceError: async (error, ctx) => {
            // Use cached credentials as fallback
            const cachedAuth = await ctx.step('use-cached-auth', async () => {
              return {
                userId,
                token: `cached-token-${userId}`,
                cached: true,
                authenticatedAt: new Date(),
              };
            });
            
            return cachedAuth;
          },
        });

        // Step 2: Fetch user data
        const userData = await ctx.step('fetch-user-data', async () => {
          externalServices.dataService.calls++;
          
          if (!externalServices.dataService.available) {
            throw new ErrorHandling.ExternalServiceError(
              'Data service unavailable',
              'data-service',
              'fetchUser'
            );
          }

          return {
            userId,
            profile: { name: 'Test User', email: 'test@example.com' },
            preferences: { theme: 'dark', notifications: true },
            fetchedAt: new Date(),
          };
        }).onError({
          ExternalServiceError: async (error, ctx) => {
            // Use minimal user data
            return {
              userId,
              profile: { name: 'User', email: 'unknown@example.com' },
              preferences: {},
              minimal: true,
              fetchedAt: new Date(),
            };
          },
        });

        // Step 3: Process data with processing service
        const processing = await ctx.step('process-data', async () => {
          externalServices.processingService.calls++;
          
          if (!externalServices.processingService.available) {
            throw new ErrorHandling.ExternalServiceError(
              'Processing service unavailable',
              'processing-service',
              'processData'
            );
          }

          return {
            operation,
            input: data,
            result: `processed-${operation}-${JSON.stringify(data)}`,
            processedBy: 'processing-service',
            processedAt: new Date(),
          };
        }).withCircuitBreaker({
          failureThreshold: 2,
          resetTimeout: 80,
        }).onError({
          ExternalServiceError: async (error, ctx) => {
            // Try local processing as fallback
            const localProcessing = await ctx.step('local-processing-fallback', async () => {
              return {
                operation,
                input: data,
                result: `local-processed-${operation}-${JSON.stringify(data)}`,
                processedBy: 'local-processor',
                fallback: true,
                processedAt: new Date(),
              };
            });
            
            return localProcessing;
          },
        });

        // Step 4: Send notification
        const notification = await ctx.step('send-notification', async () => {
          externalServices.notificationService.calls++;
          
          if (!externalServices.notificationService.available) {
            throw new ErrorHandling.ExternalServiceError(
              'Notification service unavailable',
              'notification-service',
              'sendNotification'
            );
          }

          return {
            userId,
            type: 'operation-completed',
            message: `Operation ${operation} completed successfully`,
            sentAt: new Date(),
          };
        }).catch(async (error, ctx) => {
          // Queue notification for later
          await ctx.step('queue-notification', async () => {
            return {
              queued: true,
              userId,
              operation,
              queuedAt: new Date(),
            };
          });
          
          return { queued: true };
        });

        // Step 5: Log operation completion
        await ctx.step('log-operation', async () => {
          return {
            operation,
            userId,
            authMethod: authentication.cached ? 'cached' : 'service',
            dataSource: userData.minimal ? 'minimal' : 'full',
            processor: processing.processedBy,
            notificationStatus: notification.queued ? 'queued' : 'sent',
            completedAt: new Date(),
          };
        });

        const servicesUsed = [];
        if (!authentication.cached) servicesUsed.push('auth-service');
        if (!userData.minimal) servicesUsed.push('data-service');
        if (processing.processedBy === 'processing-service') servicesUsed.push('processing-service');
        if (!notification.queued) servicesUsed.push('notification-service');

        return {
          completed: true,
          servicesUsed,
          operationResult: processing.result,
        };
      };

      Workflow.define('service-integration-workflow', serviceIntegrationHandler);

      const integrationJob = {
        userId: 'user-service-001',
        operation: 'data-analysis',
        data: { type: 'user-behavior', timeframe: '30days' },
      };

      // First execution should fail due to unavailable services
      await expect(
        Workflow.start('service-integration-workflow', 'service-resume-exec-001', integrationJob, {
          retry: { maxAttempts: 1, backoffMs: 10, exponentialBackoff: false },
        })
      ).rejects.toThrow();

      // Wait for services to become available
      await TestSetup.waitForAsync(100);

      // Resume workflow - should succeed with recovered services
      const result = await Workflow.resume('service-resume-exec-001');

      expect(result.completed).toBe(true);
      expect(result.servicesUsed.length).toBeGreaterThan(0);
      expect(result.operationResult).toContain('data-analysis');

      // Verify workflow adapted to service availability
      const steps = await Database.StepExecution.findByExecutionId('service-resume-exec-001');
      
      // Should have fallback steps for initially unavailable services
      const cachedAuthStep = steps.find(s => s.stepName === 'use-cached-auth');
      const localProcessingStep = steps.find(s => s.stepName === 'local-processing-fallback');
      
      // At least one fallback should have been used initially
      expect(cachedAuthStep || localProcessingStep).toBeDefined();

      // Verify final completion
      const execution = await Database.WorkflowExecution.findById('service-resume-exec-001');
      expect(execution?.status).toBe('completed');

      // Verify service call patterns
      expect(externalServices.authService.calls).toBeGreaterThan(0);
      expect(externalServices.dataService.calls).toBeGreaterThan(0);
      expect(externalServices.processingService.calls).toBeGreaterThan(0);
    });
  });
});