import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Map();

// Compile the real modules with the project's existing compiler. No copied logic,
// generated files, browser globals, or additional test framework are required.
export function loadTypeScript(path) {
  const filename = resolve(root, path);
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const nodeRequire = createRequire(filename);
  const require = specifier => {
    if (specifier.startsWith('.')) {
      const target = resolve(dirname(filename), specifier);
      for (const extension of ['', '.ts', '.tsx', '/index.ts']) {
        if (existsSync(target + extension)) return loadTypeScript(target + extension);
      }
    }
    return nodeRequire(specifier);
  };
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  new Function('exports', 'require', 'module', '__filename', '__dirname', outputText)(module.exports, require, module, filename, dirname(filename));
  return module.exports;
}
