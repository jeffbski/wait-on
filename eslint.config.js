// module.exports = {
//   env: {
//     mocha: true
//   },
//   plugins: ['chai-friendly'],
//   extends: ['standard', 'prettier'],
//   root: true,
//   rules: {
//     'no-use-before-define': 'off',
//     'no-unused-vars': [
//       'error',
//       {
//         varsIgnorePattern: 'should|expect'
//       }
//     ],
//     // disable the original no-unused-expressions use chai-friendly
//     'no-unused-expressions': 'off',
//     'chai-friendly/no-unused-expressions': 'error'
//   }
// };

import globals from "globals";
import chaiFriendly from "eslint-plugin-chai-friendly";
// import standard from 'eslint-config-standard';
// import prettierRecommended from 'eslint-plugin-prettier/recommended';


export default [
    // standard,
    // prettierRecommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: {
                ...globals.mocha
            },
        },
        files: ["bin/wait-on", "**/*.js"],
        plugins: {
            "chai-friendly": chaiFriendly
        },
        rules: {
          'no-use-before-define': 'off',
          'no-unused-vars': [
            'error',
            {
              varsIgnorePattern: 'should|expect'
            }
          ],
          // disable the original no-unused-expressions use chai-friendly
          'no-unused-expressions': 'off',
          'chai-friendly/no-unused-expressions': 'error'
        }
    }
];
