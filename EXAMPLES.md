### Basic Usage

```typescript
import { Workflow } from '@workflow/core';

// Define a workflow
Workflow.define("my-workflow", async (ctx) => {
    await ctx.step("step1", async () => {
        console.log("Executing step 1");
        return { data: "step1-result" };
    });
    
    await ctx.sleep("wait", 1000);
    
    await ctx.step("step2", async () => {
        console.log("Executing step 2");
    });
});

// Start execution
await Workflow.start("my-workflow", "execution-id-123");
```

**Handling Step Failures with Error Pipes**

```typescript
import { Workflow } from '@workflow/core';

// Define custom error types using functional approach
namespace ValidationError {
    export const create = (message: string, field: string): Error & { field: string } => {
        const error = new Error(message) as Error & { field: string };
        error.name = 'ValidationError';
        error.field = field;
        return error;
    };
    
    export const is = (error: unknown): error is Error & { field: string } => {
        return error instanceof Error && error.name === 'ValidationError' && 'field' in error;
    };
}

namespace NetworkError {
    export const create = (message: string, statusCode: number): Error & { statusCode: number } => {
        const error = new Error(message) as Error & { statusCode: number };
        error.name = 'NetworkError';
        error.statusCode = statusCode;
        return error;
    };
    
    export const is = (error: unknown): error is Error & { statusCode: number } => {
        return error instanceof Error && error.name === 'NetworkError' && 'statusCode' in error;
    };
}

// Define a workflow with error handling pipes
Workflow.define("error-handling-workflow", async (ctx) => {
    // Step with error pipe for conditional flow
    await ctx.step("data-processing", async () => {
        const data = await fetchExternalData();
        if (!data.isValid) {
            throw ValidationError.create("Invalid data format", "payload");
        }
        return { processedData: data };
    }).onError({
        ValidationError: async (error, ctx) => {
            // Handle validation errors by running data correction
            await ctx.step("data-correction", async () => {
                console.log(`Correcting field: ${ValidationError.is(error) ? error.field : 'unknown'}`);
                return { corrected: true };
            }).execute();
            // Continue with corrected data
            return { processedData: { isValid: true, corrected: true } };
        },
        NetworkError: async (error, ctx) => {
            // Handle network errors with exponential backoff
            if (NetworkError.is(error) && error.statusCode >= 500) {
                await ctx.sleep("network-retry-delay", 5000);
                throw error; // Retry the original step
            }
            // For client errors, skip to fallback
            await ctx.step("fallback-data", async () => {
                return { processedData: { fallback: true } };
            }).execute();
        },
        default: async (error, ctx) => {
            // Handle any other errors
            await ctx.step("error-logging", async () => {
                console.error("Unexpected error:", error.message);
                return { logged: true };
            }).execute();
            throw error; // Re-throw to fail the workflow
        }
    }).execute();
    
    await ctx.step("final-processing", async () => {
        console.log("Processing completed successfully");
        return { completed: true };
    }).execute();
});

// Alternative: Using error branching for different execution paths
Workflow.define("branching-workflow", async (ctx) => {
    const result = await ctx.step("risky-operation", async () => {
        const success = Math.random() > 0.3;
        if (!success) {
            throw new Error("Operation failed");
        }
        return { success: true, data: "primary-result" };
    }).catch(async (error, ctx) => {
        // Error branch - different execution path
        await ctx.step("fallback-operation", async () => {
            console.log("Using fallback approach");
            return { success: false, data: "fallback-result" };
        }).execute();
        
        await ctx.step("notify-admin", async () => {
            console.log("Notifying admin of fallback usage");
            return { notified: true };
        }).execute();
        
        return { success: false, data: "fallback-result" };
    }).execute();
    
    // Conditional next steps based on result
    if (result.success) {
        await ctx.step("success-cleanup", async () => {
            console.log("Primary path cleanup");
            return { cleaned: true };
        }).execute();
    } else {
        await ctx.step("fallback-cleanup", async () => {
            console.log("Fallback path cleanup");
            return { cleaned: true };
        }).execute();
    }
});

// Circuit breaker pattern for external service calls
Workflow.define("circuit-breaker-workflow", async (ctx) => {
    await ctx.step("external-service-call", async () => {
        return await callExternalService();
    }).withCircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 30000,
        onOpen: async (ctx) => {
            await ctx.step("circuit-open-fallback", async () => {
                console.log("Circuit breaker open, using cached data");
                return { cached: true };
            }).execute();
        }
    }).execute();
});

// Advanced error handling with retry and circuit breaker
Workflow.define("advanced-error-handling", async (ctx) => {
    // Step with multiple error handling strategies
    const apiResult = await ctx.step("api-call", async () => {
        const response = await fetch('/api/data');
        if (!response.ok) {
            if (response.status >= 500) {
                throw new NetworkError(`Server error: ${response.status}`, response.status);
            } else {
                throw new ValidationError(`Client error: ${response.status}`, 'request');
            }
        }
        return await response.json();
    })
    .withCircuitBreaker({
        failureThreshold: 3,
        resetTimeout: 60000,
        onOpen: async (ctx) => {
            await ctx.step("cache-fallback", async () => {
                console.log("Using cached data due to circuit breaker");
                return { cached: true, data: getCachedData() };
            }).execute();
        }
    })
    .onError({
        NetworkError: async (error, ctx) => {
            // Exponential backoff for server errors
            const delay = Math.min(1000 * Math.pow(2, ctx.attempt - 1), 30000);
            await ctx.sleep(`network-backoff-${ctx.attempt}`, delay);
            throw error; // Retry with backoff
        },
        ValidationError: async (error, ctx) => {
            // Log validation errors and use default data
            await ctx.step("validation-error-log", async () => {
                console.error(`Validation error in field ${error.field}: ${error.message}`);
                return { logged: true };
            }).execute();
            
            return { data: getDefaultData(), fallback: true };
        },
        default: async (error, ctx) => {
            // Catch-all error handler
            await ctx.step("unexpected-error-handler", async () => {
                console.error("Unexpected error:", error);
                // Send alert to monitoring system
                await sendAlert({
                    type: 'workflow_error',
                    workflow: ctx.workflowName,
                    execution: ctx.executionId,
                    error: error.message
                });
                return { alerted: true };
            }).execute();
            
            throw error; // Re-throw to fail workflow
        }
    })
    .execute();
    
    // Process the result regardless of how it was obtained
    await ctx.step("process-result", async () => {
        console.log("Processing result:", apiResult);
        return { processed: true };
    }).execute();
});

// Start execution with retry configuration
await Workflow.start("error-handling-workflow", "execution-id-456", {}, {
    maxAttempts: 3,
    backoffMs: 2000,
    exponentialBackoff: true
});

// Helper functions for the examples
async function fetchExternalData() {
    // Simulate external API call
    const success = Math.random() > 0.3;
    if (!success) {
        throw NetworkError.create("Network timeout", 503);
    }
    return { isValid: Math.random() > 0.2, data: "sample-data" };
}

async function callExternalService() {
    // Simulate external service call
    const success = Math.random() > 0.4;
    if (!success) {
        throw new Error("Service unavailable");
    }
    return { result: "service-data" };
}

function getCachedData() {
    return { cached: true, data: "fallback-data" };
}

function getDefaultData() {
    return { default: true, data: "default-data" };
}

async function sendAlert(alert: {
    type: string;
    workflow: string;
    execution: string;
    error: string;
}) {
    console.log("Alert sent:", alert);
}
```

