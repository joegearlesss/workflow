# E-commerce Order Processing Workflow

This example demonstrates a comprehensive e-commerce order processing workflow that handles payment processing, inventory management, shipping, and notifications with proper error handling and fallback strategies.

## Features Demonstrated

- **Multi-step order processing** with proper validation
- **Payment processing** with fallback payment methods
- **Inventory management** with stock validation and reservation
- **Shipping integration** with manual fallback
- **Email notifications** with queuing for failed deliveries
- **Circuit breaker patterns** for external service protection
- **Error handling and recovery** for partial failures
- **Transaction-like behavior** with rollback capabilities

## Workflow Steps

1. **Order Validation** - Validates order data and calculates totals
2. **Inventory Check** - Verifies product availability and reserves stock
3. **Payment Processing** - Charges payment with fallback methods
4. **Shipping Label Creation** - Creates shipping labels with manual fallback
5. **Notification Dispatch** - Sends confirmation emails with queuing
6. **Order Finalization** - Updates order status and completes transaction

## Usage

```typescript
import { Workflow } from '@workflow-engine/core';
import { createOrderProcessingWorkflow } from './order-workflow';

// Initialize the workflow engine
await Workflow.initialize('./orders.db');

// Define the order processing workflow
createOrderProcessingWorkflow();

// Process an order
const orderData = {
  orderId: 'ORD-2024-001',
  customerId: 'CUST-12345',
  items: [
    { productId: 'PROD-A1', quantity: 2, price: 29.99 },
    { productId: 'PROD-B2', quantity: 1, price: 49.99 }
  ],
  shippingAddress: {
    name: 'John Doe',
    street: '123 Main St',
    city: 'Anytown',
    state: 'CA',
    zipCode: '12345',
    country: 'US'
  },
  paymentMethod: {
    type: 'credit_card',
    cardNumber: '****-****-****-1234',
    expiryMonth: 12,
    expiryYear: 2025
  }
};

const result = await Workflow.start(
  'ecommerce-order-processing',
  'order-execution-001',
  orderData
);

console.log('Order processed:', result);
```

## Error Scenarios Handled

- **Insufficient inventory** - Alternative product suggestions or partial orders
- **Payment failures** - Fallback payment methods or payment queuing
- **Shipping service down** - Manual shipping task creation
- **Notification failures** - Email queuing for retry
- **External service timeouts** - Circuit breaker protection with fallbacks

## External Services Simulated

- **Inventory Service** - Stock checking and reservation
- **Payment Gateway** - Credit card processing
- **Shipping Service** - Label creation and tracking
- **Email Service** - Customer notifications
- **Audit Service** - Order event logging

## Configuration

The workflow can be configured with various options:

```typescript
const config = {
  payment: {
    timeout: 30000,
    retryAttempts: 3,
    fallbackEnabled: true
  },
  inventory: {
    reservationTimeout: 300000, // 5 minutes
    allowPartialOrders: true
  },
  shipping: {
    timeout: 15000,
    manualFallback: true
  },
  notifications: {
    retryAttempts: 3,
    queueFailures: true
  }
};
```

## Running the Example

```bash
# Install dependencies
bun install

# Run the example
bun run examples/ecommerce-order-processing/main.ts

# Run with different scenarios
bun run examples/ecommerce-order-processing/test-scenarios.ts
```

## Test Scenarios

The example includes several test scenarios:

1. **Happy Path** - All services work correctly
2. **Inventory Issues** - Some products out of stock
3. **Payment Failures** - Payment gateway down, fallback used
4. **Shipping Problems** - Shipping service unavailable, manual processing
5. **Multiple Failures** - Complex scenario with multiple service failures
6. **Recovery Testing** - Workflow interruption and resume testing