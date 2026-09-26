import set from '@iconify-json/vscode-icons/icons.json'
import * as vscodeIcons from 'vscode-icons-js'
import type { IconData } from './icon-set'

/** Imported only through `loadIcons`, so the build puts it in a chunk of its own (FICN-12). */
export const iconData: IconData = { set, mapping: vscodeIcons }
