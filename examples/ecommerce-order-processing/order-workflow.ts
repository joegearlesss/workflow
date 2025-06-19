import { Workflow } from '../../packages/core/src';
import { ErrorHandling } from '../../packages/core/src/error-handling';
import type { WorkflowHandler } from '../../packages/core/src/types';
import { z } from 'zod';

// Input/Output schemas
const OrderItemSchema = z.object({
  productId: z.string().describe('Product identifier'),
  quantity: z.number().min(1).describe('Quantity to order'),
  price: z.number().min(0).describe('Unit price in USD'),
}).describe('Individual order item');

const ShippingAddressSchema = z.object({
  name: z.string().describe('Recipient name'),
  street: z.string().describe('Street address'),
  city: z.string().describe('City'),
  state: z.string().describe('State/Province'),
  zipCode: z.string().describe('ZIP/Postal code'),
  country: z.string().describe('Country code'),
}).describe('Shipping address information');

const PaymentMethodSchema = z.object({
  type: z.enum(['credit_card', 'debit_card', 'paypal', 'bank_transfer']).describe('Payment method type'),
  cardNumber: z.string().optional().describe('Card number (last 4 digits for display)'),
  expiryMonth: z.number().min(1).max(12).optional().describe('Card expiry month'),
  expiryYear: z.number().min(2024).optional().describe('Card expiry year'),
  paypalEmail: z.string().email().optional().describe('PayPal account email'),
}).describe('Payment method details');

const OrderInputSchema = z.object({
  orderId: z.string().describe('Unique order identifier'),
  customerId: z.string().describe('Customer identifier'),
  items: z.array(OrderItemSchema).min(1).describe('Items to order'),
  shippingAddress: ShippingAddressSchema,
  paymentMethod: PaymentMethodSchema,
  notes: z.string().optional().describe('Special order notes'),
}).describe('Complete order information for processing');

const OrderOutputSchema = z.object({
  orderStatus: z.enum(['completed', 'partial', 'failed', 'pending']).describe('Final order status'),
  totalAmount: z.number().describe('Total order amount processed'),
  processedItems: z.array(OrderItemSchema).describe('Successfully processed items'),
  paymentId: z.string().optional().describe('Payment transaction ID'),
  trackingNumber: z.string().optional().describe('Shipping tracking number'),
  notifications: z.object({
    sent: z.boolean().describe('Whether notifications were sent'),
    queued: z.boolean().describe('Whether notifications were queued for retry'),
  }).describe('Notification status'),
}).describe('Order processing result');

type OrderInput = z.infer<typeof OrderInputSchema>;
type OrderOutput = z.infer<typeof OrderOutputSchema>;

// External services simulation
namespace ExternalServices {
  export namespace Inventory {
    const inventory = new Map<string, number>([
      ['PROD-A1', 50],
      ['PROD-B2', 25],
      ['PROD-C3', 0], // Out of stock
      ['PROD-D4', 100],
    ]);

    export const checkStock = async (productId: string): Promise<number> => {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
      return inventory.get(productId) || 0;
    };

    export const reserveStock = async (productId: string, quantity: number): Promise<boolean> => {
      const currentStock = inventory.get(productId) || 0;
      if (currentStock >= quantity) {
        inventory.set(productId, currentStock - quantity);
        return true;
      }
      return false;
    };

    export const releaseReservation = async (productId: string, quantity: number): Promise<void> => {
      const currentStock = inventory.get(productId) || 0;
      inventory.set(productId, currentStock + quantity);
    };
  }

  export namespace Payment {
    let serviceAvailable = true;
    const processedPayments = new Map<string, any>();

    export const setAvailability = (available: boolean): void => {
      serviceAvailable = available;
    };

    export const processPayment = async (orderId: string, amount: number, paymentMethod: any): Promise<{
      transactionId: string;
      status: 'completed' | 'failed';
      amount: number;
    }> => {
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * 200));

      if (!serviceAvailable) {
        throw new ErrorHandling.ExternalServiceError(
          'Payment gateway unavailable',
          'payment-gateway',
          'processPayment'
        );
      }

      // Simulate occasional payment failures
      if (Math.random() < 0.1) { // 10% failure rate
        throw new ErrorHandling.ExternalServiceError(
          'Payment declined',
          'payment-gateway',
          'processPayment'
        );
      }

      const transactionId = `TXN-${orderId}-${Date.now()}`;
      const payment = {
        transactionId,
        status: 'completed' as const,
        amount,
        paymentMethod,
        processedAt: new Date(),
      };

