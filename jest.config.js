/** Jest config. Pure-logic unit tests live in __tests__/ and exercise the
 *  extracted lib/ modules (no RN runtime needed), so a plain node env with the
 *  jest-expo babel transform is enough. */
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/web/', '/ios/', '/android/'],
};
