import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(import.meta.dirname, '..')
const skillsDir = join(repoRoot, 'skills')
const outPath = join(repoRoot, 'manifest', 'skills.json')
const branch = 'main'
const repo = 'trutohq/truto-skills'

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const fields = {}
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    fields[key] = value
  }
  return fields
}

const skills = []
for (const id of readdirSync(skillsDir)) {
  const skillPath = join(skillsDir, id)
  if (!statSync(skillPath).isDirectory()) continue
  const skillMd = join(skillPath, 'SKILL.md')
  const content = readFileSync(skillMd, 'utf-8')
  const frontmatter = parseFrontmatter(content)
  const whenToUse = frontmatter.whenToUse ?? frontmatter.description ?? ''
  if (whenToUse.length < 80) {
    throw new Error(
      `Skill ${id} whenToUse must be at least 80 characters (got ${whenToUse.length})`
    )
  }
  skills.push({
    id,
    title: frontmatter.name ?? id,
    whenToUse,
    rawUrl: `https://raw.githubusercontent.com/${repo}/${branch}/skills/${id}/SKILL.md`,
  })
}

skills.sort((a, b) => a.id.localeCompare(b.id))
writeFileSync(outPath, `${JSON.stringify({ skills }, null, 2)}\n`)
console.log(`Wrote ${skills.length} skills to ${outPath}`)
