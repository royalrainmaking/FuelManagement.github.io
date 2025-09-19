module.exports = {
  // Test environment for browser-like behavior
  testEnvironment: 'jsdom',
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/tests/**/*.spec.js'
  ],
  
  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Coverage configuration
  collectCoverageFrom: [
    'common.js',
    'inventory.js',
    'dashboard.js',
    'app.js',
    '!config.js',
    '!Code.gs'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Mock modules that aren't available in test environment
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1'
  },
  
  // Global setup
  globals: {
    'window': {},
    'document': {},
    'localStorage': {}
  },
  
  // Verbose output
  verbose: true,
  
  // Test timeout (30 seconds for async operations)
  testTimeout: 30000
};