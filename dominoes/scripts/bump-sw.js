import { readFileSync, writeFileSync } from 'fs'

const swPath = 'public/sw.js'
let content = readFileSync(swPath, 'utf8')

const buildId = `dekabess-${Date.now()}`
content = content.replace(/const CACHE = 'dekabess-[^']*'/, `const CACHE = '${buildId}'`)

writeFileSync(swPath, content)
writeFileSync('public/version.json', JSON.stringify({ version: buildId }, null, 2) + '\n')
writeFileSync('src/generatedVersion.js', `export const APP_VERSION = '${buildId}'\n`)

console.log(`SW cache + app version bumped to: ${buildId}`)
