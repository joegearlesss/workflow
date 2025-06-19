import { Workflow } from '../../packages/core/src';
import { createOrderProcessingWorkflow, ExternalServices, type OrderInput } from './order-workflow';

/**
 * Test scenarios demonstrating various order processing situations
 */
namespace TestScenarios {
  /**
   * Base order data for testing
   */
  const createBaseOrder = (orderId: string): OrderInput => ({
    orderId,
    customerId: 'CUST-TEST-001',
    items: [
      { productId: 'PROD-A1', quantity: 2, price: 29.99 },
      { productId: 'PROD-B2', quantity: 1, price: 49.99 }
    ],
    shippingAddress: {
      name: 'Test Customer',
      street: '123 Test St',
      city: 'Testville',
      state: 'TS',
      zipCode: '12345',
      country: 'US'
    },
    paymentMethod: {
      type: 'credit_card',
      cardNumber: '****-****-****-1234',
      expiryMonth: 12,
      expiryYear: 2025
    }
  });

  /**
   * Scenario 1: Happy path - everything works correctly
   */
  export const happyPath = async (): Promise<void> => {
    console.log('\n🟢 Scenario 1: Happy Path');
    console.log('   All services working correctly, complete order processing');

    // Ensure all services are available
    ExternalServices.Payment.setAvailability(true);
    ExternalServices.Shipping.setAvailability(true);
    ExternalServices.Notifications.setAvailability(true);

    const orderData = createBaseOrder('ORD-HAPPY-001');
    const executionId = `exec-${orderData.orderId}`;

    try {
      const result = await Workflow.start(
        'ecommerce-order-processing',
        executionId,
        orderData
      );

      console.log(`   ✅ Order Status: ${result.orderStatus}`);
      console.log(`   ✅ Payment ID: ${result.paymentId}`);
      console.log(`   ✅ Tracking: ${result.trackingNumber}`);
      console.log(`   ✅ Notifications: ${result.notifications.sent ? 'Sent' : 'Failed'}`);
    } catch (error) {
      console.log(`   ❌ Unexpected error: ${error}`);
    }
  };

  /**
   * Scenario 2: Inventory issues - some products out of stock
   */
  export const inventoryIssues = async (): Promise<void> => {
    console.log('\n🟡 Scenario 2: Inventory Issues');
    console.log('   Some products out of stock, partial order processing');

    const orderData = createBaseOrder('ORD-INVENTORY-001');
    // Add out-of-stock item
    orderData.items.push({ productId: 'PROD-C3', quantity: 5, price: 39.99 });

    const executionId = `exec-${orderData.orderId}`;

    try {
      const result = await Workflow.start(
        'ecommerce-order-processing',
        executionId,
        orderData
      );

      console.log(`   ⚠️  Order Status: ${result.orderStatus}`);
      console.log(`   ✅ Processed Items: ${result.processedItems.length}/${orderData.items.length}`);
      console.log(`   ✅ Payment ID: ${result.paymentId}`);
      console.log(`   ✅ Tracking: ${result.trackingNumber}`);
    } catch (error) {
      console.log(`   ❌ Unexpected error: ${error}`);
    }
  };

  /**
   * Scenario 3: Payment failures with fallback
   */
  export const paymentFailures = async (): Promise<void> => {
    console.log('\n🟠 Scenario 3: Payment Failures');
    console.log('   Payment gateway down, using fallback payment method');

    // Disable primary payment service
    ExternalServices.Payment.setAvailability(false);

    const orderData = createBaseOrder('ORD-PAYMENT-001');
    const executionId = `exec-${orderData.orderId}`;

    try {
      const result = await Workflow.start(
        'ecommerce-order-processing',
        executionId,
        orderData
      );

      console.log(`   ✅ Order Status: ${result.orderStatus}`);
      console.log(`   ✅ Payment ID: ${result.paymentId} (fallback)`);
      console.log(`   ✅ Tracking: ${result.trackingNumber}`);
    } catch (error) {
      console.log(`   ❌ Payment processing failed: ${error}`);
    } finally {
      // Restore payment service
      ExternalServices.Payment.setAvailability(true);
    }
  };

  /**
   * Scenario 4: Shipping service down, manual processing
   */
  export const shippingProblems = async (): Promise<void> => {
    console.log('\n🟠 Scenario 4: Shipping Service Issues');
    console.log('   Shipping service unavailable, creating manual shipping task');

    // Disable shipping service
    ExternalServices.Shipping.setAvailability(false);

    const orderData = createBaseOrder('ORD-SHIPPING-001');
    const executionId = `exec-${orderData.orderId}`;

    try {
      const result = await Workflow.start(
        'ecommerce-order-processing',
        executionId,
        orderData
      );

      console.log(`   ✅ Order Status: ${result.orderStatus}`);
      console.log(`   ✅ Payment ID: ${result.paymentId}`);
      console.log(`   ⚠️  Tracking: ${result.trackingNumber} (manual)`);
    } catch (error) {
      console.log(`   ❌ Shipping processing failed: ${error}`);
    } finally {
      // Restore shipping service
      ExternalServices.Shipping.setAvailability(true);
    }
  };

