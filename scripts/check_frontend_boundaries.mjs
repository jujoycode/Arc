import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, relative, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../frontend/src')
const ts = createRequire(resolve(source, '../package.json'))('typescript')
const errors = [], graph = new Map()
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]) }
function feature(path) { return path.startsWith('features/') ? path.split('/')[1] : undefined }
function targetFile(candidate) { return [candidate, `${candidate}.ts`, `${candidate}.tsx`, `${candidate}.css`, join(candidate, 'index.ts'), join(candidate, 'index.tsx')].find(path => existsSync(path) && extname(path)) }

for (const file of walk(source).filter(file => /\.(tsx?|css)$/.test(file))) {
  const path = relative(source, file).split('\\').join('/'), owner = feature(path)
  if (!path.includes('/') && path !== 'main.tsx' && !path.endsWith('.d.ts')) errors.push(`${path}: root contains only the entry point`)
  if (path.includes('/') && !['app', 'features', 'shared'].includes(path.split('/')[0])) errors.push(`${path}: use app, features, or shared`)
  if (owner) {
    if (!graph.has(owner)) graph.set(owner, new Set())
    if (path.split('/')[2] !== 'index.ts' && !['api', 'internal'].includes(path.split('/')[2])) errors.push(`${path}: feature code belongs in api or internal`)
  }
  if (extname(file) === '.css') continue
  const syntax = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const imports = []
  function collect(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : node
      const bindings = ts.isImportDeclaration(node) ? clause?.namedBindings : node.exportClause
      const typeOnly = !!clause?.isTypeOnly || (!clause?.name && bindings?.elements?.length > 0 && bindings.elements.every(item => item.isTypeOnly))
      imports.push({ specifier: node.moduleSpecifier.text, typeOnly })
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) imports.push({ specifier: node.arguments[0].text, typeOnly: false })
    ts.forEachChild(node, collect)
  }
  collect(syntax)
  for (const { specifier, typeOnly } of imports) {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue
    const target = targetFile(specifier.startsWith('@/') ? resolve(source, specifier.slice(2)) : resolve(dirname(file), specifier))
    if (!target) { errors.push(`${path}: unresolved local import ${specifier}`); continue }
    const targetPath = relative(source, target).split('\\').join('/'), targetOwner = feature(targetPath)
    if (path.startsWith('shared/') && !targetPath.startsWith('shared/')) errors.push(`${path}: shared cannot depend on app or features`)
    if (owner && targetPath.startsWith('app/')) errors.push(`${path}: feature cannot depend on app`)
    if (targetOwner && targetOwner !== owner) {
      if (!/^features\/[^/]+\/index\.tsx?$/.test(targetPath)) errors.push(`${path}: import ${targetOwner} through its public index`)
      if (owner && !typeOnly) graph.get(owner).add(targetOwner)
    }
    if (path.includes('/internal/model/') && targetPath === 'shared/api/client.ts') errors.push(`${path}: model must not call HTTP directly`)
  }
}
function visit(node, trail) {
  if (trail.includes(node)) { errors.push(`runtime feature cycle: ${[...trail, node].join(' -> ')}`); return }
  for (const next of graph.get(node) ?? []) visit(next, [...trail, node])
}
for (const node of graph.keys()) visit(node, [])
if (errors.length) { console.error([...new Set(errors)].join('\n')); process.exit(1) }
console.log(`Frontend boundaries OK: ${graph.size} feature modules; public imports; no runtime cycles`)
