import { Workflow } from '../../packages/core/src';
import { createOrderProcessingWorkflow, type OrderInput } from './order-workflow';

/**
 * Main execution file for e-commerce order processing example
 */
async function main(): Promise<void> {
  try {
    // Initialize the workflow engine with in-memory database for demo
    console.log('🚀 Initializing workflow engine...');
    await Workflow.initialize(':memory:');
    
    // Define the order processing workflow
    createOrderProcessingWorkflow();
    console.log('✅ Order processing workflow defined');

    // Sample order data
    const orderData: OrderInput = {
      orderId: `ORD-${Date.now()}`,
      customerId: 'CUST-12345',
      items: [
        { productId: 'PROD-A1', quantity: 2, price: 29.99 },
        { productId: 'PROD-B2', quantity: 1, price: 49.99 },
        { productId: 'PROD-D4', quantity: 3, price: 19.99 }
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
      },
      notes: 'Please deliver during business hours'
    };

    console.log('\n📦 Processing order:', orderData.orderId);
    console.log('📋 Order details:');
    console.log(`   Customer: ${orderData.customerId}`);
    console.log(`   Items: ${orderData.items.length} products`);
    console.log(`   Total value: $${orderData.items.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2)}`);
    console.log(`   Shipping to: ${orderData.shippingAddress.city}, ${orderData.shippingAddress.state}`);

    // Execute the workflow
    const executionId = `exec-${orderData.orderId}`;
    const startTime = Date.now();
    
    const result = await Workflow.start(
      'ecommerce-order-processing',
      executionId,
      orderData
    );

    const processingTime = Date.now() - startTime;
    
    // Display results
    console.log('\n🎉 Order processing completed!');
    console.log(`⏱️  Processing time: ${processingTime}ms`);
    console.log('\n📊 Results:');
    console.log(`   Status: ${result.orderStatus}`);
    console.log(`   Total amount: $${result.totalAmount.toFixed(2)}`);
    console.log(`   Processed items: ${result.processedItems.length}/${orderData.items.length}`);
    console.log(`   Payment ID: ${result.paymentId || 'N/A'}`);
    console.log(`   Tracking number: ${result.trackingNumber || 'N/A'}`);
    console.log(`   Notifications sent: ${result.notifications.sent ? '✅' : '❌'}`);
    console.log(`   Notifications queued: ${result.notifications.queued ? '✅' : '❌'}`);

    // Get execution history for detailed view
    const execution = await Workflow.getExecution(executionId);
    if (execution && execution.steps) {
      console.log('\n📝 Execution steps:');
      execution.steps.forEach((step, index) => {
        const duration = step.completedAt && step.startedAt 
          ? new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()
          : 0;
        
        console.log(`   ${index + 1}. ${step.name} (${step.status}) - ${duration}ms`);
        if (step.error) {
          console.log(`      Error: ${step.error}`);
        }
      });
    }

    console.log('\n✨ Demo completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error processing order:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});

// Run the main function
if (import.meta.main) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };