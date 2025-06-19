# Development Guidelines

## Technology Stack

### Core Technologies
- **Runtime**: Bun (not Node.js)
- **Package Manager**: Bun workspace
- **Testing**: Bun test
- **Linting/Formatting**: Biome v2.0.0
- **Schema Validation**: Zod
- **Build Tool**: Bun
- **API Framework**: Hono (for any API/HTTP server needs)

### Architecture Principles
- **NO CLASSES**: Use namespaces and functional programming only
- **Functional Programming**: Pure functions, immutability, composition
- **Namespaces**: Organize code using TypeScript namespaces
- **Type Safety**: Leverage TypeScript and Zod for runtime validation

## Code Style Rules

### 1. Function Declaration
```typescript
// ✅ Good - Pure functions in namespaces with proper null handling
namespace UserService {
  export const createUser = (data: UserData): User => {
    return { 
      ...data, 
      id: generateId(),
      avatar: data.avatar ?? undefined,
      lastLoginAt: undefined
    };
  };
}

// ❌ Bad - Classes
class UserService {
  createUser(data: UserData): User { ... }
}
```

### 2. Namespace Organization
```typescript
// ✅ Good - Namespace structure with proper optional types
namespace Database {
  export namespace User {
    export const findById = (id: string): Promise<User | undefined> => { ... };
    export const create = (data: CreateUserData): Promise<User> => { ... };
    export const updateLastLogin = (id: string, loginTime: Date | undefined): Promise<void> => { ... };
  }
  
  export namespace Post {
    export const findByUserId = (userId: string): Promise<readonly Post[]> => { ... };
    export const findByTag = (tag: string | undefined): Promise<readonly Post[]> => { ... };
  }
}
```

### 3. Schema Validation
```typescript
// ✅ Good - Zod schemas with descriptions for documentation and validation
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string()
    .describe('Unique identifier for the user'),
  name: z.string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name cannot exceed 100 characters')
    .describe('Full name of the user'),
  email: z.string()
    .email('Must be a valid email address')
    .describe('Primary email address for user communication'),
  avatar: z.string()
    .url('Avatar must be a valid URL')
    .optional()
    .describe('Profile picture URL - optional field'),
  bio: z.string()
    .max(500, 'Bio cannot exceed 500 characters')
    .optional()
    .describe('User biography or description - optional field'),
  lastLoginAt: z.date()
    .optional()
    .describe('Timestamp of user\'s last login - undefined if never logged in'),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'auto'])
      .describe('UI theme preference'),
    language: z.string()
      .min(2, 'Language code must be at least 2 characters')
      .describe('Preferred language code (e.g., "en", "es", "fr")'),
    notifications: z.boolean()
      .describe('Whether user wants to receive notifications'),
  }).describe('User preference settings'),
}).describe('Complete user profile information');

type User = z.infer<typeof UserSchema>;

// Complex nested schema with descriptions
const CreatePostSchema = z.object({
  title: z.string()
    .min(1, 'Title is required')
    .max(200, 'Title cannot exceed 200 characters')
    .describe('Post title - main heading displayed to users'),
  content: z.string()
    .min(10, 'Content must be at least 10 characters')
    .max(10000, 'Content cannot exceed 10,000 characters')
    .describe('Main post content in markdown format'),
  tags: z.array(
    z.string()
      .min(1, 'Tag cannot be empty')
      .max(50, 'Tag cannot exceed 50 characters')
      .regex(/^[a-zA-Z0-9-_]+$/, 'Tags can only contain letters, numbers, hyphens, and underscores')
      .describe('Individual tag for categorizing the post')
  )
    .max(10, 'Cannot have more than 10 tags')
    .describe('Array of tags for post categorization and search'),
  publishedAt: z.date()
    .optional()
    .describe('Publication timestamp - undefined for draft posts'),
  authorId: z.string()
    .uuid('Author ID must be a valid UUID')
    .describe('ID of the user who created this post'),
}).describe('Schema for creating a new blog post');

namespace UserValidator {
  export const validate = (data: unknown): User => {
    return UserSchema.parse(data);
  };
  
  export const validatePartial = (data: unknown): Partial<User> => {
    return UserSchema.partial().parse(data);
  };
  
  // Generate documentation from schema
  export const getSchemaDocumentation = (): Record<string, string> => {
    const shape = UserSchema.shape;
    const docs: Record<string, string> = {};
    
    Object.entries(shape).forEach(([key, schema]) => {
      if ('description' in schema && typeof schema.description === 'string') {
        docs[key] = schema.description;
      }
    });
    
    return docs;
  };
}

// API documentation generation from schemas
namespace SchemaUtils {
  export const generateApiDocs = <T extends z.ZodType>(
    schema: T,
    schemaName: string
  ): string => {
    const description = 'description' in schema && typeof schema.description === 'string' 
      ? schema.description 
      : `${schemaName} schema`;
    
    return `## ${schemaName}\n\n${description}\n\n### Fields:\n${
      generateFieldDocs(schema)
    }`;
  };
  
  const generateFieldDocs = (schema: z.ZodType): string => {
    if (schema instanceof z.ZodObject) {
      return Object.entries(schema.shape)
        .map(([key, fieldSchema]) => {
          const desc = 'description' in fieldSchema && typeof fieldSchema.description === 'string'
            ? fieldSchema.description
            : 'No description provided';
          const optional = fieldSchema.isOptional() ? ' (optional)' : ' (required)';
          return `- **${key}**${optional}: ${desc}`;
        })
        .join('\n');
    }
    return 'Schema documentation not available for this type';
  };
}
```