      processedPayments.set(transactionId, payment);
      return payment;
    };

    export const processAlternativePayment = async (orderId: string, amount: number): Promise<{
      transactionId: string;
      status: 'completed' | 'queued';
      amount: number;
    }> => {
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const transactionId = `ALT-TXN-${orderId}-${Date.now()}`;
      return {
        transactionId,
        status: 'completed',
        amount,
      };
    };
  }

  export namespace Shipping {
    let serviceAvailable = true;
    const createdLabels = new Map<string, any>();

    export const setAvailability = (available: boolean): void => {
      serviceAvailable = available;
    };

    export const createShippingLabel = async (orderId: string, address: any, items: any[]): Promise<{
      labelId: string;
      trackingNumber: string;
      estimatedDelivery: Date;
    }> => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 150));

      if (!serviceAvailable) {
        throw new ErrorHandling.ExternalServiceError(
          'Shipping service unavailable',
          'shipping-service',
          'createLabel'
        );
      }

      const labelId = `LBL-${orderId}`;
      const trackingNumber = `TRK-${orderId}-${Date.now()}`;
      const estimatedDelivery = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const label = {
        labelId,
        trackingNumber,
        orderId,
        address,
        items,
        estimatedDelivery,
        createdAt: new Date(),
      };

      createdLabels.set(labelId, label);
      return label;
    };
  }

  export namespace Notifications {
    let serviceAvailable = true;
    const sentNotifications = new Array<any>();
    const queuedNotifications = new Array<any>();

    export const setAvailability = (available: boolean): void => {
      serviceAvailable = available;
    };

    export const sendOrderConfirmation = async (customerId: string, orderDetails: any): Promise<void> => {
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100));

      if (!serviceAvailable) {
        throw new ErrorHandling.ExternalServiceError(
          'Email service unavailable',
          'email-service',
          'sendEmail'
        );
      }

      const notification = {
        type: 'order-confirmation',
        customerId,
        orderDetails,
        sentAt: new Date(),
      };

      sentNotifications.push(notification);
    };

    export const queueNotification = async (customerId: string, orderDetails: any): Promise<void> => {
      const notification = {
        type: 'order-confirmation',
        customerId,
        orderDetails,
        queuedAt: new Date(),
        status: 'queued',
      };

      queuedNotifications.push(notification);
    };

    export const getStats = () => ({
      sent: sentNotifications.length,
      queued: queuedNotifications.length,
    });
  }
}

