module.exports = {
  root: true,
  env: {
    es2020: true,
    node: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: { project: ['./tsconfig.json'] },
  plugins: ['@typescript-eslint'],
  extends: ['airbnb-base', 'plugin:@typescript-eslint/recommended', 'prettier'],
  rules: {
    'no-console': 'off',
    'import/extensions': ['error', 'ignorePackages', { ts: 'always' }],
  },
  settings: {
    'import/resolver': {
      node: { extensions: ['.js', '.ts'] },
    },
  },
}; 