### 4. API Development with Hono
```typescript
// ✅ Good - Hono API with functional approach and descriptive schemas
import { Hono } from 'hono';
import { z } from 'zod';

const CreateUserSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name cannot exceed 100 characters')
    .describe('Full name of the user to be created'),
  email: z.string()
    .email('Must be a valid email address')
    .describe('Primary email address - must be unique in the system'),
  avatar: z.string()
    .url('Avatar must be a valid URL')
    .optional()
    .describe('Optional profile picture URL'),
  bio: z.string()
    .max(500, 'Bio cannot exceed 500 characters')
    .optional()
    .describe('Optional user biography or description'),
}).describe('Schema for creating a new user account');

const UpdateUserSchema = CreateUserSchema.partial()
  .describe('Schema for updating user information - all fields optional');

const UserResponseSchema = z.object({
  success: z.boolean()
    .describe('Indicates if the operation was successful'),
  data: z.object({
    id: z.string()
      .describe('Unique user identifier'),
    name: z.string()
      .describe('User\'s full name'),
    email: z.string()
      .describe('User\'s email address'),
    avatar: z.string()
      .optional()
      .describe('User\'s profile picture URL if set'),
    bio: z.string()
      .optional()
      .describe('User\'s biography if provided'),
    createdAt: z.date()
      .describe('Account creation timestamp'),
    updatedAt: z.date()
      .describe('Last profile update timestamp'),
  }).describe('User profile data'),
}).describe('Successful user operation response');

namespace UserAPI {
  export const createRoutes = () => {
    const app = new Hono();
    
    app.post('/users', async (c) => {
      try {
        const body = await c.req.json();
        const userData = CreateUserSchema.parse(body);
        
        const user = await UserService.createUser(userData);
        return c.json({ success: true, data: user }, 201);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({
            success: false,
            error: 'Validation failed',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
            }))
          }, 400);
        }
        
        return c.json({ success: false, error: 'Internal server error' }, 500);
      }
    });
    
    app.get('/users/:id', async (c) => {
      const id = c.req.param('id');
      const user = await UserService.findById(id);
      
      if (user === undefined) {
        return c.json({ 
          success: false, 
          error: 'User not found',
          details: `No user exists with ID: ${id}`
        }, 404);
      }
      
      return c.json({ success: true, data: user });
    });
    
    app.patch('/users/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const body = await c.req.json();
        const updates = UpdateUserSchema.parse(body);
        
        const result = await UserService.updateUser(id, updates);
        if (result === undefined) {
          return c.json({ 
            success: false, 
            error: 'User not found',
            details: `No user exists with ID: ${id}`
          }, 404);
        }
        
        return c.json({ success: true, data: result });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return c.json({
            success: false,
            error: 'Validation failed',
            details: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message,
            }))
          }, 400);
        }
        
        return c.json({ success: false, error: 'Internal server error' }, 500);
      }
    });
    
    // Generate API documentation endpoint
    app.get('/users/schema', (c) => {
      return c.json({
        createUser: {
          description: CreateUserSchema.description,
          fields: SchemaUtils.generateFieldDocs(CreateUserSchema),
        },
        updateUser: {
          description: UpdateUserSchema.description,
          fields: SchemaUtils.generateFieldDocs(UpdateUserSchema),
        },
        userResponse: {
          description: UserResponseSchema.description,
          fields: SchemaUtils.generateFieldDocs(UserResponseSchema),
        },
      });
    });
    
    return app;
  };
}

// Usage
const app = new Hono();
app.route('/api', UserAPI.createRoutes());

export default app;
```

### 5. Immutability
```typescript
// ✅ Good - Immutable operations with proper optional handling
namespace ArrayUtils {
  export const addItem = <T>(arr: readonly T[], item: T): readonly T[] => {
    return [...arr, item];
  };
  
  export const updateItem = <T>(
    arr: readonly T[], 
    index: number, 
    updater: (item: T) => T
  ): readonly T[] => {
    return arr.map((item, i) => i === index ? updater(item) : item);
  };
  
  export const findItem = <T>(
    arr: readonly T[], 
    predicate: (item: T) => boolean
  ): T | undefined => {
    return arr.find(predicate);
  };
}

namespace ObjectUtils {
  export const updateProperty = <T, K extends keyof T>(
    obj: T,
    key: K,
    value: T[K] | undefined
  ): T => {
    if (value === undefined) {
      const { [key]: _, ...rest } = obj;
      return rest as T;
    }
    return { ...obj, [key]: value };
  };
}

// ❌ Bad - Mutation
const addItem = <T>(arr: T[], item: T): void => {
  arr.push(item); // Mutates original array
};
```

## Development Workflow

### Implementation Process
When implementing any feature, follow this strict workflow:

#### Step 1: Create Breakdown
1. Create or update the relevant `.md` file in the appropriate package
2. Write detailed step-by-step breakdown:
   ```markdown
   # Feature: [Feature Name]
   
   ## Breakdown
   - [ ] Step 1: Define types and schemas
   - [ ] Step 2: Create core functions
   - [ ] Step 3: Add validation layer
   - [ ] Step 4: Write tests
   - [ ] Step 5: Integration
   
   ## Progress
   - [x] Completed: [list completed steps]
   - [ ] Current: [current step]
   - [ ] Next: [next steps]
   
   ## Notes
   - Do NOT include time estimates - focus on clear step definitions
   - Break down complex steps into smaller, actionable items
   - Each step should be independently testable
   ```

#### Step 2: Implement Step-by-Step
1. Work on ONE step at a time
2. Update the breakdown file with progress
3. Run tests: `bun test`
4. Run linting: `bun run biome check`
5. Make commit with descriptive message

#### Step 3: Loop Until Complete
1. Update breakdown with completed step
2. Mark next step as current
3. Commit progress
4. Continue to next step
5. Repeat until all steps are complete

### Planning Guidelines

#### What to Include in Breakdowns
- ✅ Clear, actionable steps
- ✅ Dependencies between steps
- ✅ Acceptance criteria for each step
- ✅ Technical requirements and constraints
- ✅ Testing approach for each step

#### What to Avoid in Breakdowns
- ❌ Time estimates ("this will take 2 hours")
- ❌ Velocity predictions ("we can finish by Friday")
- ❌ Complexity assessments ("this is easy/hard")
- ❌ Resource allocation ("need 3 developers")

#### Why No Time Estimates
Time estimates in development are notoriously inaccurate and create false expectations. Instead:
- Focus on clear step definitions
- Make steps small and measurable
- Track actual progress through completed steps
- Let the work speak for itself through commits and tests