**Real-World Error Handling Example**

```typescript
// Complete example: E-commerce order processing workflow with comprehensive error handling
Workflow.define("order-processing", async (ctx) => {
    const { orderId, customerId, items } = ctx.input;
    
    // Step 1: Validate order data
    const validationResult = await ctx.step("validate-order", async () => {
        if (!orderId || !customerId || !items?.length) {
            throw new ValidationError("Missing required order fields", "order");
        }
        
        // Validate inventory
        for (const item of items) {
            const available = await checkInventory(item.productId, item.quantity);
            if (!available) {
                throw new ValidationError(`Insufficient inventory for ${item.productId}`, "inventory");
            }
        }
        
        return { valid: true, totalAmount: calculateTotal(items) };
    }).onError({
        ValidationError: async (error, ctx) => {
            if (error.field === "inventory") {
                // Try to find alternative products
                await ctx.step("find-alternatives", async () => {
                    const alternatives = await findAlternativeProducts(items);
                    if (alternatives.length > 0) {
                        return { alternatives, suggested: true };
                    }
                    throw new Error("No alternatives available");
                }).execute();
                
                // Notify customer about alternatives
                await ctx.step("notify-alternatives", async () => {
                    await sendCustomerNotification(customerId, {
                        type: "alternatives_available",
                        alternatives
                    });
                    return { notified: true };
                }).execute();
                
                throw error; // Still fail the order, but customer is notified
            }
            
            // For other validation errors, log and fail
            await ctx.step("log-validation-error", async () => {
                console.error(`Order validation failed: ${error.message}`);
                return { logged: true };
            }).execute();
            
            throw error;
        }
    }).execute();
    
    // Step 2: Process payment with circuit breaker
    const paymentResult = await ctx.step("process-payment", async () => {
        const result = await processPayment(customerId, validationResult.totalAmount);
        if (!result.success) {
            throw new Error(`Payment failed: ${result.error}`);
        }
        return result;
    }).withCircuitBreaker({
        failureThreshold: 5,
        resetTimeout: 60000,
        onOpen: async (ctx) => {
            // Payment service is down, queue for later processing
            await ctx.step("queue-payment", async () => {
                await queuePaymentForLater(orderId, customerId, validationResult.totalAmount);
                return { queued: true };
            }).execute();
            
            // Notify customer about delayed processing
            await ctx.step("notify-payment-delay", async () => {
                await sendCustomerNotification(customerId, {
                    type: "payment_delayed",
                    orderId,
                    estimatedProcessingTime: "1 hour"
                });
                return { notified: true };
            }).execute();
        }
    }).catch(async (error, ctx) => {
        // Payment failed, try alternative payment methods
        const alternativeResult = await ctx.step("try-alternative-payment", async () => {
            const alternatives = await getAlternativePaymentMethods(customerId);
            for (const method of alternatives) {
                try {
                    const result = await processPayment(customerId, validationResult.totalAmount, method);
                    if (result.success) {
                        return { success: true, method, ...result };
                    }
                } catch (altError) {
                    console.warn(`Alternative payment method ${method} failed:`, altError.message);
                }
            }
            throw new Error("All payment methods failed");
        }).execute();
        
        return alternativeResult;
    }).execute();
    
    // Step 3: Reserve inventory
    await ctx.step("reserve-inventory", async () => {
        const reservations = [];
        for (const item of items) {
            const reservation = await reserveInventory(item.productId, item.quantity);
            reservations.push(reservation);
        }
        return { reservations };
    }).onError({
        default: async (error, ctx) => {
            // Inventory reservation failed, refund payment
            await ctx.step("refund-payment", async () => {
                await refundPayment(paymentResult.transactionId);
                return { refunded: true };
            }).execute();
            
            // Notify customer
            await ctx.step("notify-inventory-failure", async () => {
                await sendCustomerNotification(customerId, {
                    type: "order_failed",
                    reason: "inventory_unavailable",
                    orderId,
                    refundId: paymentResult.transactionId
                });
                return { notified: true };
            }).execute();
            
            throw error;
        }
    }).execute();
    
    // Step 4: Create shipping label with retry logic
    const shippingResult = await ctx.step("create-shipping", async () => {
        const shippingAddress = await getCustomerShippingAddress(customerId);
        const label = await createShippingLabel(orderId, shippingAddress, items);
        return { label, trackingNumber: label.trackingNumber };
    }).onError({
        NetworkError: async (error, ctx) => {
            // Shipping service network error, exponential backoff
            const delay = Math.min(1000 * Math.pow(2, ctx.attempt - 1), 30000);
            await ctx.sleep(`shipping-retry-${ctx.attempt}`, delay);
            throw error; // Retry with backoff
        },
        default: async (error, ctx) => {
            // Shipping failed, but order is valid - create manual shipping task
            await ctx.step("create-manual-shipping-task", async () => {
                await createManualShippingTask(orderId, {
                    customerId,
                    items,
                    paymentId: paymentResult.transactionId,
                    error: error.message
                });
                return { manualTaskCreated: true };
            }).execute();
            
            // Use fallback tracking
            return { 
                label: null, 
                trackingNumber: `MANUAL-${orderId}`,
                requiresManualProcessing: true 
            };
        }
    }).execute();
    
    // Step 5: Send confirmation
    await ctx.step("send-confirmation", async () => {
        await sendCustomerNotification(customerId, {
            type: "order_confirmed",
            orderId,
            trackingNumber: shippingResult.trackingNumber,
            estimatedDelivery: calculateDeliveryDate(),
            requiresManualProcessing: shippingResult.requiresManualProcessing
        });
        return { confirmed: true };
    }).catch(async (error, ctx) => {
        // Notification failed, but order is complete - log for follow-up
        await ctx.step("log-notification-failure", async () => {
            console.error(`Failed to send confirmation for order ${orderId}:`, error.message);
            await createFollowUpTask("send_confirmation", { orderId, customerId, error: error.message });
            return { logged: true };
        }).execute();
        
        // Don't fail the workflow for notification issues
        return { confirmed: false, followUpRequired: true };
    }).execute();
    
    // Final step: Update order status
    await ctx.step("update-order-status", async () => {
        await updateOrderStatus(orderId, "confirmed", {
            paymentId: paymentResult.transactionId,
            trackingNumber: shippingResult.trackingNumber
        });
        return { orderComplete: true };
    }).execute();
});
```
