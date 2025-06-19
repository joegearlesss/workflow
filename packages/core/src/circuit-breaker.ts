import { Database } from './database';
import type { CircuitBreakerConfig } from './types';

/**
 * Circuit breaker implementation for preventing cascading failures
 */
namespace CircuitBreaker {
  
  /**
   * Circuit breaker state types
   */
  export type State = 'closed' | 'open' | 'half-open';

  /**
   * Circuit breaker instance configuration
   */
  export interface Config extends CircuitBreakerConfig {
    readonly name: string;
    readonly successThreshold?: number; // Number of successes needed to close from half-open
    readonly monitoringPeriod?: number; // Time window for failure counting (ms)
    readonly stateChangeListener?: (state: State, name: string) => void;
  }

  /**
   * Circuit breaker statistics
   */
  export interface Statistics {
    readonly state: State;
    readonly failureCount: number;
    readonly successCount: number;
    readonly lastFailureAt?: Date | undefined;
    readonly lastSuccessAt?: Date | undefined;
    readonly nextAttemptAt?: Date | undefined;
    readonly totalRequests: number;
    readonly totalFailures: number;
    readonly totalSuccesses: number;
    readonly uptime: number; // Percentage
  }

  /**
   * Create a new circuit breaker instance
   */
  export const create = (config: Config): CircuitBreakerInstance => {
    return new CircuitBreakerInstance(config);
  };

  /**
   * Get circuit breaker statistics
   */
  export const getStatistics = async (name: string): Promise<Statistics | undefined> => {
    try {
      const state = await Database.CircuitBreaker.get(name);
      
      if (!state) {
        return undefined;
      }
      
      return {
        state: state.state,
        failureCount: state.failureCount,
        successCount: 0, // TODO: Add success tracking to schema
        lastFailureAt: state.lastFailureAt,
        lastSuccessAt: undefined, // TODO: Add to schema
        nextAttemptAt: state.nextAttemptAt,
        totalRequests: 0, // TODO: Add to schema
        totalFailures: state.failureCount,
        totalSuccesses: 0, // TODO: Add to schema
        uptime: state.failureCount === 0 ? 100 : 0, // Simplified calculation
      };
    } catch {
      return undefined;
    }
  };

  /**
   * Reset a circuit breaker to closed state
   */
  export const reset = async (name: string): Promise<boolean> => {
    try {
      const result = await Database.CircuitBreaker.reset(name);
      return result !== undefined;
    } catch {
      return false;
    }
  };

  /**
   * List all circuit breakers and their states
   */
  export const listAll = async (): Promise<readonly { name: string; state: State }[]> => {
    // TODO: Implement when we add a list method to database operations
    return [];
  };
}

/**
 * Circuit breaker instance implementation
 */
class CircuitBreakerInstance {
  private readonly config: CircuitBreaker.Config;
  
