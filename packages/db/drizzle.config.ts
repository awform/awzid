import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` n'a pas besoin de base : il compare le schéma TypeScript aux migrations existantes.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  strict: true,
  verbose: true,
});