### Commit Message Format
```
feat(package): brief description

- Completed: [step description]
- Next: [next step description]
- Progress: [X/Y steps complete]
```

## Import Guidelines

### File Extensions in Import/Export Statements

**IMPORTANT: Do NOT use file extensions in import/export statements**

```typescript
// ✅ Good - No file extensions
export { ListBuilder, ListChain } from './builder';
import { UserService } from './user-service';
import { validateEmail } from '../validators';

// ❌ Bad - With file extensions
export { ListBuilder, ListChain } from './builder.js';
import { UserService } from './user-service.ts';
import { validateEmail } from '../validators.js';
```

**Rationale:**
- TypeScript and modern bundlers handle module resolution automatically
- File extensions can cause issues with different build targets (ESM vs CommonJS)
- Cleaner, more maintainable import statements
- Consistent with TypeScript best practices

### Use Package-Based Imports Instead of Relative Paths

#### Absolute Package Imports
```typescript
// ✅ Good - Package-based imports
import { Database } from '@real-project-name/core/database';
import { UserService } from '@real-project-name/core/user-service';
import { Button } from '@real-project-name/components/button';
import { Theme } from '@real-project-name/styling/theme';
import { ApiClient } from '@real-project-name/core/api-client';

// ✅ Good - Workspace package imports
import { validateEmail } from '@real-project-name/core/validators';
import { formatDate } from '@real-project-name/core/utils';
import { Modal } from '@real-project-name/components/modal';

// ❌ Bad - Relative path imports
import { Database } from '../../src/database';
import { UserService } from '../../../core/src/user-service';
import { Button } from '../../components/src/button';
import { Theme } from '../../../styling/src/theme';
```

#### Package Configuration
```json
// package.json - Configure package exports
{
  "name": "@real-project-name/core",
  "exports": {
    "./database": "./src/database.ts",
    "./user-service": "./src/user-service.ts",
    "./validators": "./src/validators.ts",
    "./utils": "./src/utils.ts",
    "./api-client": "./src/api-client.ts"
  }
}
```

#### TypeScript Path Mapping
```json
// tsconfig.json - Configure path mapping
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@real-project-name/core/*": ["packages/core/src/*"],
      "@real-project-name/components/*": ["packages/components/src/*"],
      "@real-project-name/styling/*": ["packages/styling/src/*"]
    }
  }
}
```

#### Bun Workspace Configuration
```json
// package.json (root) - Workspace setup
{
  "workspaces": [
    "packages/*"
  ]
}

// packages/core/package.json
{
  "name": "@real-project-name/core",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./database": "./src/database.ts",
    "./user-service": "./src/user-service.ts"
  }
}
```

#### Benefits of Package-Based Imports

**Maintainability:**
- No broken imports when moving files
- Clear dependency relationships
- Easier refactoring across packages

**Readability:**
- Immediately shows which package code comes from
- Self-documenting dependencies
- Consistent import style across codebase

**Tooling:**
- Better IDE support and autocomplete
- Easier dependency analysis
- Cleaner import organization

#### Import Organization
```typescript
// ✅ Good - Organized imports by package
// External dependencies first
import { z } from 'zod';
import { Hono } from 'hono';

// Internal packages (alphabetical)
import { ApiClient } from '@real-project-name/core/api-client';
import { Database } from '@real-project-name/core/database';
import { UserService } from '@real-project-name/core/user-service';
import { validateEmail } from '@real-project-name/core/validators';

// Components
import { Button } from '@real-project-name/components/button';
import { Modal } from '@real-project-name/components/modal';

// Styling
import { Theme } from '@real-project-name/styling/theme';

// Types (if separate)
import type { User, UserRole } from '@real-project-name/core/types';
```

#### Exception: Same-Package Imports
```typescript
// ✅ Acceptable - Relative imports within the same package
// In packages/core/src/user-service.ts
import { validateUser } from './validators';  // Same package
import { Database } from './database';        // Same package

// But prefer absolute even within package when possible
import { validateUser } from '@real-project-name/core/validators';
import { Database } from '@real-project-name/core/database';
```

#### Cross-Package Dependencies
```typescript
// ✅ Good - Clear cross-package dependencies
// In packages/components/src/user-profile.ts
import { UserService } from '@real-project-name/core/user-service';
import { Theme } from '@real-project-name/styling/theme';

namespace UserProfile {
  export const render = async (userId: string): Promise<string> => {
    const user = await UserService.findById(userId);
    if (user === undefined) {
      return 'User not found';
    }
    
    return `
      ${Theme.getUserProfileClass()}
        ${user.name}
        ${user.email}
    `;
  };
}
```

#### Package Naming Convention
- Use scoped packages: `@real-project-name/package-name`
- Keep package names short and descriptive
- Use kebab-case for package names
- Match directory structure to package names

```
packages/
├── core/           → @real-project-name/core
├── components/     → @real-project-name/components  
├── styling/        → @real-project-name/styling
└── utils/          → @real-project-name/utils
## File Organization

### Package Structure
```
packages/
├── core/
│   ├── src/
│   │   ├── types/
│   │   ├── utils/
│   │   └── index.ts
│   ├── tests/
│   ├── OVERVIEW.md
│   └── REQUIREMENTS.md
├── components/
│   ├── src/
│   └── tests/
└── styling/
    ├── src/
    └── tests/
```

### File Naming
- Use kebab-case for files: `user-service.ts`
- Use PascalCase for namespaces: `UserService`
- Use camelCase for functions: `createUser`
- Use UPPER_CASE for constants: `MAX_RETRY_COUNT`

## Testing Rules

### Test Types and Organization

#### 1. Unit Tests (`.test.ts`)
**Location**: Same folder as source file
```
src/
├── user-service.ts
├── user-service.test.ts              # Unit tests
└── user-service.performance.test.ts  # Performance tests
```

**Purpose**: Test individual functions in isolation
```typescript
// user-service.test.ts
import { describe, test, expect } from 'bun:test';
import { UserService } from './user-service';

