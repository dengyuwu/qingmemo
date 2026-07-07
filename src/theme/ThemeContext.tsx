import { createContext, useContext, type ReactNode } from 'react';

import type { NoteSkinId, ThemeId } from '../features/progress/progress-model';
import { NOTE_SKINS, THEMES, resolveSelectedSkin, resolveSelectedTheme, type BattleTheme, type NoteSkin } from './theme-system';

export type BattleThemeContextValue = {
  theme: BattleTheme;
  skin: NoteSkin;
  themeId: ThemeId;
  skinId: NoteSkinId;
};

const fallbackTheme = THEMES.find((theme) => theme.id === 'clean') ?? THEMES[0];
const fallbackSkin = NOTE_SKINS.find((skin) => skin.id === 'default') ?? NOTE_SKINS[0];

const BattleThemeContext = createContext<BattleThemeContextValue>({
  theme: fallbackTheme,
  skin: fallbackSkin,
  themeId: 'clean',
  skinId: 'default',
});

type BattleThemeProviderProps = {
  selectedTheme: ThemeId;
  selectedSkin: NoteSkinId;
  unlockedThemes: ThemeId[];
  unlockedSkins: NoteSkinId[];
  children: ReactNode;
};

export function BattleThemeProvider({
  selectedTheme,
  selectedSkin,
  unlockedThemes,
  unlockedSkins,
  children,
}: BattleThemeProviderProps) {
  const theme = resolveSelectedTheme(selectedTheme, unlockedThemes);
  const skin = resolveSelectedSkin(selectedSkin, unlockedSkins);

  return (
    <BattleThemeContext.Provider
      value={{
        theme,
        skin,
        themeId: theme.id,
        skinId: skin.id,
      }}
    >
      {children}
    </BattleThemeContext.Provider>
  );
}

export function useBattleTheme() {
  return useContext(BattleThemeContext);
}
