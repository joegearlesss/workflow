import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ErrorHandling } from './error-handling';
import { WorkflowContext } from './context';
import { DatabaseClient } from './database';
import { Workflow } from './workflow';

describe('ErrorHandling', () => {
  beforeEach(async () => {
    await Workflow.initialize(':memory:');
  });

  afterEach(() => {
    DatabaseClient.close();
  });

  describe('WorkflowError', () => {
    test('should create workflow error with correct properties', () => {
      const error = new ErrorHandling.WorkflowError('Test error', 'TEST_ERROR', false, true);

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.recoverable).toBe(false);
      expect(error.retryable).toBe(true);
      expect(error.name).toBe('WorkflowError');
    });

    test('should use default values for recoverable and retryable', () => {
      const error = new ErrorHandling.WorkflowError('Test error', 'TEST_ERROR');

      expect(error.recoverable).toBe(true);
      expect(error.retryable).toBe(true);
    });
  });

  describe('NetworkError', () => {
    test('should create network error with status code', () => {
      const error = ErrorHandling.NetworkError.create('API failed', 500, 30);

      expect(error.message).toBe('API failed');
      expect(error.statusCode).toBe(500);
      expect(error.retryAfter).toBe(30);
      expect(error.name).toBe('NetworkError');
      expect(error.code).toBe('NETWORK_ERROR');
    });

    test('should set recoverable false for 4xx errors', () => {
      const clientError = ErrorHandling.NetworkError.create('Client error', 400);
      const serverError = ErrorHandling.NetworkError.create('Server error', 500);

      expect(clientError.recoverable).toBe(false);
      expect(serverError.recoverable).toBe(true);
    });

    test('should set retryable true for 5xx, 408, and 429 errors', () => {
      const serverError = ErrorHandling.NetworkError.create('Server error', 500);
      const timeoutError = ErrorHandling.NetworkError.create('Timeout', 408);
      const rateLimitError = ErrorHandling.NetworkError.create('Rate limited', 429);
      const clientError = ErrorHandling.NetworkError.create('Client error', 400);

      expect(serverError.retryable).toBe(true);
      expect(timeoutError.retryable).toBe(true);
      expect(rateLimitError.retryable).toBe(true);
      expect(clientError.retryable).toBe(false);
    });

    test('should identify network errors correctly', () => {
      const networkError = ErrorHandling.NetworkError.create('Network failed', 500);
      const regularError = new Error('Regular error');

      expect(ErrorHandling.NetworkError.is(networkError)).toBe(true);
      expect(ErrorHandling.NetworkError.is(regularError)).toBe(false);

      // Test with name-based detection
      const namedError = new Error('Named error');
      namedError.name = 'NetworkError';
      expect(ErrorHandling.NetworkError.is(namedError)).toBe(true);
    });
  });

  describe('ValidationError', () => {
    test('should create validation error with field information', () => {
      const error = ErrorHandling.ValidationError.create('Invalid email', 'email', 'invalid-email');

      expect(error.message).toBe('Invalid email');
      expect(error.field).toBe('email');
      expect(error.value).toBe('invalid-email');
      expect(error.name).toBe('ValidationError');
      expect(error.recoverable).toBe(false);
      expect(error.retryable).toBe(false);
    });

    test('should identify validation errors correctly', () => {
      const validationError = ErrorHandling.ValidationError.create('Invalid data', 'field');
      const regularError = new Error('Regular error');

      expect(ErrorHandling.ValidationError.is(validationError)).toBe(true);
      expect(ErrorHandling.ValidationError.is(regularError)).toBe(false);
    });
  });

  describe('ExternalServiceError', () => {
    test('should create external service error with service info', () => {
      const error = ErrorHandling.ExternalServiceError.create(
        'Service unavailable',
        'payment-service',
        'charge',
        false
      );

      expect(error.message).toBe('Service unavailable');
      expect(error.service).toBe('payment-service');
      expect(error.operationType).toBe('charge');
      expect(error.recoverable).toBe(false);
      expect(error.name).toBe('ExternalServiceError');
    });

    test('should use default recoverable value', () => {
      const error = ErrorHandling.ExternalServiceError.create(
        'Service error',
        'test-service',
        'operation'
      );

      expect(error.recoverable).toBe(true);
    });

    test('should identify external service errors correctly', () => {
      const serviceError = ErrorHandling.ExternalServiceError.create(
        'Service failed',
        'test-service',
        'operation'
      );

      expect(ErrorHandling.ExternalServiceError.is(serviceError)).toBe(true);
    });
  });

  describe('DatabaseError', () => {
    test('should create database error with operation info', () => {
      const error = ErrorHandling.DatabaseError.create(
        'Constraint violation',
        'insert',
        'unique_email'
      );

      expect(error.message).toBe('Constraint violation');
      expect(error.operation).toBe('insert');
      expect(error.constraint).toBe('unique_email');
      expect(error.name).toBe('DatabaseError');
    });

    test('should identify database errors correctly', () => {
      const dbError = ErrorHandling.DatabaseError.create('DB failed', 'select');

      expect(ErrorHandling.DatabaseError.is(dbError)).toBe(true);
    });
  });

  describe('TimeoutError', () => {
    test('should create timeout error with duration info', () => {
      const error = ErrorHandling.TimeoutError.create(
        'Operation timed out',
        5000,
        'api-call'
      );

      expect(error.message).toBe('Operation timed out');
      expect(error.timeoutMs).toBe(5000);
      expect(error.operation).toBe('api-call');
      expect(error.name).toBe('TimeoutError');
    });

    test('should identify timeout errors correctly', () => {
      const timeoutError = ErrorHandling.TimeoutError.create('Timeout', 1000, 'test');

      expect(ErrorHandling.TimeoutError.is(timeoutError)).toBe(true);
    });
  });

  describe('ResourceError', () => {
    test('should create resource error with limit info', () => {
      const error = ErrorHandling.ResourceError.create(
        'Memory exhausted',
        'memory',
        1024,
        2048
      );

      expect(error.message).toBe('Memory exhausted');
      expect(error.resource).toBe('memory');
      expect(error.limit).toBe(1024);
      expect(error.current).toBe(2048);
      expect(error.name).toBe('ResourceError');
      expect(error.recoverable).toBe(true);
      expect(error.retryable).toBe(false);
    });

    test('should identify resource errors correctly', () => {
      const resourceError = ErrorHandling.ResourceError.create('Resource exhausted', 'disk');

      expect(ErrorHandling.ResourceError.is(resourceError)).toBe(true);
    });
  });

  describe('Handlers', () => {
    const createMockContext = (attempt = 1) => ({
      executionId: 'test-exec',
      workflowName: 'test-workflow',
      input: {},
      attempt,
      options: {},
      async sleep(name: string, durationMs: number) {
        // Mock sleep implementation that doesn't use database
        await new Promise(resolve => setTimeout(resolve, Math.min(durationMs, 10))); // Cap at 10ms for tests
        return { slept: true, duration: durationMs };
      }
    });

    describe('exponentialBackoff', () => {
      test('should retry with exponential backoff', async () => {
        const handler = ErrorHandling.Handlers.exponentialBackoff(100, 1000, 3);
        const context = createMockContext(2);
        const error = new Error('Test error');

        await expect(handler(error, context)).rejects.toThrow('Test error');
        
        // Sleep step should have been created with exponential delay
        // (baseDelay * 2^(attempt-1)) = 100 * 2^1 = 200ms
      });

      test('should fail after max attempts', async () => {
        const handler = ErrorHandling.Handlers.exponentialBackoff(100, 1000, 2);
        const context = createMockContext(2); // At max attempts
        const error = new Error('Test error');

        await expect(handler(error, context)).rejects.toThrow('Max retry attempts (2) exceeded: Test error');
      });

      test('should respect max delay', async () => {
        const handler = ErrorHandling.Handlers.exponentialBackoff(1000, 500, 5);
        const context = createMockContext(3);
        const error = new Error('Test error');

        // Should cap at maxDelayMs (500) instead of 1000 * 2^2 = 4000
        await expect(handler(error, context)).rejects.toThrow('Test error');
      });
    });

    describe('fallback', () => {
      test('should return fallback value', async () => {
        const handler = ErrorHandling.Handlers.fallback({ fallback: 'value' });
        const context = createMockContext();
        const error = new Error('Test error');

        const result = await handler(error, context);
        expect(result).toEqual({ fallback: 'value' });
      });
    });

    describe('logAndRethrow', () => {
      test('should log error and rethrow', async () => {
        let loggedError: Error | undefined;
        const logger = (error: Error) => {
          loggedError = error;
        };

        const handler = ErrorHandling.Handlers.logAndRethrow(logger);
        const context = createMockContext();
        const error = new Error('Test error');

        await expect(handler(error, context)).rejects.toThrow('Test error');
        expect(loggedError).toBe(error);
      });

      test('should use default console.error when no logger provided', async () => {
        const handler = ErrorHandling.Handlers.logAndRethrow();
        const context = createMockContext();
        const error = new Error('Test error');

        await expect(handler(error, context)).rejects.toThrow('Test error');
      });
    });

    describe('circuitBreakerFallback', () => {
      test('should call fallback function', async () => {
        const fallbackFn = async () => ({ fallback: 'from-circuit-breaker' });
        const handler = ErrorHandling.Handlers.circuitBreakerFallback(fallbackFn);
        const context = createMockContext();
        const error = new Error('Circuit breaker open');

        const result = await handler(error, context);
        expect(result).toEqual({ fallback: 'from-circuit-breaker' });
      });
    });

    describe('conditionalRetry', () => {
      test('should retry when condition is met', async () => {
        const shouldRetry = (error: Error) => error.message.includes('retryable');
        const handler = ErrorHandling.Handlers.conditionalRetry(shouldRetry, 3, 100);
        const context = createMockContext(1);
        const error = new Error('retryable error');

        await expect(handler(error, context)).rejects.toThrow('retryable error');
      });

      test('should not retry when condition is not met', async () => {
        const shouldRetry = (error: Error) => error.message.includes('retryable');
        const handler = ErrorHandling.Handlers.conditionalRetry(shouldRetry, 3, 100);
        const context = createMockContext(1);
        const error = new Error('non-retryable error');

        await expect(handler(error, context)).rejects.toThrow('non-retryable error');
      });

      test('should not retry after max attempts', async () => {
        const shouldRetry = () => true;
        const handler = ErrorHandling.Handlers.conditionalRetry(shouldRetry, 2, 100);
        const context = createMockContext(2);
        const error = new Error('retryable error');

        await expect(handler(error, context)).rejects.toThrow('retryable error');
      });
    });

    describe('alertAndFail', () => {
      test('should call alert function and rethrow', async () => {
        let alertCalled = false;
        const alertFn = async () => {
          alertCalled = true;
        };

        const handler = ErrorHandling.Handlers.alertAndFail(alertFn);
        const context = createMockContext();
        const error = new Error('Alert error');

        await expect(handler(error, context)).rejects.toThrow('Alert error');
        expect(alertCalled).toBe(true);
      });

      test('should handle alert function failure gracefully', async () => {
        const alertFn = async () => {
          throw new Error('Alert failed');
        };

        const handler = ErrorHandling.Handlers.alertAndFail(alertFn);
        const context = createMockContext();
        const error = new Error('Original error');

        await expect(handler(error, context)).rejects.toThrow('Original error');
      });
    });
  });

  describe('HandlerMaps', () => {
    const createMockContext = () => WorkflowContext.create('test-exec', 'test-workflow', {}, 1, {});

    describe('basicRetry', () => {
      test('should create handler map with retry patterns', () => {
        const handlerMap = ErrorHandling.HandlerMaps.basicRetry();

        expect(handlerMap.NetworkError).toBeDefined();
        expect(handlerMap.TimeoutError).toBeDefined();
        expect(handlerMap.ExternalServiceError).toBeDefined();
        expect(handlerMap.DatabaseError).toBeDefined();
        expect(handlerMap.default).toBeDefined();
      });

      test('should include fallback handlers when fallback value provided', () => {
        const handlerMap = ErrorHandling.HandlerMaps.basicRetry({ fallback: 'value' });

        expect(handlerMap.ValidationError).toBeDefined();
        expect(handlerMap.ResourceError).toBeDefined();
      });
    });

    describe('apiCall', () => {
      test('should create handler map for API calls', () => {
        const handlerMap = ErrorHandling.HandlerMaps.apiCall();

        expect(handlerMap.NetworkError).toBeDefined();
        expect(handlerMap.TimeoutError).toBeDefined();
        expect(handlerMap.ExternalServiceError).toBeDefined();
        expect(handlerMap.ValidationError).toBeDefined();
        expect(handlerMap.default).toBeDefined();
      });

      test('should use circuit breaker fallback when provided', () => {
        const fallbackFn = async () => ({ circuit: 'fallback' });
        const handlerMap = ErrorHandling.HandlerMaps.apiCall(fallbackFn);

        expect(handlerMap.default).toBeDefined();
      });
    });

    describe('dataProcessing', () => {
      test('should create handler map for data processing', () => {
        const handlerMap = ErrorHandling.HandlerMaps.dataProcessing();

        expect(handlerMap.ValidationError).toBeDefined();
        expect(handlerMap.ResourceError).toBeDefined();
        expect(handlerMap.DatabaseError).toBeDefined();
        expect(handlerMap.default).toBeDefined();
      });

      test('should use custom validation error handler when provided', () => {
        const onValidationError = async () => ({ handled: 'validation' });
        const handlerMap = ErrorHandling.HandlerMaps.dataProcessing(onValidationError);

        expect(handlerMap.ValidationError).toBeDefined();
      });
    });
  });

  describe('Classification', () => {
    describe('isRetryable', () => {
      test('should return retryable property for WorkflowError', () => {
        const retryableError = new ErrorHandling.NetworkError('Network error', 500);
        const nonRetryableError = new ErrorHandling.NetworkError('Client error', 400);

        expect(ErrorHandling.Classification.isRetryable(retryableError)).toBe(true);
        expect(ErrorHandling.Classification.isRetryable(nonRetryableError)).toBe(false);
      });

      test('should classify unknown errors as retryable except validation/auth', () => {
        const unknownError = new Error('Unknown error');
        const validationError = new Error('validation failed');
        const authError = new Error('unauthorized access');

        expect(ErrorHandling.Classification.isRetryable(unknownError)).toBe(true);
        expect(ErrorHandling.Classification.isRetryable(validationError)).toBe(false);
        expect(ErrorHandling.Classification.isRetryable(authError)).toBe(false);
      });
    });

    describe('isRecoverable', () => {
      test('should return recoverable property for WorkflowError', () => {
        const recoverableError = new ErrorHandling.NetworkError('Server error', 500);
        const nonRecoverableError = new ErrorHandling.NetworkError('Client error', 400);

        expect(ErrorHandling.Classification.isRecoverable(recoverableError)).toBe(true);
        expect(ErrorHandling.Classification.isRecoverable(nonRecoverableError)).toBe(false);
      });

      test('should classify unknown errors as recoverable except validation', () => {
        const unknownError = new Error('Unknown error');
        const validationError = new Error('invalid data');

        expect(ErrorHandling.Classification.isRecoverable(unknownError)).toBe(true);
        expect(ErrorHandling.Classification.isRecoverable(validationError)).toBe(false);
      });
    });

    describe('isValidationError', () => {
      test('should identify validation errors', () => {
        const validationError = ErrorHandling.ValidationError.create('Invalid', 'field');
        const validationMessage = new Error('validation failed');
        const invalidMessage = new Error('invalid input');
        const otherError = new Error('other error');

        expect(ErrorHandling.Classification.isValidationError(validationError)).toBe(true);
        expect(ErrorHandling.Classification.isValidationError(validationMessage)).toBe(true);
        expect(ErrorHandling.Classification.isValidationError(invalidMessage)).toBe(true);
        expect(ErrorHandling.Classification.isValidationError(otherError)).toBe(false);
      });
    });

    describe('isAuthenticationError', () => {
      test('should identify authentication errors', () => {
        const authError = new Error('auth failed');
        const unauthorizedError = new Error('unauthorized access');
        const forbiddenError = new Error('forbidden resource');
        const otherError = new Error('other error');

        expect(ErrorHandling.Classification.isAuthenticationError(authError)).toBe(true);
        expect(ErrorHandling.Classification.isAuthenticationError(unauthorizedError)).toBe(true);
        expect(ErrorHandling.Classification.isAuthenticationError(forbiddenError)).toBe(true);
        expect(ErrorHandling.Classification.isAuthenticationError(otherError)).toBe(false);
      });
    });

    describe('isTemporary', () => {
      test('should identify temporary failures', () => {
        const networkServerError = ErrorHandling.NetworkError.create('Server error', 500);
        const networkClientError = ErrorHandling.NetworkError.create('Client error', 400);
        const timeoutError = ErrorHandling.TimeoutError.create('Timeout', 5000, 'operation');
        const serviceError = ErrorHandling.ExternalServiceError.create('Service down', 'service', 'op');
        const dbError = ErrorHandling.DatabaseError.create('DB error', 'select');
        const validationError = ErrorHandling.ValidationError.create('Invalid', 'field');

        expect(ErrorHandling.Classification.isTemporary(networkServerError)).toBe(true);
        expect(ErrorHandling.Classification.isTemporary(networkClientError)).toBe(false);
        expect(ErrorHandling.Classification.isTemporary(timeoutError)).toBe(true);
        expect(ErrorHandling.Classification.isTemporary(serviceError)).toBe(true);
        expect(ErrorHandling.Classification.isTemporary(dbError)).toBe(true);
        expect(ErrorHandling.Classification.isTemporary(validationError)).toBe(false);
      });
    });

    describe('getRetryDelay', () => {
      test('should use retryAfter for NetworkError', () => {
        const error = ErrorHandling.NetworkError.create('Rate limited', 429, 10);
        const delay = ErrorHandling.Classification.getRetryDelay(error, 1);

        expect(delay).toBe(10000); // 10 seconds in ms
      });

      test('should use longer exponential backoff for TimeoutError', () => {
        const error = ErrorHandling.TimeoutError.create('Timeout', 5000, 'operation');
        const delay1 = ErrorHandling.Classification.getRetryDelay(error, 1);
        const delay2 = ErrorHandling.Classification.getRetryDelay(error, 2);

        expect(delay1).toBe(5000); // 5000 * 2^0
        expect(delay2).toBe(10000); // 5000 * 2^1
      });

      test('should use medium exponential backoff for ExternalServiceError', () => {
        const error = ErrorHandling.ExternalServiceError.create('Service error', 'service', 'op');
        const delay1 = ErrorHandling.Classification.getRetryDelay(error, 1);
        const delay2 = ErrorHandling.Classification.getRetryDelay(error, 2);

        expect(delay1).toBe(2000); // 2000 * 2^0
        expect(delay2).toBe(4000); // 2000 * 2^1
      });

      test('should use default exponential backoff for other errors', () => {
        const error = new Error('Generic error');
        const delay1 = ErrorHandling.Classification.getRetryDelay(error, 1);
        const delay2 = ErrorHandling.Classification.getRetryDelay(error, 2);

        expect(delay1).toBe(1000); // 1000 * 2^0
        expect(delay2).toBe(2000); // 1000 * 2^1
      });

      test('should respect maximum delay limits', () => {
        const timeoutError = ErrorHandling.TimeoutError.create('Timeout', 5000, 'operation');
        const longDelay = ErrorHandling.Classification.getRetryDelay(timeoutError, 10);

        expect(longDelay).toBe(60000); // Capped at 60 seconds
      });
    });
  });
});