import { defineConfig } from 'vitest/config';

// Keep the runner off the compiled output: dist/ carries .test.js copies that
// would otherwise run a second time and collide on the shared database.
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
    // These are integration tests against one shared Postgres and they read
    // and mutate process.env. Run the files serially so they never race each
    // other on the database or on global state.
    fileParallelism: false,
  },
});
