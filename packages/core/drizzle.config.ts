import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/database/schema.ts',
  out: './src/database/migrations',
  driver: 'bun:sqlite',
  dbCredentials: {
    url: './workflow.db',
  },
  verbose: true,
  strict: true,
});