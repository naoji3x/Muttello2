import { execFileSync } from 'node:child_process'
if (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD) throw new Error('Production requires CSC_LINK and CSC_KEY_PASSWORD for code signing.')
if (process.platform === 'darwin' && (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD || !process.env.APPLE_TEAM_ID)) throw new Error('Production macOS requires Apple notarization credentials.')
execFileSync(process.execPath, ['node_modules/electron-builder/cli.js', '--config.forceCodeSigning=true', ...(process.platform === 'darwin' ? ['--config.mac.notarize=true'] : [])], { stdio: 'inherit' })
