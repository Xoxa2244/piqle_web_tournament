#!/usr/bin/env node
/**
 * Converts public/email-icons/*.svg to PNG (32x32).
 * Run: node scripts/email-icons-to-png.mjs
 */
import sharp from 'sharp'
import { readdir, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, '..', 'public', 'email-icons')

const size = 32

const files = await readdir(iconsDir)
const svgFiles = files.filter((f) => f.endsWith('.svg'))

for (const name of svgFiles) {
  const base = name.replace(/\.svg$/, '')
  const svgPath = join(iconsDir, name)
  const pngPath = join(iconsDir, base + '.png')
  const svg = await readFile(svgPath, 'utf-8')
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(pngPath)
  console.log('Created', base + '.png')
}

console.log('Done.')
