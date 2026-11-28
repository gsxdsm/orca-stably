const fs = require('node:fs')
const path = require('node:path')

function writeValue(lines, value, indent) {
  if (typeof value === 'boolean') {
    lines.push(`${indent}<${value ? 'true' : 'false'}/>`)
  } else if (Array.isArray(value)) {
    lines.push(`${indent}<array>`)
    for (const item of value) {
      writeValue(lines, item, `${indent}  `)
    }
    lines.push(`${indent}</array>`)
  } else if (value && typeof value === 'object') {
    lines.push(`${indent}<dict>`)
    for (const [key, item] of Object.entries(value)) {
      lines.push(`${indent}  <key>${key}</key>`)
      writeValue(lines, item, `${indent}  `)
    }
    lines.push(`${indent}</dict>`)
  } else {
    lines.push(`${indent}<string>${value}</string>`)
  }
}

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
    writeValue(lines, value, '  ')
  }
  lines.push('</dict>', '</plist>', '')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'Info.plist'), lines.join('\n'))
}

module.exports = { writeInfoPlist }
