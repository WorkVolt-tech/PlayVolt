import { readFileSync, writeFileSync } from 'fs'

const swPath = 'public/sw.js'
let content = readFileSync(swPath, 'utf8')

const newVersion = `dekabess-${Date.now()}`
content = content.replace(/const CACHE = 'dekabess-[^']*'/, `const CACHE = '${newVersion}'`)

writeFileSync(swPath, content)
console.log(`SW cache bumped to: ${newVersion}`)