describe('UserService', () => {
  describe('createUser', () => {
    test('should create user with valid data', () => {
      const userData = { name: 'John', email: 'john@example.com' };
      const result = UserService.createUser(userData);
      
      expect(result).toMatchObject(userData);
      expect(result.id).toBeDefined();
    });
    
    test('should throw on invalid data', () => {
      expect(() => UserService.createUser({})).toThrow();
    });
    
    test('should validate email format', () => {
      const invalidEmail = { name: 'John', email: 'invalid-email' };
      expect(() => UserService.createUser(invalidEmail)).toThrow('Invalid email');
    });
  });
});
```

#### 2. Performance Tests (`.performance.test.ts`)
**Location**: Same folder as source file
**Purpose**: Test function performance and memory usage
```typescript
// user-service.performance.test.ts
import { describe, test, expect } from 'bun:test';
import { UserService } from './user-service';

describe('UserService Performance', () => {
  test('createUser should complete within 1ms', () => {
    const userData = { name: 'John', email: 'john@example.com' };
    
    const start = performance.now();
    UserService.createUser(userData);
    const end = performance.now();
    
    expect(end - start).toBeLessThan(1);
  });
  
  test('should handle 1000 users without memory leak', () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    for (let i = 0; i < 1000; i++) {
      UserService.createUser({ 
        name: `User${i}`, 
        email: `user${i}@example.com` 
      });
    }
    
    // Force garbage collection if available
    if (global.gc) global.gc();
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    
    // Memory increase should be reasonable (less than 10MB)
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
  });
});
```

#### 3. Integration Tests (`.integration.test.ts`)
**Location**: Separate `tests/integration/` folder
```
tests/
├── integration/
│   ├── user-workflow.integration.test.ts
│   ├── database-connection.integration.test.ts
│   └── api-endpoints.integration.test.ts
└── e2e/
    ├── user-journey.e2e.test.ts
    └── full-app.e2e.test.ts
```

**Purpose**: Test multiple components working together
```typescript
// tests/integration/user-workflow.integration.test.ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from '../../src/database';
import { UserService } from '../../src/user-service';
import { EmailService } from '../../src/email-service';

describe('User Workflow Integration', () => {
  beforeEach(async () => {
    await Database.connect();
    await Database.clear();
  });
  
  afterEach(async () => {
    await Database.disconnect();
  });
  
  test('should create user and send welcome email', async () => {
    const userData = { name: 'John', email: 'john@example.com' };
    
    // Create user
    const user = await UserService.createUser(userData);
    expect(user.id).toBeDefined();
    
    // Verify user in database
    const savedUser = await Database.User.findById(user.id);
    expect(savedUser).toEqual(user);
    
    // Verify welcome email sent
    const emails = await EmailService.getSentEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0].to).toBe(userData.email);
    expect(emails[0].subject).toBe('Welcome!');
  });
});
```

#### 4. End-to-End Tests (`.e2e.test.ts`)
**Location**: Separate `tests/e2e/` folder
**Purpose**: Test complete user journeys through the application
```typescript
// tests/e2e/user-journey.e2e.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startTestServer, stopTestServer } from '../helpers/test-server';
import { TestClient } from '../helpers/test-client';

describe('User Journey E2E', () => {
  let client: TestClient;
  
  beforeAll(async () => {
    await startTestServer();
    client = new TestClient('http://localhost:3001');
  });
  
  afterAll(async () => {
    await stopTestServer();
  });
  
  test('complete user registration and login flow', async () => {
    // Register new user
    const registerResponse = await client.post('/api/register', {
      name: 'John Doe',
      email: 'john@example.com',
      password: 'securePassword123'
    });
    
    expect(registerResponse.status).toBe(201);
    expect(registerResponse.data.user.email).toBe('john@example.com');
    
    // Login with new user
    const loginResponse = await client.post('/api/login', {
      email: 'john@example.com',
      password: 'securePassword123'
    });
    
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.data.token).toBeDefined();
    
    // Access protected resource
    const profileResponse = await client.get('/api/profile', {
      headers: { Authorization: `Bearer ${loginResponse.data.token}` }
    });
    
    expect(profileResponse.status).toBe(200);
    expect(profileResponse.data.name).toBe('John Doe');
  });
});
```

### Test File Structure Requirements

#### Package Structure with Tests
```
packages/
├── core/
│   ├── src/
│   │   ├── user-service.ts
│   │   ├── user-service.test.ts           # Unit tests
│   │   ├── user-service.performance.test.ts   # Performance tests
│   │   ├── database.ts
│   │   ├── database.test.ts
│   │   └── database.performance.test.ts
│   └── tests/
│       ├── integration/
│       │   ├── user-workflow.integration.test.ts
│       │   └── database-operations.integration.test.ts
│       └── e2e/
│           ├── api-endpoints.e2e.test.ts
│           └── full-workflow.e2e.test.ts
├── components/
│   ├── src/
│   │   ├── button.ts
│   │   ├── button.test.ts
│   │   ├── button.performance.test.ts
│   │   ├── modal.ts
│   │   ├── modal.test.ts
│   │   └── modal.performance.test.ts
│   └── tests/
│       ├── integration/
│       │   └── component-interactions.integration.test.ts
│       └── e2e/
│           └── ui-workflows.e2e.test.ts
└── styling/
    ├── src/
    │   ├── theme.ts
    │   ├── theme.test.ts
    │   └── theme.perf.test.ts
    └── tests/
        └── integration/
            └── theme-application.integration.test.ts
```

### Test Coverage Requirements

#### Minimum Coverage by Test Type
- **Unit Tests**: 90% line coverage for all functions
- **Performance Tests**: All critical path functions
- **Integration Tests**: All major workflows
- **E2E Tests**: All user-facing features

#### Coverage Commands
```bash
# Run with coverage
bun test --coverage

# Coverage by test type
bun test --coverage "**/*.test.ts"                 # Unit tests only
bun test --coverage "**/*.performance.test.ts"     # Performance tests only
bun test --coverage "**/integration/*.ts"          # Integration tests only
bun test --coverage "**/e2e/*.ts"                  # E2E tests only
```

### Test Commands
```bash
# Run all tests
bun test