  /**
   * Scenario 5: Notification failures with queuing
   */
  export const notificationFailures = async (): Promise<void> => {
    console.log('\n🟡 Scenario 5: Notification Failures');
    console.log('   Email service down, notifications queued for retry');

    // Disable notification service
    ExternalServices.Notifications.setAvailability(false);

    const orderData = createBaseOrder('ORD-NOTIFICATION-001');
    const executionId = `exec-${orderData.orderId}`;

    try {
      const result = await Workflow.start(
        'ecommerce-order-processing',
        executionId,
        orderData
      );

      console.log(`   ✅ Order Status: ${result.orderStatus}`);
      console.log(`   ✅ Payment ID: ${result.paymentId}`);
      console.log(`   ✅ Tracking: ${result.trackingNumber}`);
      console.log(`   ⚠️  Notifications: ${result.notifications.queued ? 'Queued' : 'Failed'}`);

      const stats = ExternalServices.Notifications.getStats();
      console.log(`   📊 Notification Stats: ${stats.sent} sent, ${stats.queued} queued`);
    } catch (error) {
      console.log(`   ❌ Notification processing failed: ${error}`);
    } finally {
      // Restore notification service
      ExternalServices.Notifications.setAvailability(true);
    }
  };

  /**
   * Scenario 6: Multiple service failures
   */
  export const multipleFailures = async (): Promise<void> => {
    console.log('\n🔴 Scenario 6: Multiple Service Failures');
    console.log('   Complex scenario with payment, shipping, and notification failures');

    // Disable multiple services
    ExternalServices.Payment.setAvailability(false);
    ExternalServices.Shipping.setAvailability(false);
    ExternalServices.Notifications.setAvailability(false);

    const orderData = createBaseOrder('ORD-MULTIPLE-001');
    // Add out-of-stock item for additional complexity
    orderData.items.push({ productId: 'PROD-C3', quantity: 2, price: 25.99 });

    const executionId = `exec-${orderData.orderId}`;

    try {
      const result = await Workflow.start(
        'ecommerce-order-processing',
        executionId,
        orderData
      );

      console.log(`   ⚠️  Order Status: ${result.orderStatus}`);
      console.log(`   ✅ Processed Items: ${result.processedItems.length}/${orderData.items.length}`);
      console.log(`   ✅ Payment ID: ${result.paymentId} (fallback)`);
      console.log(`   ⚠️  Tracking: ${result.trackingNumber} (manual)`);
      console.log(`   ⚠️  Notifications: ${result.notifications.queued ? 'Queued' : 'Failed'}`);
    } catch (error) {
      console.log(`   ❌ Processing failed: ${error}`);
    } finally {
      // Restore all services
      ExternalServices.Payment.setAvailability(true);
      ExternalServices.Shipping.setAvailability(true);
      ExternalServices.Notifications.setAvailability(true);
    }
  };

  /**
   * Scenario 7: Performance test with multiple concurrent orders
   */
  export const performanceTest = async (): Promise<void> => {
    console.log('\n⚡ Scenario 7: Performance Test');
    console.log('   Processing multiple concurrent orders');

    const orderCount = 5;
    const orders = Array.from({ length: orderCount }, (_, i) => ({
      data: createBaseOrder(`ORD-PERF-${String(i + 1).padStart(3, '0')}`),
      executionId: `exec-perf-${i + 1}`
    }));

    const startTime = Date.now();

    try {
      const results = await Promise.allSettled(
        orders.map(({ data, executionId }) =>
          Workflow.start('ecommerce-order-processing', executionId, data)
        )
      );

      const processingTime = Date.now() - startTime;
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      console.log(`   📊 Processed ${orderCount} orders in ${processingTime}ms`);
      console.log(`   ✅ Successful: ${successCount}`);
      console.log(`   ❌ Failed: ${failureCount}`);
      console.log(`   ⚡ Average: ${(processingTime / orderCount).toFixed(2)}ms per order`);

      if (failureCount > 0) {
        console.log('   Failed orders:');
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.log(`     ${orders[index].data.orderId}: ${result.reason}`);
          }
        });
      }
    } catch (error) {
      console.log(`   ❌ Performance test failed: ${error}`);
    }
  };

  /**
   * Run all test scenarios
   */
  export const runAll = async (): Promise<void> => {
    console.log('🧪 Running E-commerce Order Processing Test Scenarios\n');
    console.log('=' .repeat(60));

    const scenarios = [
      { name: 'Happy Path', fn: happyPath },
      { name: 'Inventory Issues', fn: inventoryIssues },
      { name: 'Payment Failures', fn: paymentFailures },
      { name: 'Shipping Problems', fn: shippingProblems },
      { name: 'Notification Failures', fn: notificationFailures },
      { name: 'Multiple Failures', fn: multipleFailures },
      { name: 'Performance Test', fn: performanceTest },
    ];

    let completedScenarios = 0;
    let failedScenarios = 0;

    for (const scenario of scenarios) {
      try {
        await scenario.fn();
        completedScenarios++;
        console.log(`   ✅ ${scenario.name} completed`);
      } catch (error) {
        failedScenarios++;
        console.log(`   ❌ ${scenario.name} failed: ${error}`);
      }
      
      // Small delay between scenarios
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Results Summary:');
    console.log(`   Total scenarios: ${scenarios.length}`);
    console.log(`   Completed: ${completedScenarios}`);
    console.log(`   Failed: ${failedScenarios}`);
    console.log(`   Success rate: ${((completedScenarios / scenarios.length) * 100).toFixed(1)}%`);
  };
}

/**
 * Main function to run test scenarios
 */
async function main(): Promise<void> {
  try {
    // Initialize workflow engine
    console.log('🚀 Initializing workflow engine for testing...');
    await Workflow.initialize(':memory:');
    
    // Define the workflow
    createOrderProcessingWorkflow();
    console.log('✅ Order processing workflow defined');

    // Run all test scenarios
    await TestScenarios.runAll();

    console.log('\n🎉 All test scenarios completed!');
    
  } catch (error) {
    console.error('\n❌ Test scenarios failed:', error);
    process.exit(1);
  }
}

// Export scenarios for individual testing
export { TestScenarios };

// Run if this file is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}