const fs = require('node:fs')
const path = require('node:path')

// Writes the target Info.plist on each prebuild so the app group follows the phone bundle id.
function writeInfoPlist(directory, entries) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>'
  ]
  for (const [key, value] of entries) {
    lines.push(`  <key>${key}</key>`)
    if (typeof value === 'boolean') {
      lines.push(value ? '  <true/>' : '  <false/>')
    } else if (value && typeof value === 'object') {
      lines.push('  <dict>')
      for (const [childKey, childValue] of Object.entries(value)) {
        lines.push(`    <key>${childKey}</key>`)
        lines.push(`    <string>${childValue}</string>`)
      }
      lines.push('  </dict>')
    } else {
      lines.push(`  <string>${value}</string>`)
    }
  }
  lines.push('</dict>', '</plist>', '')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'Info.plist'), lines.join('\n'))
}

module.exports = { writeInfoPlist }