# Run by test type
bun test "**/*.test.ts"                      # Unit tests only
bun test "**/*.performance.test.ts"          # Performance tests only
bun test "**/integration/*.test.ts"          # Integration tests only
bun test "**/e2e/*.test.ts"                  # E2E tests only

# Run specific test file
bun test user-service.test.ts

# Watch mode
bun test --watch

# Run tests with timeout
bun test --timeout 30000                  # 30 second timeout for E2E tests
```

### Performance Test Guidelines

#### Benchmarking Standards
- Functions should complete within expected time limits
- Memory usage should not exceed reasonable bounds
- No memory leaks in repeated operations
- Concurrent operations should scale appropriately

#### Performance Assertions
```typescript
// Time-based assertions
expect(executionTime).toBeLessThan(expectedMaxTime);

// Memory-based assertions
expect(memoryIncrease).toBeLessThan(maxMemoryIncrease);

// Throughput assertions
expect(operationsPerSecond).toBeGreaterThan(minThroughput);
```

## Quality Assurance

### Before Every Commit
1. `bun test` - All tests must pass
2. `bun run biome check` - No linting errors
3. `bun run biome format` - Code is formatted
4. Update relevant `.md` files with progress

### Code Review Checklist
- [ ] No classes used
- [ ] Functions are pure (no side effects)
- [ ] Proper namespace organization
- [ ] Zod schemas for validation
- [ ] Immutable data operations
- [ ] Tests cover all scenarios
- [ ] Documentation updated
- [ ] Biome checks pass

## Error Handling

### Functional Error Handling
```typescript
// ✅ Good - Result type pattern with proper undefined handling
type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

namespace UserService {
  export const findUser = async (id: string): Promise<Result<User, string>> => {
    try {
      const user = await Database.User.findById(id);
      return user !== undefined
        ? { success: true, data: user }
        : { success: false, error: 'User not found' };
    } catch (error) {
      return { success: false, error: 'Database error' };
    }
  };
  
  export const updateUser = async (
    id: string, 
    updates: Partial<User>
  ): Promise<Result<User, string>> => {
    const existingUser = await Database.User.findById(id);
    if (existingUser === undefined) {
      return { success: false, error: 'User not found' };
    }
    
    try {
      const updatedUser = await Database.User.update(id, {
        ...existingUser,
        ...updates,
        updatedAt: new Date(),
      });
      
      return { success: true, data: updatedUser };
    } catch (error) {
      return { success: false, error: 'Failed to update user' };
    }
  };
}

// Usage with proper error handling
namespace UserController {
  export const getUserProfile = async (id: string): Promise<UserProfile | undefined> => {
    const result = await UserService.findUser(id);
    if (!result.success) {
      console.error('Failed to get user:', result.error);
      return undefined;
    }
    
    return result.data;
  };
}
```

## Performance Guidelines

### Optimization Rules
1. Use `readonly` for immutable data
2. Prefer `const` assertions for literal types
3. Use lazy evaluation where appropriate
4. Minimize object creation in hot paths
5. Use Bun's built-in optimizations

### Memory Management
- Avoid closures that capture large objects
- Use weak references for caches
- Clean up event listeners and timers
- Profile with Bun's built-in profiler

## Documentation Requirements

### Every Function Must Have
```typescript
namespace MathUtils {
  /**
   * Calculates the factorial of a number
   * @param n - Non-negative integer
   * @returns Factorial of n, or undefined if n is negative
   */
  export const factorial = (n: number): number | undefined => {
    if (n < 0) return undefined;
    return n <= 1 ? 1 : n * factorial(n - 1)!; // Non-null assertion safe here
  };
  
  /**
   * Finds the maximum value in an array
   * @param numbers - Array of numbers to search
   * @returns Maximum number, or undefined if array is empty
   */
  export const findMax = (numbers: readonly number[]): number | undefined => {
    if (numbers.length === 0) return undefined;
    return Math.max(...numbers);
  };
  
  /**
   * Safely divides two numbers
   * @param dividend - Number to be divided
   * @param divisor - Number to divide by
   * @returns Result of division, or undefined if divisor is zero
   */
  export const safeDivide = (dividend: number, divisor: number): number | undefined => {
    return divisor === 0 ? undefined : dividend / divisor;
  };
}
```

### Package Documentation
- `OVERVIEW.md` - High-level package purpose
- `REQUIREMENTS.md` - Detailed requirements
- Implementation progress in breakdown files

## Schema Documentation Requirements

### Zod Schema Descriptions
Every Zod schema and field MUST include descriptive `.describe()` calls:

#### Schema-Level Descriptions
```typescript
// ✅ Good - Schema with description
const UserSchema = z.object({
  // ... fields
}).describe('Complete user profile information including personal data and preferences');

// ❌ Bad - No schema description
const UserSchema = z.object({
  // ... fields
});
```

#### Field-Level Descriptions
```typescript
// ✅ Good - Every field described
const ProductSchema = z.object({
  id: z.string()
    .uuid('Product ID must be a valid UUID')
    .describe('Unique identifier for the product'),
  name: z.string()
    .min(1, 'Product name is required')
    .max(200, 'Product name cannot exceed 200 characters')
    .describe('Display name of the product shown to customers'),
  price: z.number()
    .positive('Price must be greater than zero')
    .max(999999.99, 'Price cannot exceed $999,999.99')
    .describe('Product price in USD - supports up to 2 decimal places'),
  category: z.enum(['electronics', 'clothing', 'books', 'home'])
    .describe('Product category for organization and filtering'),
  inStock: z.boolean()
    .describe('Whether the product is currently available for purchase'),
  tags: z.array(
    z.string()
      .min(1, 'Tag cannot be empty')
      .describe('Individual product tag for search and categorization')
  )
    .max(20, 'Cannot have more than 20 tags')
    .describe('Array of searchable tags associated with the product'),
}).describe('Product information schema for e-commerce catalog');

