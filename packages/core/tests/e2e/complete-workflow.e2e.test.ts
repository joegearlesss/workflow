import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Workflow } from '../../src/workflow';
import { DatabaseClient, Database } from '../../src/database';
import { ErrorHandling } from '../../src/error-handling';
import type { WorkflowHandler } from '../../src/types';
import { TestSetup } from '../setup';

describe('Complete Workflow E2E Tests', () => {
  beforeEach(async () => {
    await TestSetup.createTestDatabase();
  });

  afterEach(() => {
    TestSetup.closeTestDatabase();
  });

  describe('e-commerce order processing workflow', () => {
    test('should process complete order workflow from start to finish', async () => {
      // Simulate external services state
      const externalServices = {
        inventory: new Map([
          ['product-1', 10],
          ['product-2', 5],
          ['product-3', 0], // Out of stock
        ]),
        paymentGateway: { available: true, processedPayments: [] as any[] },
        shippingService: { available: true, createdLabels: [] as any[] },
        notificationService: { sentNotifications: [] as any[] },
      };

      const orderProcessingHandler: WorkflowHandler<{
        orderId: string;
        customerId: string;
        items: Array<{ productId: string; quantity: number; price: number }>;
      }, {
        orderStatus: string;
        totalAmount: number;
        processedItems: any[];
      }> = async (ctx) => {
        const { orderId, customerId, items } = ctx.input;

        // Step 1: Validate order data
        const validation = await ctx.step('validate-order', async () => {
          if (!orderId || !customerId || !items?.length) {
            throw new ErrorHandling.ValidationError('Invalid order data', 'order');
          }

          const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          
          if (totalAmount <= 0) {
            throw new ErrorHandling.ValidationError('Invalid order total', 'amount');
          }

          return { valid: true, totalAmount, itemCount: items.length };
        }).onError({
          ValidationError: async (error, ctx) => {
            await ctx.step('log-validation-error', async () => {
              return { error: error.message, orderId, timestamp: new Date() };
            });
            throw error; // Re-throw to fail workflow
          },
        });

        // Step 2: Check inventory availability
        const inventoryCheck = await ctx.step('check-inventory', async () => {
          const availableItems = [];
          const unavailableItems = [];

          for (const item of items) {
            const stock = externalServices.inventory.get(item.productId) || 0;
            if (stock >= item.quantity) {
              availableItems.push({ ...item, availableStock: stock });
            } else {
              unavailableItems.push({ ...item, availableStock: stock });
            }
          }

          if (unavailableItems.length > 0) {
            throw new ErrorHandling.ValidationError('Insufficient inventory', 'inventory');
          }

          return { availableItems, allItemsAvailable: true };
        }).onError({
          ValidationError: async (error, ctx) => {
            // Try to find alternative products
            const alternatives = await ctx.step('find-alternatives', async () => {
              // Simulate finding alternative products
              const alternativeProducts = items
                .filter(item => externalServices.inventory.get(item.productId) === 0)
                .map(item => ({
                  original: item.productId,
                  alternative: `${item.productId}-alt`,
                  available: true,
                }));

              return { alternatives: alternativeProducts };
            });

            // For this test, proceed with available items only
            const availableItems = items.filter(item => 
              (externalServices.inventory.get(item.productId) || 0) >= item.quantity
            );

            return { 
              availableItems, 
              allItemsAvailable: false, 
              alternatives: alternatives.alternatives 
            };
          },
        });

        // Step 3: Reserve inventory
        await ctx.step('reserve-inventory', async () => {
          const reservations = [];
          
          for (const item of inventoryCheck.availableItems) {
            const currentStock = externalServices.inventory.get(item.productId) || 0;
            externalServices.inventory.set(item.productId, currentStock - item.quantity);
            reservations.push({
              productId: item.productId,
              quantity: item.quantity,
              reservedAt: new Date(),
            });
          }

          return { reservations, reservedCount: reservations.length };
        });

        // Step 4: Process payment
        const payment = await ctx.step('process-payment', async () => {
          if (!externalServices.paymentGateway.available) {
            throw new ErrorHandling.ExternalServiceError(
              'Payment gateway unavailable',
              'payment-gateway',
              'charge'
            );
          }

          const paymentAmount = inventoryCheck.availableItems.reduce(
            (sum, item) => sum + (item.price * item.quantity), 
            0
          );

          const payment = {
            transactionId: `tx-${orderId}-${Date.now()}`,
            amount: paymentAmount,
            customerId,
            status: 'completed',
            processedAt: new Date(),
          };

          externalServices.paymentGateway.processedPayments.push(payment);
          return payment;
        }).withCircuitBreaker({
          failureThreshold: 3,
          resetTimeout: 30000,
          onOpen: async (ctx) => {
            await ctx.step('payment-circuit-fallback', async () => {
              // Queue payment for later processing
              return { 
                queued: true, 
                message: 'Payment queued due to service issues' 
              };
            });
          },
        }).onError({
          ExternalServiceError: async (error, ctx) => {
            // Try alternative payment methods
            const altPayment = await ctx.step('alternative-payment', async () => {
              const altPayment = {
                transactionId: `alt-tx-${orderId}-${Date.now()}`,
                amount: validation.totalAmount,
                customerId,
                status: 'completed',
                method: 'alternative',
                processedAt: new Date(),
              };
              
              externalServices.paymentGateway.processedPayments.push(altPayment);
              return altPayment;
            });
            
            return altPayment;
          },
        });

        // Step 5: Create shipping label
        const shipping = await ctx.step('create-shipping', async () => {
          if (!externalServices.shippingService.available) {
            throw new ErrorHandling.ExternalServiceError(
              'Shipping service unavailable',
              'shipping-service',
              'createLabel'
            );
          }

          const shippingLabel = {
            labelId: `label-${orderId}`,
            trackingNumber: `track-${orderId}-${Date.now()}`,
            orderId,
            customerId,
            items: inventoryCheck.availableItems,
            createdAt: new Date(),
          };

          externalServices.shippingService.createdLabels.push(shippingLabel);
          return shippingLabel;
        }).catch(async (error, ctx) => {
          // Create manual shipping task if automated shipping fails
          const manualShipping = await ctx.step('create-manual-shipping', async () => {
            return {
              manual: true,
              orderId,
              trackingNumber: `manual-${orderId}`,
              requiresManualProcessing: true,
              error: error.message,
            };
          });
          
          return manualShipping;
        });

        // Step 6: Send notifications
        await ctx.step('send-notifications', async () => {
          const notifications = [
            {
              type: 'order-confirmation',
              recipient: customerId,
              orderId,
              paymentId: payment.transactionId,
              trackingNumber: shipping.trackingNumber,
              sentAt: new Date(),
            },
            {
              type: 'inventory-update',
              recipient: 'inventory-team',
              orderId,
              reservedItems: inventoryCheck.availableItems,
              sentAt: new Date(),
            }
          ];

          externalServices.notificationService.sentNotifications.push(...notifications);
          
          return { notificationsSent: notifications.length, notifications };
        }).catch(async (error, ctx) => {
          // Log notification failure but don't fail workflow
          await ctx.step('log-notification-failure', async () => {
            return { 
              failed: true, 
              error: error.message, 
              orderId,
              timestamp: new Date() 
            };
          });
          
          return { notificationsSent: 0, failed: true };
        });

        // Step 7: Update order status
        await ctx.step('finalize-order', async () => {
          return {
            orderId,
            status: 'completed',
            finalizedAt: new Date(),
            paymentId: payment.transactionId,
            trackingNumber: shipping.trackingNumber,
          };
        });

        return {
          orderStatus: 'completed',
          totalAmount: validation.totalAmount,
          processedItems: inventoryCheck.availableItems,
        };
      };

      // Register workflow
      Workflow.define('e-commerce-order-processing', orderProcessingHandler);

      // Execute complete order workflow
      const orderData = {
        orderId: 'order-e2e-001',
        customerId: 'customer-123',
        items: [
          { productId: 'product-1', quantity: 2, price: 25.99 },
          { productId: 'product-2', quantity: 1, price: 15.50 },
        ],
      };

      const result = await Workflow.start(
        'e-commerce-order-processing',
        'e2e-order-exec-001',
        orderData
      );

      // Verify workflow completed successfully
      expect(result.orderStatus).toBe('completed');
      expect(result.totalAmount).toBe(67.48); // (25.99 * 2) + 15.50
      expect(result.processedItems).toHaveLength(2);

      // Verify workflow execution state
      const execution = await Database.WorkflowExecution.findById('e2e-order-exec-001');
      expect(execution?.status).toBe('completed');
      expect(execution?.output).toEqual(result);

      // Verify all steps completed
      const steps = await Database.StepExecution.findByExecutionId('e2e-order-exec-001');
      const stepNames = steps.map(s => s.stepName);
      
      expect(stepNames).toContain('validate-order');
      expect(stepNames).toContain('check-inventory');
      expect(stepNames).toContain('reserve-inventory');
      expect(stepNames).toContain('process-payment');
      expect(stepNames).toContain('create-shipping');
      expect(stepNames).toContain('send-notifications');
      expect(stepNames).toContain('finalize-order');

      // Verify all steps completed successfully
      steps.forEach(step => {
        expect(step.status).toBe('completed');
      });

      // Verify external service interactions
      expect(externalServices.inventory.get('product-1')).toBe(8); // 10 - 2
      expect(externalServices.inventory.get('product-2')).toBe(4); // 5 - 1
      expect(externalServices.paymentGateway.processedPayments).toHaveLength(1);
      expect(externalServices.shippingService.createdLabels).toHaveLength(1);
      expect(externalServices.notificationService.sentNotifications).toHaveLength(2);
    });

    test('should handle order processing with partial failures and recovery', async () => {
      // Simulate services with issues
      const unreliableServices = {
        inventory: new Map([
          ['product-1', 10],
          ['product-2', 0], // Out of stock
        ]),
        paymentGateway: { available: false }, // Payment gateway down
        shippingService: { available: true, createdLabels: [] as any[] },
        notificationService: { available: false }, // Notification service down
      };

      const resilientOrderHandler: WorkflowHandler<{
        orderId: string;
        customerId: string;
        items: Array<{ productId: string; quantity: number; price: number }>;
      }, any> = async (ctx) => {
        const { orderId, customerId, items } = ctx.input;

        // Validate order
        const validation = await ctx.step('validate-order', async () => {
          const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
          return { valid: true, totalAmount };
        });

        // Check inventory with fallback for unavailable items
        const inventoryResult = await ctx.step('check-inventory', async () => {
          const availableItems = items.filter(item => 
            (unreliableServices.inventory.get(item.productId) || 0) >= item.quantity
          );
          
          if (availableItems.length === 0) {
            throw new ErrorHandling.ValidationError('No items available', 'inventory');
          }
          
          return { availableItems, partialOrder: availableItems.length < items.length };
        }).onError({
          ValidationError: async (error, ctx) => {
            // Create backorder for unavailable items
            await ctx.step('create-backorder', async () => {
              const unavailableItems = items.filter(item => 
                (unreliableServices.inventory.get(item.productId) || 0) < item.quantity
              );
              return { backorderedItems: unavailableItems };
            });
            
            throw error; // Still fail if nothing available
          },
        });

        // Process payment with fallback
        const payment = await ctx.step('process-payment', async () => {
          if (!unreliableServices.paymentGateway.available) {
            throw new ErrorHandling.ExternalServiceError(
              'Payment gateway down',
              'payment-gateway',
              'charge'
            );
          }
          return { transactionId: `tx-${orderId}`, amount: validation.totalAmount };
        }).onError({
          ExternalServiceError: async (error, ctx) => {
            // Use alternative payment or defer payment
            const deferredPayment = await ctx.step('defer-payment', async () => {
              return {
                deferred: true,
                orderId,
                amount: validation.totalAmount,
                reason: 'Payment gateway unavailable',
                deferredAt: new Date(),
              };
            });
            
            return deferredPayment;
          },
        });

        // Create shipping
        const shipping = await ctx.step('create-shipping', async () => {
          return {
            trackingNumber: `track-${orderId}`,
            items: inventoryResult.availableItems,
          };
        });

        // Send notifications with fallback
        const notifications = await ctx.step('send-notifications', async () => {
          if (!unreliableServices.notificationService.available) {
            throw new ErrorHandling.ExternalServiceError(
              'Notification service down',
              'notification-service',
              'send'
            );
          }
          return { sent: true };
        }).catch(async (error, ctx) => {
          // Queue notifications for later
          await ctx.step('queue-notifications', async () => {
            return {
              queued: true,
              orderId,
              reason: 'Notification service unavailable',
              queuedAt: new Date(),
            };
          });
          
          return { sent: false, queued: true };
        });

        return {
          orderStatus: payment.deferred ? 'pending-payment' : 'completed',
          partialOrder: inventoryResult.partialOrder,
          paymentDeferred: payment.deferred || false,
          notificationsQueued: notifications.queued || false,
        };
      };

      Workflow.define('resilient-order-processing', resilientOrderHandler);

      const orderData = {
        orderId: 'order-resilient-001',
        customerId: 'customer-456',
        items: [
          { productId: 'product-1', quantity: 1, price: 29.99 },
          { productId: 'product-2', quantity: 1, price: 19.99 }, // Not available
        ],
      };

      const result = await Workflow.start(
        'resilient-order-processing',
        'e2e-resilient-exec-001',
        orderData
      );

      // Verify workflow handled failures gracefully
      expect(result.orderStatus).toBe('pending-payment');
      expect(result.partialOrder).toBe(true);
      expect(result.paymentDeferred).toBe(true);
      expect(result.notificationsQueued).toBe(true);

      // Verify fallback steps were executed
      const steps = await Database.StepExecution.findByExecutionId('e2e-resilient-exec-001');
      const stepNames = steps.map(s => s.stepName);
      
      expect(stepNames).toContain('defer-payment');
      expect(stepNames).toContain('queue-notifications');
      
      // All steps should complete (with fallbacks)
      steps.forEach(step => {
        expect(step.status).toBe('completed');
      });
    });
  });

  describe('data processing pipeline workflow', () => {
    test('should process complete data pipeline from ingestion to output', async () => {
      // Simulate data processing pipeline
      const dataProcessingHandler: WorkflowHandler<{
        datasetId: string;
        source: string;
        format: string;
      }, {
        processed: boolean;
        outputLocation: string;
        recordsProcessed: number;
      }> = async (ctx) => {
        const { datasetId, source, format } = ctx.input;

        // Step 1: Validate input data
        const validation = await ctx.step('validate-input', async () => {
          if (!['csv', 'json', 'xml'].includes(format)) {
            throw new ErrorHandling.ValidationError(`Unsupported format: ${format}`, 'format');
          }
          
          return { valid: true, datasetId, expectedFormat: format };
        });

        // Step 2: Ingest raw data
        const ingestion = await ctx.step('ingest-data', async () => {
          // Simulate data ingestion
          const mockData = Array.from({ length: 1000 }, (_, i) => ({
            id: i + 1,
            value: `data-item-${i + 1}`,
            timestamp: new Date(Date.now() - i * 1000).toISOString(),
            category: ['A', 'B', 'C'][i % 3],
          }));

          return {
            records: mockData,
            recordCount: mockData.length,
            ingestedAt: new Date(),
            source,
          };
        }).onError({
          default: async (error, ctx) => {
            // Log ingestion error and create empty dataset
            await ctx.step('log-ingestion-error', async () => {
              return { error: error.message, datasetId, timestamp: new Date() };
            });
            
            return { records: [], recordCount: 0, failed: true };
          },
        });

        if (ingestion.recordCount === 0) {
          throw new Error('No data ingested');
        }

        // Step 3: Clean and validate data
        const cleaning = await ctx.step('clean-data', async () => {
          const cleanedRecords = ingestion.records.filter(record => 
            record.value && record.category && record.timestamp
          );

          const validationErrors = ingestion.records.length - cleanedRecords.length;

          return {
            cleanedRecords,
            originalCount: ingestion.recordCount,
            cleanedCount: cleanedRecords.length,
            validationErrors,
            cleanedAt: new Date(),
          };
        });

        // Step 4: Transform data
        const transformation = await ctx.step('transform-data', async () => {
          const transformedRecords = cleaning.cleanedRecords.map(record => ({
            ...record,
            processedValue: record.value.toUpperCase(),
            categoryCode: record.category === 'A' ? 1 : record.category === 'B' ? 2 : 3,
            processedTimestamp: new Date(record.timestamp).getTime(),
            transformedAt: new Date(),
          }));

          return {
            transformedRecords,
            transformedCount: transformedRecords.length,
            transformationRules: ['uppercase_value', 'encode_category', 'timestamp_to_epoch'],
          };
        }).onError({
          default: async (error, ctx) => {
            // Use basic transformation as fallback
            const basicTransformation = await ctx.step('basic-transformation', async () => {
              return {
                transformedRecords: cleaning.cleanedRecords,
                transformedCount: cleaning.cleanedCount,
                transformationRules: ['identity'],
                fallback: true,
              };
            });
            
            return basicTransformation;
          },
        });

        // Step 5: Aggregate data
        const aggregation = await ctx.step('aggregate-data', async () => {
          const categoryCounts = transformation.transformedRecords.reduce((acc, record) => {
            acc[record.category] = (acc[record.category] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          const averageProcessingTime = transformation.transformedRecords.length > 0 
            ? Date.now() - new Date(transformation.transformedRecords[0].timestamp).getTime()
            : 0;

          return {
            categoryCounts,
            totalRecords: transformation.transformedCount,
            averageProcessingTime,
            aggregatedAt: new Date(),
          };
        });

        // Step 6: Generate output
        const output = await ctx.step('generate-output', async () => {
          const outputLocation = `output/${datasetId}/${Date.now()}.json`;
          
          const outputData = {
            metadata: {
              datasetId,
              source,
              format,
              processedAt: new Date(),
              pipeline: 'data-processing-v1',
            },
            summary: aggregation,
            records: transformation.transformedRecords,
          };

          // Simulate writing to storage
          return {
            outputLocation,
            recordsWritten: transformation.transformedCount,
            outputSize: JSON.stringify(outputData).length,
            generatedAt: new Date(),
          };
        });

        // Step 7: Cleanup temporary resources
        await ctx.step('cleanup-resources', async () => {
          // Simulate cleanup of temporary files/resources
          return {
            cleaned: true,
            resourcesFreed: ['temp-files', 'memory-cache'],
            cleanedAt: new Date(),
          };
        });

        return {
          processed: true,
          outputLocation: output.outputLocation,
          recordsProcessed: transformation.transformedCount,
        };
      };

      Workflow.define('data-processing-pipeline', dataProcessingHandler);

      const pipelineData = {
        datasetId: 'dataset-e2e-001',
        source: 'external-api',
        format: 'json',
      };

      const result = await Workflow.start(
        'data-processing-pipeline',
        'e2e-pipeline-exec-001',
        pipelineData
      );

      // Verify pipeline completed successfully
      expect(result.processed).toBe(true);
      expect(result.recordsProcessed).toBe(1000);
      expect(result.outputLocation).toContain('dataset-e2e-001');

      // Verify all pipeline steps completed
      const steps = await Database.StepExecution.findByExecutionId('e2e-pipeline-exec-001');
      const stepNames = steps.map(s => s.stepName);
      
      expect(stepNames).toContain('validate-input');
      expect(stepNames).toContain('ingest-data');
      expect(stepNames).toContain('clean-data');
      expect(stepNames).toContain('transform-data');
      expect(stepNames).toContain('aggregate-data');
      expect(stepNames).toContain('generate-output');
      expect(stepNames).toContain('cleanup-resources');

      steps.forEach(step => {
        expect(step.status).toBe('completed');
      });

      // Verify data flow between steps
      const ingestionStep = steps.find(s => s.stepName === 'ingest-data');
      const cleaningStep = steps.find(s => s.stepName === 'clean-data');
      const transformationStep = steps.find(s => s.stepName === 'transform-data');
      
      expect((ingestionStep?.output as any)?.recordCount).toBe(1000);
      expect((cleaningStep?.output as any)?.cleanedCount).toBeLessThanOrEqual(1000);
      expect((transformationStep?.output as any)?.transformedCount)
        .toBe((cleaningStep?.output as any)?.cleanedCount);
    });
  });

  describe('microservice coordination workflow', () => {
    test('should coordinate multiple microservices in distributed workflow', async () => {
      // Simulate microservices
      const microservices = {
        userService: { available: true, users: new Map() },
        profileService: { available: true, profiles: new Map() },
        preferencesService: { available: true, preferences: new Map() },
        notificationService: { available: true, notifications: [] as any[] },
        auditService: { available: true, events: [] as any[] },
      };

      const userOnboardingHandler: WorkflowHandler<{
        userId: string;
        userDetails: any;
        initialPreferences: any;
      }, {
        onboarded: boolean;
        userId: string;
        services: string[];
      }> = async (ctx) => {
        const { userId, userDetails, initialPreferences } = ctx.input;

        // Step 1: Create user in user service
        const userCreation = await ctx.step('create-user', async () => {
          if (!microservices.userService.available) {
            throw new ErrorHandling.ExternalServiceError(
              'User service unavailable',
              'user-service',
              'createUser'
            );
          }

          const user = {
            id: userId,
            ...userDetails,
            createdAt: new Date(),
            status: 'active',
          };

          microservices.userService.users.set(userId, user);
          return user;
        }).withCircuitBreaker({
          failureThreshold: 3,
          resetTimeout: 30000,
        });

        // Step 2: Create user profile
        const profileCreation = await ctx.step('create-profile', async () => {
          if (!microservices.profileService.available) {
            throw new ErrorHandling.ExternalServiceError(
              'Profile service unavailable',
              'profile-service',
              'createProfile'
            );
          }

          const profile = {
            userId,
            displayName: userDetails.firstName + ' ' + userDetails.lastName,
            avatar: null,
            bio: '',
            createdAt: new Date(),
          };

          microservices.profileService.profiles.set(userId, profile);
          return profile;
        }).onError({
          ExternalServiceError: async (error, ctx) => {
            // Create basic profile fallback
            const basicProfile = await ctx.step('create-basic-profile', async () => {
              return {
                userId,
                displayName: userDetails.firstName || 'User',
                basic: true,
                createdAt: new Date(),
              };
            });
            
            return basicProfile;
          },
        });

        // Step 3: Set initial preferences
        const preferencesSetup = await ctx.step('setup-preferences', async () => {
          if (!microservices.preferencesService.available) {
            throw new ErrorHandling.ExternalServiceError(
              'Preferences service unavailable',
              'preferences-service',
              'setPreferences'
            );
          }

          const preferences = {
            userId,
            ...initialPreferences,
            setAt: new Date(),
          };

          microservices.preferencesService.preferences.set(userId, preferences);
          return preferences;
        }).catch(async (error, ctx) => {
          // Use default preferences
          const defaultPrefs = await ctx.step('use-default-preferences', async () => {
            return {
              userId,
              theme: 'light',
              notifications: true,
              language: 'en',
              default: true,
            };
          });
          
          return defaultPrefs;
        });

        // Step 4: Send welcome notification
        const welcomeNotification = await ctx.step('send-welcome-notification', async () => {
          if (!microservices.notificationService.available) {
            throw new ErrorHandling.ExternalServiceError(
              'Notification service unavailable',
              'notification-service',
              'sendNotification'
            );
          }

          const notification = {
            userId,
            type: 'welcome',
            title: 'Welcome to the platform!',
            message: `Hi ${userDetails.firstName}, welcome to our platform!`,
            sentAt: new Date(),
          };

          microservices.notificationService.notifications.push(notification);
          return notification;
        }).catch(async (error, ctx) => {
          // Queue notification for later
          await ctx.step('queue-welcome-notification', async () => {
            return {
              queued: true,
              userId,
              reason: 'Notification service unavailable',
              queuedAt: new Date(),
            };
          });
          
          return { queued: true };
        });

        // Step 5: Record audit event
        await ctx.step('record-audit-event', async () => {
          if (microservices.auditService.available) {
            const auditEvent = {
              eventType: 'user-onboarded',
              userId,
              timestamp: new Date(),
              details: {
                userCreated: !!userCreation.id,
                profileCreated: !!profileCreation.userId,
                preferencesSet: !!preferencesSetup.userId,
                notificationSent: !welcomeNotification.queued,
              },
            };

            microservices.auditService.events.push(auditEvent);
            return auditEvent;
          }
          
          return { skipped: true, reason: 'Audit service unavailable' };
        });

        // Step 6: Finalize onboarding
        await ctx.step('finalize-onboarding', async () => {
          // Update user status to fully onboarded
          const user = microservices.userService.users.get(userId);
          if (user) {
            user.status = 'onboarded';
            user.onboardedAt = new Date();
            microservices.userService.users.set(userId, user);
          }

          return {
            finalized: true,
            userId,
            completedAt: new Date(),
          };
        });

        const servicesUsed = [];
        if (userCreation.id) servicesUsed.push('user-service');
        if (profileCreation.userId) servicesUsed.push('profile-service');
        if (preferencesSetup.userId) servicesUsed.push('preferences-service');
        if (!welcomeNotification.queued) servicesUsed.push('notification-service');
        if (microservices.auditService.available) servicesUsed.push('audit-service');

        return {
          onboarded: true,
          userId,
          services: servicesUsed,
        };
      };

      Workflow.define('user-onboarding-coordination', userOnboardingHandler);

      const onboardingData = {
        userId: 'user-e2e-001',
        userDetails: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
        },
        initialPreferences: {
          theme: 'dark',
          notifications: true,
          language: 'en',
        },
      };

      const result = await Workflow.start(
        'user-onboarding-coordination',
        'e2e-onboarding-exec-001',
        onboardingData
      );

      // Verify onboarding completed successfully
      expect(result.onboarded).toBe(true);
      expect(result.userId).toBe('user-e2e-001');
      expect(result.services).toContain('user-service');
      expect(result.services).toContain('profile-service');
      expect(result.services).toContain('preferences-service');

      // Verify microservice interactions
      expect(microservices.userService.users.has('user-e2e-001')).toBe(true);
      expect(microservices.profileService.profiles.has('user-e2e-001')).toBe(true);
      expect(microservices.preferencesService.preferences.has('user-e2e-001')).toBe(true);
      expect(microservices.notificationService.notifications).toHaveLength(1);
      expect(microservices.auditService.events).toHaveLength(1);

      // Verify workflow completed all steps
      const steps = await Database.StepExecution.findByExecutionId('e2e-onboarding-exec-001');
      const stepNames = steps.map(s => s.stepName);
      
      expect(stepNames).toContain('create-user');
      expect(stepNames).toContain('create-profile');
      expect(stepNames).toContain('setup-preferences');
      expect(stepNames).toContain('send-welcome-notification');
      expect(stepNames).toContain('record-audit-event');
      expect(stepNames).toContain('finalize-onboarding');

      steps.forEach(step => {
        expect(step.status).toBe('completed');
      });

      // Verify final user state
      const finalUser = microservices.userService.users.get('user-e2e-001');
      expect(finalUser?.status).toBe('onboarded');
      expect(finalUser?.onboardedAt).toBeInstanceOf(Date);
    });
  });
});