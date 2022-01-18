module.exports = {
  env: {
    jest: true,
  },
  extends: ['standard', 'prettier', 'prettier/standard'],
  root: true,
  rules: {
    'no-use-before-define': 'off',
    'no-unused-vars': [
      'error',
      {
        varsIgnorePattern: 'should|expect',
      },
    ],
  },
};
