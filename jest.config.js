/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  preset: 'react-native',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.(js|ts|tsx)$': 'babel-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  setupFiles: [],
};