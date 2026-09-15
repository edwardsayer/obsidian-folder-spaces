// 代理 @typescript-eslint/parser，讓 ESLint 使用 TS 5.9 AST 解析器相容 TS 7 專案。
const legacyTs = require('typescript-legacy-parser');

const tsPath = require.resolve('typescript');
require.cache[tsPath] = {
  id: tsPath,
  filename: tsPath,
  loaded: true,
  exports: legacyTs,
};

module.exports = require('@typescript-eslint/parser');