// Order processing workflow
const orderProcessingHandler: WorkflowHandler<OrderInput, OrderOutput> = async (ctx) => {
  const { orderId, customerId, items, shippingAddress, paymentMethod } = ctx.input;

  // Step 1: Validate order data
  const validation = await ctx.step('validate-order', async () => {
    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    if (totalAmount <= 0) {
      throw new ErrorHandling.ValidationError('Invalid order total', 'order.total');
    }

    if (items.length === 0) {
      throw new ErrorHandling.ValidationError('Order must contain at least one item', 'order.items');
    }

    // Validate shipping address
    if (!shippingAddress.name || !shippingAddress.street) {
      throw new ErrorHandling.ValidationError('Invalid shipping address', 'order.shipping');
    }

    return {
      valid: true,
      totalAmount,
      itemCount: items.length,
      validatedAt: new Date(),
    };
  }).onError({
    ValidationError: async (error, ctx) => {
      await ctx.step('log-validation-error', async () => {
        return {
          error: error.message,
          orderId,
          timestamp: new Date(),
          severity: 'critical',
        };
      });
      throw error;
    },
  });

  // Step 2: Check inventory and reserve stock
  const inventoryResult = await ctx.step('check-inventory', async () => {
    const availableItems = [];
    const unavailableItems = [];

    for (const item of items) {
      const stock = await ExternalServices.Inventory.checkStock(item.productId);
      if (stock >= item.quantity) {
        availableItems.push({ ...item, availableStock: stock });
      } else {
        unavailableItems.push({ ...item, availableStock: stock, needed: item.quantity });
      }
    }

    return {
      availableItems,
      unavailableItems,
      allItemsAvailable: unavailableItems.length === 0,
      checkedAt: new Date(),
    };
  }).onError({
    default: async (error, ctx) => {
      await ctx.step('log-inventory-error', async () => {
        return { error: error.message, orderId, step: 'inventory-check' };
      });
      throw error;
    },
  });

  // Handle partial inventory
  if (!inventoryResult.allItemsAvailable) {
    await ctx.step('handle-partial-inventory', async () => {
      // In a real scenario, you might:
      // - Offer alternative products
      // - Allow partial orders
      // - Suggest back-ordering
      
      const partialOrderTotal = inventoryResult.availableItems.reduce(
        (sum, item) => sum + (item.price * item.quantity), 
        0
      );

      return {
        strategy: 'partial-order',
        availableItems: inventoryResult.availableItems,
        unavailableItems: inventoryResult.unavailableItems,
        adjustedTotal: partialOrderTotal,
        customerNotified: true,
      };
    });
  }

  // Step 3: Reserve inventory for available items
  await ctx.step('reserve-inventory', async () => {
    const reservations = [];
    
    for (const item of inventoryResult.availableItems) {
      const reserved = await ExternalServices.Inventory.reserveStock(item.productId, item.quantity);
      if (!reserved) {
        throw new Error(`Failed to reserve ${item.quantity} units of ${item.productId}`);
      }
      
      reservations.push({
        productId: item.productId,
        quantity: item.quantity,
        reservedAt: new Date(),
      });
    }

    return {
      reservations,
      totalReserved: reservations.length,
      reservedAt: new Date(),
    };
  });

  // Step 4: Process payment
  const paymentResult = await ctx.step('process-payment', async () => {
    const amount = inventoryResult.availableItems.reduce(
      (sum, item) => sum + (item.price * item.quantity), 
      0
    );

    return await ExternalServices.Payment.processPayment(orderId, amount, paymentMethod);
  }).withCircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 30000,
    onOpen: async (ctx) => {
      await ctx.step('payment-circuit-breaker-open', async () => {
        return {
          message: 'Payment service circuit breaker opened',
          timestamp: new Date(),
        };
      });
    },
  }).onError({
    ExternalServiceError: async (error, ctx) => {
      // Try alternative payment processing
      const alternativePayment = await ctx.step('alternative-payment', async () => {
        const amount = inventoryResult.availableItems.reduce(
          (sum, item) => sum + (item.price * item.quantity), 
          0
        );
        
        return await ExternalServices.Payment.processAlternativePayment(orderId, amount);
      });
      
      return alternativePayment;
    },
  });

  // Step 5: Create shipping label
  const shippingResult = await ctx.step('create-shipping', async () => {
    return await ExternalServices.Shipping.createShippingLabel(
      orderId,
      shippingAddress,
      inventoryResult.availableItems
    );
  }).catch(async (error, ctx) => {
    // Create manual shipping task if automated shipping fails
    const manualShipping = await ctx.step('create-manual-shipping', async () => {
      return {
        manual: true,
        orderId,
        trackingNumber: `MANUAL-${orderId}`,
        requiresManualProcessing: true,
        error: error.message,
        address: shippingAddress,
        items: inventoryResult.availableItems,
        createdAt: new Date(),
      };
    });
    
    return manualShipping;
  });

  // Step 6: Send notifications
  const notificationResult = await ctx.step('send-notifications', async () => {
    const orderDetails = {
      orderId,
      items: inventoryResult.availableItems,
      totalAmount: validation.totalAmount,
      paymentId: paymentResult.transactionId,
      trackingNumber: shippingResult.trackingNumber,
      estimatedDelivery: shippingResult.estimatedDelivery,
    };

    await ExternalServices.Notifications.sendOrderConfirmation(customerId, orderDetails);
    
    return {
      sent: true,
      sentAt: new Date(),
      orderDetails,
    };
  }).catch(async (error, ctx) => {
    // Queue notification for later if sending fails
    const queuedNotification = await ctx.step('queue-notification', async () => {
      const orderDetails = {
        orderId,
        items: inventoryResult.availableItems,
        totalAmount: validation.totalAmount,
        paymentId: paymentResult.transactionId,
        trackingNumber: shippingResult.trackingNumber,
      };

      await ExternalServices.Notifications.queueNotification(customerId, orderDetails);
      
      return {
        queued: true,
        queuedAt: new Date(),
        reason: error.message,
        orderDetails,
      };
    });
    
    return queuedNotification;
  });

  // Step 7: Finalize order
  await ctx.step('finalize-order', async () => {
    const finalStatus = inventoryResult.allItemsAvailable ? 'completed' : 'partial';
    
    return {
      orderId,
      status: finalStatus,
      finalizedAt: new Date(),
      summary: {
        itemsProcessed: inventoryResult.availableItems.length,
        totalItems: items.length,
        paymentProcessed: !!paymentResult.transactionId,
        shippingCreated: !!shippingResult.trackingNumber,
        notificationsSent: notificationResult.sent || false,
        notificationsQueued: notificationResult.queued || false,
      },
    };
  });

  // Return final result
  return {
    orderStatus: inventoryResult.allItemsAvailable ? 'completed' : 'partial',
    totalAmount: validation.totalAmount,
    processedItems: inventoryResult.availableItems,
    paymentId: paymentResult.transactionId,
    trackingNumber: shippingResult.trackingNumber,
    notifications: {
      sent: notificationResult.sent || false,
      queued: notificationResult.queued || false,
    },
  };
};

// Create and export the workflow
export const createOrderProcessingWorkflow = (): void => {
  Workflow.define('ecommerce-order-processing', orderProcessingHandler, {
    version: '1.0.0',
    description: 'Complete e-commerce order processing with payment, inventory, and shipping',
    schema: {
      input: OrderInputSchema,
      output: OrderOutputSchema,
    },
  });
};

// Export external services for testing
export { ExternalServices };

// Export schemas for validation
export { OrderInputSchema, OrderOutputSchema, type OrderInput, type OrderOutput };