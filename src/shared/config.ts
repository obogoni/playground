export interface AppConfig {
  ui: {
    theme: 'dark' | 'light'
    direction: 'tree' | 'board'
  }
}

export type ConfigPatch = {
  [K in keyof AppConfig]?: Partial<AppConfig[K]>
}

export const DEFAULT_CONFIG: AppConfig = {
  ui: {
    theme: 'dark',
    direction: 'tree'
  }
}