// ❌ Bad - Missing descriptions
const ProductSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  price: z.number().positive(),
  // ... other fields without descriptions
});
```

#### Benefits of Schema Descriptions
1. **Auto-generated API documentation**
2. **Better error messages for validation failures**
3. **IDE tooltips and IntelliSense support**
4. **Self-documenting code**
5. **Easier onboarding for new developers**

#### Description Writing Guidelines
- **Be specific**: Explain what the field contains, not just its type
- **Include constraints**: Mention validation rules and limits
- **Explain purpose**: Why does this field exist?
- **Use examples**: When helpful, include format examples
- **Keep concise**: One clear sentence is usually enough

```typescript
// ✅ Good descriptions
email: z.string()
  .email('Must be a valid email address')
  .describe('Primary email address used for account notifications and login'),

phoneNumber: z.string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Must be a valid international phone number')
  .optional()
  .describe('Optional phone number in international format (e.g., +1234567890)'),

createdAt: z.date()
  .describe('Timestamp when the record was first created in the database'),

status: z.enum(['draft', 'published', 'archived'])
  .describe('Publication status - draft (not visible), published (public), archived (hidden but preserved)'),
```

## Type Safety Rules

### Type System Guidelines

#### Avoid `any` Type - Use Real-World Types
```typescript
// ❌ Bad - Using any
const processData = (data: any): any => {
  return data.someProperty;
};

// ✅ Good - Define real-world types
interface UserData {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  preferences: UserPreferences;
}

interface UserPreferences {
  theme: 'light' | 'dark';
  notifications: boolean;
  language: string;
}

const processUserData = (data: UserData): string => {
  return data.name;
};
```

#### When You Must Handle Unknown Data
```typescript
// ✅ Good - Use unknown and type guards with proper undefined handling
const parseApiResponse = (response: unknown): UserData | undefined => {
  if (!isObject(response)) {
    return undefined; // Return undefined instead of throwing
  }
  
  try {
    return UserDataSchema.parse(response); // Zod validation
  } catch {
    return undefined;
  }
};

// Type guard helper
const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};
```

#### Generic Types for Flexibility
```typescript
// ✅ Good - Generic types instead of any
namespace ApiClient {
  export const get = <T>(url: string, schema: z.ZodSchema<T>): Promise<T> => {
    return fetch(url)
      .then(res => res.json())
      .then(data => schema.parse(data));
  };
}

// Usage with real types
const user = await ApiClient.get('/api/user/123', UserSchema);
// user is typed as User, not any
```

#### Union Types for Better Type Safety
```typescript
// ✅ Good - Union types instead of generic strings
type UserRole = 'admin' | 'moderator' | 'user' | 'guest';
type Theme = 'light' | 'dark' | 'auto';
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

// ❌ Bad - Generic string types
interface BadUser {
  role: string;        // Could be anything!
  theme: string;       // No IDE autocomplete
  status: string;      // Prone to typos
}

// ✅ Good - Specific union types
interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;      // IDE knows exact values
  theme: Theme;        // Autocomplete available
  status: 'active' | 'inactive' | 'suspended';  // Clear options
}

// ✅ Good - Union types in Zod schemas
const UserSchema = z.object({
  id: z.string()
    .uuid('User ID must be a valid UUID')
    .describe('Unique identifier for the user'),
  name: z.string()
    .min(1, 'Name is required')
    .describe('Full name of the user'),
  role: z.enum(['admin', 'moderator', 'user', 'guest'])
    .describe('User role determining access permissions'),
  theme: z.enum(['light', 'dark', 'auto'])
    .describe('UI theme preference'),
  status: z.enum(['active', 'inactive', 'suspended'])
    .describe('Account status - active (normal use), inactive (temporarily disabled), suspended (banned)'),
}).describe('User account information with role-based access control');

// ✅ Good - Complex union types for different states
type ApiResponse<T> = 
  | { status: 'loading'; data: undefined }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string; data: undefined };

type FormField = 
  | { type: 'text'; value: string; placeholder: string | undefined }
  | { type: 'number'; value: number; min: number | undefined; max: number | undefined }
  | { type: 'select'; value: string; options: readonly string[]; defaultOption: string | undefined }
  | { type: 'checkbox'; checked: boolean; label: string }
  | { type: 'radio'; selected: string; options: readonly { value: string; label: string }[] };

// ✅ Good - Event types with discriminated unions
type UserEvent = 
  | { type: 'user_created'; userId: string; timestamp: Date }
  | { type: 'user_updated'; userId: string; changes: Partial<User>; timestamp: Date }
  | { type: 'user_deleted'; userId: string; timestamp: Date }
  | { type: 'user_login'; userId: string; ipAddress: string; timestamp: Date };

// Usage with proper type narrowing
namespace UserEventHandler {
  export const handleEvent = (event: UserEvent): void => {
    switch (event.type) {
      case 'user_created':
        console.log(`New user created: ${event.userId}`);
        break;
      case 'user_updated':
        console.log(`User ${event.userId} updated:`, event.changes);
        break;
      case 'user_deleted':
        console.log(`User ${event.userId} deleted`);
        break;
      case 'user_login':
        console.log(`User ${event.userId} logged in from ${event.ipAddress}`);
        break;
      // TypeScript ensures all cases are handled
    }
  };
}

// ✅ Good - Configuration with union types
type DatabaseConfig = {
  type: 'postgresql';
  host: string;
  port: number;
  database: string;
  ssl: boolean;
} | {
  type: 'sqlite';
  filename: string;
  memory: boolean;
} | {
  type: 'mongodb';
  connectionString: string;
  database: string;
};

// ✅ Good - HTTP status codes as union types
type HttpStatusCode = 
  | 200 | 201 | 204  // Success
  | 400 | 401 | 403 | 404 | 409  // Client errors
  | 500 | 502 | 503;  // Server errors

namespace ApiUtils {
  export const isSuccessStatus = (status: HttpStatusCode): boolean => {
    return status >= 200 && status < 300;
  };
  
