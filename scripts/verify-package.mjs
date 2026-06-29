import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { stdout } from 'node:process'

const DIST = resolve('dist')
const MAX_DIST_BYTES = 750 * 1024
const MAX_GZIP_JS_BYTES = 80 * 1024
const EXECUTABLE_EXTENSIONS = new Set(['.html', '.js', '.json'])
const FORBIDDEN = [
  { label: 'eval()', expression: /\beval\s*\(/ },
  { label: 'new Function()', expression: /\bnew\s+Function\s*\(/ },
  { label: 'remote script tag', expression: /<script[^>]+src=["']https?:/i },
  { label: 'remote source map', expression: /sourceMappingURL=https?:/i },
]

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

const files = filesUnder(DIST)
const failures = []
const totalBytes = files.reduce((total, file) => total + statSync(file).size, 0)

if (totalBytes > MAX_DIST_BYTES) {
  failures.push(`dist size ${totalBytes} exceeds ${MAX_DIST_BYTES} bytes`)
}

const javascript = files.filter((file) => extname(file) === '.js')
const chunks = javascript.map((file) => {
  const content = readFileSync(file)
  const gzipBytes = gzipSync(content).byteLength
  if (gzipBytes > MAX_GZIP_JS_BYTES) {
    failures.push(`${relative(DIST, file)} gzip size ${gzipBytes} exceeds ${MAX_GZIP_JS_BYTES}`)
  }
  return { file: relative(DIST, file), rawBytes: content.byteLength, gzipBytes }
})

for (const file of files.filter((candidate) => EXECUTABLE_EXTENSIONS.has(extname(candidate)))) {
  const content = readFileSync(file, 'utf8')
  for (const rule of FORBIDDEN) {
    if (rule.expression.test(content)) {
      failures.push(`${relative(DIST, file)} contains ${rule.label}`)
    }
  }
}

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'))
if (manifest.manifest_version !== 3) failures.push('manifest_version must equal 3')
if (manifest.host_permissions !== undefined) failures.push('required host_permissions are forbidden')

stdout.write(`${JSON.stringify({ totalBytes, chunks }, null, 2)}\n`)
if (failures.length > 0) {
  throw new Error(`Package verification failed:\n${failures.join('\n')}`)
}
