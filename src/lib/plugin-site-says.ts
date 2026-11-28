import { declOf, type PluginKey } from '@/lib/plugin-registry'

/** The sentence a seat reads on another firm's plugin site. Pure, so a browser page may import it. */
export function otherFirmSiteSays(key: PluginKey): string {
  return `This is another firm’s ${declOf(key)?.label.toLowerCase() ?? 'plugin'} site. Use the link on your own menu.`
}