  export const isClientError = (status: HttpStatusCode): boolean => {
    return status >= 400 && status < 500;
  };
}
```

#### Why Union Types Over Strings

**Benefits of Union Types:**
- **IDE Autocomplete**: IntelliSense shows exact valid values
- **Compile-time Safety**: TypeScript catches typos and invalid values
- **Self-documenting**: Code clearly shows what values are expected
- **Refactoring Safety**: Renaming values updates all usages
- **Exhaustiveness Checking**: Switch statements ensure all cases handled

**When to Use Union Types:**
- ✅ **Enums/Constants**: Status, role, theme, etc.
- ✅ **API Responses**: Success/error states
- ✅ **Configuration Options**: Database types, log levels
- ✅ **Event Types**: User actions, system events
- ✅ **Form Field Types**: Input types, validation states

**When Strings Are OK:**
- ✅ **User Input**: Names, descriptions, comments
- ✅ **Dynamic Content**: Generated IDs, external data
- ✅ **Free-form Text**: Search queries, messages
- ✅ **External APIs**: When you can't control the values

#### Performance Considerations
```typescript
// ✅ Good - Detailed types don't hurt performance at runtime
interface DetailedUserProfile {
  id: string;
  personalInfo: {
    firstName: string;
    lastName: string;
    dateOfBirth: Date | undefined;
    address: {
      street: string;
      city: string;
      country: string;
      postalCode: string;
    } | undefined;
  };
  preferences: {
    theme: 'light' | 'dark' | 'auto';
    language: string;
    timezone: string | undefined;
    notifications: {
      email: boolean;
      push: boolean;
      sms: boolean;
    };
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    lastLoginAt: Date | undefined;
    isActive: boolean;
    tags: readonly string[];
  };
}

// Types are erased at runtime - no performance impact
namespace UserProfileUtils {
  export const getDisplayName = (user: DetailedUserProfile): string => {
    return `${user.personalInfo.firstName} ${user.personalInfo.lastName}`;
  };
  
  export const getFormattedAddress = (user: DetailedUserProfile): string | undefined => {
    if (user.personalInfo.address === undefined) {
      return undefined;
    }
    
    const { street, city, country, postalCode } = user.personalInfo.address;
    return `${street}, ${city}, ${country} ${postalCode}`;
  };
  
  export const getLastLoginDisplay = (user: DetailedUserProfile): string => {
    return user.metadata.lastLoginAt !== undefined 
      ? user.metadata.lastLoginAt.toLocaleDateString()
      : 'Never logged in';
  };
}
```

#### Type Assertion as Last Resort
```typescript
// ⚠️ Use sparingly - Type assertion when you know better than TypeScript
const element = document.getElementById('user-form') as Element;