  constructor(config: CircuitBreaker.Config) {
    this.config = {
      successThreshold: 3,
      monitoringPeriod: 60000, // 1 minute
      ...config,
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    const canExecute = await this.canExecute();
    
    if (!canExecute) {
      if (fallback) {
        console.warn(`Circuit breaker '${this.config.name}' is open, using fallback`);
        return fallback();
      }
      
      if (this.config.onOpen) {
        // Execute the onOpen callback but still throw
        try {
          await this.config.onOpen(undefined as any); // Context not available here
        } catch (error) {
          console.error('Circuit breaker onOpen callback failed:', error);
        }
      }
      
      throw new Error(`Circuit breaker '${this.config.name}' is open`);
    }

    try {
      const result = await operation();
      await this.recordSuccess();
      return result;
    } catch (error) {
      await this.recordFailure();
      throw error;
    }
  }

  /**
   * Check if the circuit breaker allows execution
   */
  async canExecute(): Promise<boolean> {
    const state = await Database.CircuitBreaker.getOrCreate(this.config.name);
    
    switch (state.state) {
      case 'closed':
        return true;
        
      case 'open':
        // Check if reset timeout has passed
        if (state.nextAttemptAt && new Date() >= state.nextAttemptAt) {
          await this.transitionToHalfOpen();
          return true;
        }
        return false;
        
      case 'half-open':
        return true;
        
      default:
        return true;
    }
  }

  /**
   * Record a successful operation
   */
  async recordSuccess(): Promise<void> {
    const state = await Database.CircuitBreaker.getOrCreate(this.config.name);
    
    if (state.state === 'half-open') {
      // TODO: Track success count and close circuit after successThreshold
      await this.transitionToClosed();
    } else if (state.state === 'closed') {
      // Reset failure count on success in closed state
      if (state.failureCount > 0) {
        await Database.CircuitBreaker.update(this.config.name, {
          failureCount: 0,
          lastFailureAt: undefined,
        });
      }
    }
  }

  /**
   * Record a failed operation
   */
  async recordFailure(): Promise<void> {
    const state = await Database.CircuitBreaker.getOrCreate(this.config.name);
    const newFailureCount = state.failureCount + 1;
    const now = new Date();

    if (state.state === 'half-open') {
      // Failure in half-open state immediately opens the circuit
      await this.transitionToOpen(newFailureCount, now);
    } else if (newFailureCount >= this.config.failureThreshold) {
      // Failure threshold reached, open the circuit
      await this.transitionToOpen(newFailureCount, now);
    } else {
      // Just increment failure count
      await Database.CircuitBreaker.update(this.config.name, {
        failureCount: newFailureCount,
        lastFailureAt: now,
      });
    }
  }

  /**
   * Transition to closed state
   */
  private async transitionToClosed(): Promise<void> {
    await Database.CircuitBreaker.update(this.config.name, {
      state: 'closed',
      failureCount: 0,
      lastFailureAt: undefined,
      nextAttemptAt: undefined,
    });
    
    this.notifyStateChange('closed');
  }

  /**
   * Transition to open state
   */
  private async transitionToOpen(failureCount: number, lastFailureAt: Date): Promise<void> {
    const nextAttemptAt = new Date(lastFailureAt.getTime() + this.config.resetTimeout);
    
    await Database.CircuitBreaker.update(this.config.name, {
      state: 'open',
      failureCount,
      lastFailureAt,
      nextAttemptAt,
    });
    
    this.notifyStateChange('open');
  }

  /**
   * Transition to half-open state
   */
  private async transitionToHalfOpen(): Promise<void> {
    await Database.CircuitBreaker.update(this.config.name, {
      state: 'half-open',
      nextAttemptAt: undefined,
    });
    
    this.notifyStateChange('half-open');
  }

  /**
   * Notify state change listeners
   */
  private notifyStateChange(newState: CircuitBreaker.State): void {
    if (this.config.stateChangeListener) {
      try {
        this.config.stateChangeListener(newState, this.config.name);
      } catch (error) {
        console.error('Circuit breaker state change listener failed:', error);
      }
    }
  }

  /**
   * Get current circuit breaker state
   */
  async getState(): Promise<CircuitBreaker.State> {
    const state = await Database.CircuitBreaker.getOrCreate(this.config.name);
    return state.state;
  }

  /**
   * Force reset the circuit breaker
   */
  async reset(): Promise<void> {
    await this.transitionToClosed();
  }

  /**
   * Get circuit breaker statistics
   */
  async getStatistics(): Promise<CircuitBreaker.Statistics> {
    const stats = await CircuitBreaker.getStatistics(this.config.name);
    if (!stats) {
      throw new Error(`Circuit breaker '${this.config.name}' not found`);
    }
    return stats;
  }
}

/**
 * Global circuit breaker registry for reusing instances
 */
namespace CircuitBreakerRegistry {
  const instances = new Map<string, CircuitBreakerInstance>();

  /**
   * Get or create a circuit breaker instance
   */
  export const getOrCreate = (config: CircuitBreaker.Config): CircuitBreakerInstance => {
    const existing = instances.get(config.name);
    if (existing) {
      return existing;
    }

    const instance = new CircuitBreakerInstance(config);
    instances.set(config.name, instance);
    return instance;
  };

  /**
   * Get an existing circuit breaker instance
   */
  export const get = (name: string): CircuitBreakerInstance | undefined => {
    return instances.get(name);
  };

  /**
   * Remove a circuit breaker instance
   */
  export const remove = (name: string): boolean => {
    return instances.delete(name);
  };

  /**
   * List all registered circuit breaker names
   */
  export const list = (): readonly string[] => {
    return Array.from(instances.keys());
  };

  /**
   * Clear all circuit breaker instances
   */
  export const clear = (): void => {
    instances.clear();
  };
}

/**
 * Utility functions for creating common circuit breaker configurations
 */
namespace CircuitBreakerUtils {
  /**
   * Create a fast-fail circuit breaker for external services
   */
  export const fastFail = (name: string): CircuitBreaker.Config => ({
    name,
    failureThreshold: 5,
    resetTimeout: 30000, // 30 seconds
    successThreshold: 2,
  });

  /**
   * Create a resilient circuit breaker for critical services
   */
  export const resilient = (name: string): CircuitBreaker.Config => ({
    name,
    failureThreshold: 10,
    resetTimeout: 60000, // 1 minute
    successThreshold: 5,
  });

  /**
   * Create a sensitive circuit breaker for unreliable services
   */
  export const sensitive = (name: string): CircuitBreaker.Config => ({
    name,
    failureThreshold: 3,
    resetTimeout: 15000, // 15 seconds
    successThreshold: 1,
  });

  /**
   * Create a circuit breaker with custom fallback
   */
  export const withFallback = <T>(
    name: string,
    fallbackValue: T,
    config: Partial<CircuitBreaker.Config> = {}
  ): CircuitBreaker.Config => ({
    name,
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 3,
    ...config,
    onOpen: async () => {
      console.warn(`Circuit breaker '${name}' opened, using fallback value`);
    },
  });
}

export { CircuitBreaker, CircuitBreakerRegistry, CircuitBreakerUtils };