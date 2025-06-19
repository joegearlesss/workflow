import { describe, test, expect } from 'bun:test';
import { ErrorHandling } from './error-handling';

describe('ErrorHandling Performance', () => {
  describe('error creation performance', () => {
    test('should create WorkflowError within 0.1ms', () => {
      const start = performance.now();
      const error = new ErrorHandling.WorkflowError('Test error', 'TEST_CODE', true, false);
      const end = performance.now();

      expect(error.message).toBe('Test error');
      expect(end - start).toBeLessThan(0.1);
    });

    test('should create NetworkError within 0.1ms', () => {
      const start = performance.now();
      const error = ErrorHandling.NetworkError.create('Network failed', 500, 10);
      const end = performance.now();

      expect(error.statusCode).toBe(500);
      expect(end - start).toBeLessThan(0.1);
    });

    test('should create 1000 errors within 10ms', () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        ErrorHandling.ValidationError.create(`Error ${i}`, `field${i}`, i);
      }
      const end = performance.now();

      expect(end - start).toBeLessThan(10);
    });

    test('should create complex error hierarchy efficiently', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        ErrorHandling.NetworkError.create('Network error', 500);
        ErrorHandling.ValidationError.create('Validation error', 'field');
        ErrorHandling.ExternalServiceError.create('Service error', 'service', 'operation');
        ErrorHandling.DatabaseError.create('Database error', 'operation');
        ErrorHandling.TimeoutError.create('Timeout error', 5000, 'operation');
        ErrorHandling.ResourceError.create('Resource error', 'memory', 1024, 2048);
      }
      
      const end = performance.now();

      expect(end - start).toBeLessThan(50);
    });
  });

  describe('error identification performance', () => {
    test('should identify error types within 0.01ms', () => {
      const networkError = ErrorHandling.NetworkError.create('Network failed', 500);
      const validationError = ErrorHandling.ValidationError.create('Invalid', 'field');
      const serviceError = ErrorHandling.ExternalServiceError.create('Service down', 'service', 'op');

      const start = performance.now();
      
      const isNetwork = ErrorHandling.NetworkError.is(networkError);
      const isValidation = ErrorHandling.ValidationError.is(validationError);
      const isService = ErrorHandling.ExternalServiceError.is(serviceError);
      
      const end = performance.now();

      expect(isNetwork).toBe(true);
      expect(isValidation).toBe(true);
      expect(isService).toBe(true);
      expect(end - start).toBeLessThan(0.01);
    });

    test('should classify 1000 errors efficiently', () => {
      const errors = [
        ErrorHandling.NetworkError.create('Network', 500),
        ErrorHandling.ValidationError.create('Validation', 'field'),
        new Error('Unknown error'),
        ErrorHandling.TimeoutError.create('Timeout', 5000, 'op'),
        ErrorHandling.ResourceError.create('Resource', 'memory'),
      ];

      const start = performance.now();
      
      for (let i = 0; i < 1000; i++) {
        const error = errors[i % errors.length];
        ErrorHandling.Classification.isRetryable(error);
        ErrorHandling.Classification.isRecoverable(error);
        ErrorHandling.Classification.isTemporary(error);
      }
      
      const end = performance.now();

      expect(end - start).toBeLessThan(20);
    });
  });

  describe('error handler performance', () => {
    test('should execute exponential backoff handler within 1ms', async () => {
      const handler = ErrorHandling.Handlers.exponentialBackoff(100, 1000, 3);
      const mockContext = {
        executionId: 'test-exec',
        workflowName: 'test-workflow',
        input: {},
        attempt: 1,
        metadata: {},
        step: () => ({ execute: async () => ({}) }),
        sleep: async () => {},
      };

      const error = new Error('Test error');

      const start = performance.now();
      try {
        await handler(error, mockContext as any);
      } catch {
        // Expected to throw
      }
      const end = performance.now();

      expect(end - start).toBeLessThan(1);
    });

    test('should execute fallback handler within 0.1ms', async () => {
      const handler = ErrorHandling.Handlers.fallback({ fallback: 'value' });
      const mockContext = {
        executionId: 'test-exec',
        workflowName: 'test-workflow',
        input: {},
        attempt: 1,
        metadata: {},
      };

      const error = new Error('Test error');

      const start = performance.now();
      const result = await handler(error, mockContext as any);
      const end = performance.now();

      expect(result).toEqual({ fallback: 'value' });
      expect(end - start).toBeLessThan(0.1);
    });

    test('should execute conditional retry handler efficiently', async () => {
      const shouldRetry = (error: Error) => error.message.includes('retryable');
      const handler = ErrorHandling.Handlers.conditionalRetry(shouldRetry, 3, 1);
      
      const mockContext = {
        executionId: 'test-exec',
        workflowName: 'test-workflow',
        input: {},
        attempt: 1,
        metadata: {},
        sleep: async () => {},
      };

      const retryableError = new Error('retryable error');
      const nonRetryableError = new Error('non-retryable error');

      const start = performance.now();
      
      try {
        await handler(retryableError, mockContext as any);
      } catch {
        // Expected
      }
      
      try {
        await handler(nonRetryableError, mockContext as any);
      } catch {
        // Expected
      }
      
      const end = performance.now();

      expect(end - start).toBeLessThan(2);
    });

    test('should handle 100 error scenarios efficiently', async () => {
      const handlers = [
        ErrorHandling.Handlers.fallback({ fallback: 'test' }),
        ErrorHandling.Handlers.logAndRethrow(),
        ErrorHandling.Handlers.conditionalRetry(() => false),
      ];

      const mockContext = {
        executionId: 'test-exec',
        workflowName: 'test-workflow',
        input: {},
        attempt: 1,
        metadata: {},
        sleep: async () => {},
      };

      const errors = [
        new Error('Error 1'),
        ErrorHandling.NetworkError.create('Network error', 500),
        ErrorHandling.ValidationError.create('Validation error', 'field'),
      ];

      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        const handler = handlers[i % handlers.length];
        const error = errors[i % errors.length];
        
        try {
          await handler(error, mockContext as any);
        } catch {
          // Some handlers throw, others return values
        }
      }
      
      const end = performance.now();

      expect(end - start).toBeLessThan(50);
    });
  });

  describe('handler map performance', () => {
    test('should create basic retry handler map within 1ms', () => {
      const start = performance.now();
      const handlerMap = ErrorHandling.HandlerMaps.basicRetry({ fallback: 'value' });
      const end = performance.now();

      expect(handlerMap.NetworkError).toBeDefined();
      expect(handlerMap.ValidationError).toBeDefined();
      expect(handlerMap.default).toBeDefined();
      expect(end - start).toBeLessThan(1);
    });

    test('should create API call handler map within 1ms', () => {
      const fallbackFn = async () => ({ api: 'fallback' });
      
      const start = performance.now();
      const handlerMap = ErrorHandling.HandlerMaps.apiCall(fallbackFn);
      const end = performance.now();

      expect(handlerMap.NetworkError).toBeDefined();
      expect(handlerMap.TimeoutError).toBeDefined();
      expect(handlerMap.default).toBeDefined();
      expect(end - start).toBeLessThan(1);
    });

    test('should create data processing handler map within 1ms', () => {
      const onValidationError = async () => ({ handled: 'validation' });
      
      const start = performance.now();
      const handlerMap = ErrorHandling.HandlerMaps.dataProcessing(onValidationError);
      const end = performance.now();

      expect(handlerMap.ValidationError).toBeDefined();
      expect(handlerMap.DatabaseError).toBeDefined();
      expect(handlerMap.default).toBeDefined();
      expect(end - start).toBeLessThan(1);
    });

    test('should create 100 handler maps efficiently', () => {
      const start = performance.now();
      
      for (let i = 0; i < 100; i++) {
        ErrorHandling.HandlerMaps.basicRetry();
        ErrorHandling.HandlerMaps.apiCall();
        ErrorHandling.HandlerMaps.dataProcessing();
      }
      
      const end = performance.now();

      expect(end - start).toBeLessThan(50);
    });
  });

  describe('classification performance', () => {
    test('should classify errors within 0.01ms each', () => {
      const errors = [
        ErrorHandling.NetworkError.create('Network', 500),
        ErrorHandling.ValidationError.create('Validation', 'field'),
        ErrorHandling.TimeoutError.create('Timeout', 5000, 'op'),
        new Error('validation failed'),
        new Error('unauthorized access'),
        new Error('temporary failure'),
        new Error('unknown error'),
      ];

      const start = performance.now();
      
      errors.forEach(error => {
        ErrorHandling.Classification.isRetryable(error);
        ErrorHandling.Classification.isRecoverable(error);
        ErrorHandling.Classification.isValidationError(error);
        ErrorHandling.Classification.isAuthenticationError(error);
        ErrorHandling.Classification.isTemporary(error);
      });
      
      const end = performance.now();

      expect(end - start).toBeLessThan(0.5);
    });

    test('should calculate retry delays efficiently', () => {
      const errors = [
        ErrorHandling.NetworkError.create('Network', 500, 10),
        ErrorHandling.TimeoutError.create('Timeout', 5000, 'op'),
        ErrorHandling.ExternalServiceError.create('Service', 'service', 'op'),
        new Error('Generic error'),
      ];

      const start = performance.now();
      
      for (let attempt = 1; attempt <= 5; attempt++) {
        errors.forEach(error => {
          ErrorHandling.Classification.getRetryDelay(error, attempt);
        });
      }
      
      const end = performance.now();

      expect(end - start).toBeLessThan(1);
    });
  });

  describe('memory usage', () => {
    test('should not leak memory when creating many errors', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create many errors
      for (let i = 0; i < 1000; i++) {
        ErrorHandling.NetworkError.create(`Network error ${i}`, 500);
        ErrorHandling.ValidationError.create(`Validation error ${i}`, `field${i}`);
        ErrorHandling.TimeoutError.create(`Timeout error ${i}`, 5000, `operation${i}`);
      }

      // Force garbage collection if available
      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 5MB for 3000 errors)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });

    test('should not leak memory with handler map creation', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create many handler maps
      for (let i = 0; i < 500; i++) {
        ErrorHandling.HandlerMaps.basicRetry({ fallback: `value${i}` });
        ErrorHandling.HandlerMaps.apiCall(async () => ({ api: `fallback${i}` }));
        ErrorHandling.HandlerMaps.dataProcessing();
      }

      // Force garbage collection if available
      if (global.gc) global.gc();

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 2MB for 1500 handler maps)
      expect(memoryIncrease).toBeLessThan(2 * 1024 * 1024);
    });
  });

  describe('throughput tests', () => {
    test('should achieve minimum error processing throughput', () => {
      const errorCount = 1000;
      const errors = Array.from({ length: errorCount }, (_, i) => 
        ErrorHandling.NetworkError.create(`Error ${i}`, 500)
      );

      const start = performance.now();
      
      errors.forEach(error => {
        ErrorHandling.NetworkError.is(error);
        ErrorHandling.Classification.isRetryable(error);
        ErrorHandling.Classification.getRetryDelay(error, 1);
      });
      
      const end = performance.now();

      const durationSeconds = (end - start) / 1000;
      const throughput = errorCount / durationSeconds;

      // Should process at least 10,000 errors per second
      expect(throughput).toBeGreaterThan(10000);
    });

    test('should achieve minimum handler execution throughput', async () => {
      const handlerCount = 100;
      const fallbackHandler = ErrorHandling.Handlers.fallback({ test: 'value' });
      const mockContext = {
        executionId: 'test-exec',
        workflowName: 'test-workflow',
        input: {},
        attempt: 1,
        metadata: {},
      };

      const start = performance.now();
      
      const promises = Array.from({ length: handlerCount }, (_, i) =>
        fallbackHandler(new Error(`Error ${i}`), mockContext as any)
      );
      
      await Promise.all(promises);
      const end = performance.now();

      const durationSeconds = (end - start) / 1000;
      const throughput = handlerCount / durationSeconds;

      // Should execute at least 1,000 handlers per second
      expect(throughput).toBeGreaterThan(1000);
    });
  });
});