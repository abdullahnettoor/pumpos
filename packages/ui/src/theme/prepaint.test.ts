import { describe, expect, it } from 'vite-plus/test';
import { injectThemeFlags, themePrepaintPlugin } from './prepaint.js';
import { STATUS_BAR_STYLES, THEME_COLORS, THEME_STORAGE_KEY } from './config.js';

describe('theme prepaint script template injection', () => {
  const template = `
    <meta name="theme-color" content="__THEME_COLOR_LIGHT__" />
    <meta name="apple-mobile-web-app-status-bar-style" content="__STATUS_BAR_LIGHT__" />
    <script>
      var dev = __THEME_DEV_SWITCH__;
      var app = __APPEARANCE_ENABLED__;
      var key = '__THEME_STORAGE_KEY__';
      var darkColor = '__THEME_COLOR_DARK__';
      var darkBar = '__STATUS_BAR_DARK__';
    </script>
  `;

  it('replaces all placeholders with exact config values', () => {
    const injected = injectThemeFlags(template, { devSwitch: false, appearanceEnabled: false });

    expect(injected).not.toContain('__THEME_COLOR_LIGHT__');
    expect(injected).not.toContain('__THEME_DEV_SWITCH__');
    expect(injected).not.toContain('__APPEARANCE_ENABLED__');
    expect(injected).not.toContain('__THEME_STORAGE_KEY__');
    expect(injected).not.toContain('__THEME_COLOR_DARK__');
    expect(injected).not.toContain('__STATUS_BAR_DARK__');

    expect(injected).toContain(`content="${THEME_COLORS.light}"`);
    expect(injected).toContain(`content="${STATUS_BAR_STYLES.light}"`);
    expect(injected).toContain('var dev = false;');
    expect(injected).toContain('var app = false;');
    expect(injected).toContain(`var key = '${THEME_STORAGE_KEY}';`);
    expect(injected).toContain(`var darkColor = '${THEME_COLORS.dark}';`);
    expect(injected).toContain(`var darkBar = '${STATUS_BAR_STYLES.dark}';`);
  });

  it('injects devSwitch: true when enabled', () => {
    const injected = injectThemeFlags(template, { devSwitch: true, appearanceEnabled: false });
    expect(injected).toContain('var dev = true;');
  });

  it('provides a Vite plugin transform', () => {
    const plugin = themePrepaintPlugin(true, false);
    expect(plugin.name).toBe('pump-theme-prepaint');
    if (typeof plugin.transformIndexHtml === 'function') {
      const res = (plugin.transformIndexHtml as (html: string) => string)(template);
      expect(res).toContain('var dev = true;');
    }
  });
});
