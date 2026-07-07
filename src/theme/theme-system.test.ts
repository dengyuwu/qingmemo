import { describe, expect, it } from 'vitest';
import { NOTE_SKINS, THEMES, resolveSelectedSkin, resolveSelectedTheme } from './theme-system';

describe('theme system', () => {
  it('defines four battle themes and four note skins', () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(['clean', 'battlefield', 'cyberpunk', 'minimal']);
    expect(NOTE_SKINS.map((skin) => skin.id)).toEqual(['default', 'tactical', 'neon', 'glitch']);
  });

  it('falls back to unlocked clean theme and default skin when selection is locked', () => {
    expect(resolveSelectedTheme('cyberpunk', ['clean']).id).toBe('clean');
    expect(resolveSelectedSkin('glitch', ['default']).id).toBe('default');
  });

  it('returns glassmorphism classes for unlocked themes and skins', () => {
    expect(resolveSelectedTheme('battlefield', ['clean', 'battlefield']).rootClass).toContain('theme-battlefield');
    expect(resolveSelectedSkin('neon', ['default', 'neon']).cardClass).toContain('shadow-sky');
  });
});