// ✅ Better - Type guard with assertion
const getFormElement = (id: string): Element => {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element ${id} not found`);
  }
  return element;
};
```

#### Null vs Undefined - Prefer Undefined
```typescript
// ✅ Good - Use undefined for optional values
interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string | undefined;        // Optional, might not exist
  lastLoginAt: Date | undefined;     // Optional, might not be set yet
  bio: string | undefined;           // Optional field
}

// ✅ Good - Function parameters with undefined
namespace UserService {
  export const updateProfile = (
    id: string,
    updates: {
      name?: string;                 // Optional parameter (string | undefined)
      bio?: string | undefined;      // Explicitly optional
      avatar?: string | undefined;
    }
  ): UserProfile => {
    // Handle undefined values explicitly
    const existingUser = findUserById(id);
    if (!existingUser) {
      throw new Error('User not found');
    }
    
    return {
      ...existingUser,
      name: updates.name ?? existingUser.name,
      bio: updates.bio ?? existingUser.bio,
      avatar: updates.avatar ?? existingUser.avatar,
    };
  };
}

// ❌ Bad - Using null unnecessarily
interface BadUserProfile {
  avatar: string | null;            // Avoid null unless specifically required
  lastLoginAt: Date | null;         // Use undefined instead
}

// ✅ Good - Use null only when required by external APIs
interface DatabaseUser {
  id: string;
  name: string;
  deleted_at: Date | null;          // Database column that uses NULL
}

// ✅ Good - Convert null to undefined at boundaries
namespace DatabaseAdapter {
  export const getUser = (id: string): UserProfile | undefined => {
    const dbUser = database.query('SELECT * FROM users WHERE id = ?', id);
    if (!dbUser) return undefined;
    
    return {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      // Convert null to undefined
      avatar: dbUser.avatar ?? undefined,
      lastLoginAt: dbUser.last_login_at ?? undefined,
      bio: dbUser.bio ?? undefined,
    };
  };
}
```

#### TypeScript Configuration
```json
// tsconfig.json - Enable strict null checks
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "exactOptionalPropertyTypes": true
  }
}
```

#### Handling Optional Values
```typescript
// ✅ Good - Explicit undefined checks
namespace UserUtils {
  export const getDisplayName = (user: UserProfile): string => {
    // Explicit check for undefined
    if (user.name !== undefined) {
      return user.name;
    }
    return 'Anonymous User';
  };
  
  export const formatLastLogin = (lastLogin: Date | undefined): string => {
    if (lastLogin === undefined) {
      return 'Never logged in';
    }
    return lastLogin.toLocaleDateString();
  };
  
  // Using nullish coalescing
  export const getUserBio = (user: UserProfile): string => {
    return user.bio ?? 'No bio available';
  };
}
```

## Forbidden Patterns

### Never Use
- Classes or inheritance
- `var` declarations
- Mutating operations on shared state
- `any` type (use `unknown`, unions, or real types instead)
- Generic `string` types when specific values are known (use union types)
- Node.js APIs (use Bun equivalents)
- `npm` or `yarn` (use `bun` only)
- **Non-null assertion operator (`!`)** - Use explicit undefined checks instead

### Avoid
- Deep nesting (max 3 levels)
- Functions longer than 20 lines
- Files longer than 200 lines
- Circular dependencies
- Global state
- Generic `string` types when union types would be more precise
- Relative imports (use package-based imports instead)

## Development Commands

### Essential Commands
```bash
# Install dependencies
bun install

# Run tests
bun test

# Lint and format
bun run biome check
bun run biome format --write

# Build
bun run build

# Development server
bun run dev
```

## Biome v2.0.0 Configuration

### Key Changes from v1 to v2
- **Import Organization**: Now handled via `assist/source/organizeImports` rule instead of separate `organizeImports` config
- **File Patterns**: `include`/`ignore` renamed to `includes` in `files` section
- **Schema Updates**: Updated to use v2.0.0 schema with improved rule organization

### Biome vs TypeScript Roles
- **Biome v2.0.0**: Handles linting, formatting, and import organization
- **TypeScript**: Handles type checking via `bunx tsc --noEmit`
- **Rationale**: Biome focuses on code style and quality, while TypeScript provides comprehensive type analysis

### Rule Configuration Policy
**IMPORTANT**: Marking existing rules as "off" in biome.json is prohibited. This ensures consistent code quality and prevents degradation of standards. However, you can:
- ✅ Add new rules to improve code quality
- ✅ Configure new rules with appropriate severity levels
- ❌ Disable existing rules that are currently enabled

### Current Configuration
```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "off"
      },
      "suspicious": {
        "noExplicitAny": "error",
        "noControlCharactersInRegex": "off"
      },
      "complexity": {
        "noForEach": "error"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "es5",
      "semicolons": "always"
    }
  },
  "files": {
    "include": ["packages/**/*.ts", "packages/**/*.js"]
  }
}
```

### Migration Notes
- Import organization is now automatic via the `assist/source/organizeImports` rule
- File filtering uses `includes` instead of `include`
- All existing formatting and linting rules remain compatible
- Performance improvements in v2 for large codebases
- Type checking remains with TypeScript for comprehensive type analysis

## Function Chaining Pattern

### Functional Composition with Function Chaining

Since we avoid classes but want fluent, readable APIs, use functional composition with function chaining patterns:

```typescript
// ❌ Bad - Class-based fluent API
const style = new Style()
  .bold(true)
  .foreground('#FAFAFA')
  .background('#7D56F4')
  .paddingTop(2)
  .paddingLeft(4)
  .width(22);
```

```typescript
// ✅ Good - Function chaining pattern
const style = StyleBuilder.create()
  .bold(true)
  .foreground('#FAFAFA')
  .background('#7D56F4')
  .paddingTop(2)
  .paddingLeft(4)
  .width(22)
  .build();
```

#### Implementation Pattern

```typescript
// Define the style type
interface StyleConfig {
  readonly bold: boolean;
  readonly foreground: string | undefined;
  readonly background: string | undefined;
  readonly paddingTop: number;
  readonly paddingLeft: number;
  readonly width: number | undefined;
}

// Namespace with functional API
namespace Style {
  // Create initial empty style
  export const create = (): StyleConfig => ({
    bold: false,
    foreground: undefined,
    background: undefined,
    paddingTop: 0,
    paddingLeft: 0,
    width: undefined,
  });
  
  // Each function takes a style and returns a new style
  export const bold = (value: boolean) => (style: StyleConfig): StyleConfig => ({
    ...style,
    bold: value,
  });
  
  export const foreground = (color: string) => (style: StyleConfig): StyleConfig => ({
    ...style,
    foreground: color,
  });
  
  export const background = (color: string) => (style: StyleConfig): StyleConfig => ({
    ...style,
    background: color,
  });
  
  export const paddingTop = (value: number) => (style: StyleConfig): StyleConfig => ({
    ...style,
    paddingTop: value,
  });
  
  export const paddingLeft = (value: number) => (style: StyleConfig): StyleConfig => ({
    ...style,
    paddingLeft: value,
  });
  
  export const width = (value: number) => (style: StyleConfig): StyleConfig => ({
    ...style,
    width: value,
  });
  
  // Render the final style
  export const render = (style: StyleConfig): string => {
    const parts: string[] = [];
    
    if (style.bold) parts.push('font-weight: bold');
    if (style.foreground) parts.push(`color: ${style.foreground}`);
    if (style.background) parts.push(`background: ${style.background}`);
    if (style.paddingTop > 0) parts.push(`padding-top: ${style.paddingTop}px`);
    if (style.paddingLeft > 0) parts.push(`padding-left: ${style.paddingLeft}px`);
    if (style.width !== undefined) parts.push(`width: ${style.width}px`);
    
    return parts.join('; ');
  };
}
```

#### Function Chaining Builder Pattern

```typescript
// ✅ Function chaining builder pattern
namespace StyleBuilder {
  export const create = () => new StyleChain(Style.create());
}

class StyleChain {
  constructor(private readonly config: StyleConfig) {}
  
  bold(value: boolean): StyleChain {
    return new StyleChain(Style.bold(value)(this.config));
  }
  
  foreground(color: string): StyleChain {
    return new StyleChain(Style.foreground(color)(this.config));
  }
  
  background(color: string): StyleChain {
    return new StyleChain(Style.background(color)(this.config));
  }
  
  paddingTop(value: number): StyleChain {
    return new StyleChain(Style.paddingTop(value)(this.config));
  }
  
  paddingLeft(value: number): StyleChain {
    return new StyleChain(Style.paddingLeft(value)(this.config));
  }
  
  width(value: number): StyleChain {
    return new StyleChain(Style.width(value)(this.config));
  }
  
  build(): StyleConfig {
    return this.config;
  }
  
  render(): string {
    return Style.render(this.config);
  }
}

// Usage
const style = StyleBuilder.create()
  .bold(true)
  .foreground('#FAFAFA')
  .background('#7D56F4')
  .paddingTop(2)
  .paddingLeft(4)
  .width(22)
  .build();
```

#### Benefits of This Pattern

1. **Immutable**: Each operation returns a new style object
2. **Functional**: Core logic uses pure functions, builder provides fluent API
3. **Composable**: Functions can be reused and combined
4. **Type-safe**: Full TypeScript support with proper types
5. **Readable**: Method chaining syntax is clear and fluent

## Remember: The Loop
1. **Break down** the task in `.md` file
2. **Implement** one step at a time
3. **Test** and **lint** after each step
4. **Update** progress in breakdown
5. **Commit** with descriptive message
6. **Repeat** until complete

This workflow ensures quality, traceability, and maintainability of the codebase.