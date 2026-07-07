import type { NoteSkinId, ThemeId } from '../features/progress/progress-model';

export type BattleTheme = {
  id: ThemeId;
  name: string;
  description: string;
  rootClass: string;
  auraClass: string;
  commanderClass: string;
};

export type NoteSkin = {
  id: NoteSkinId;
  name: string;
  description: string;
  cardClass: string;
  accentClass: string;
};

export const THEMES: BattleTheme[] = [
  {
    id: 'clean',
    name: '现代玻璃',
    description: '默认白玻璃、蓝绿能量和柔和光效。',
    rootClass: 'theme-clean bg-[radial-gradient(circle_at_12%_0%,rgba(14,165,233,.12),transparent_32%),radial-gradient(circle_at_90%_8%,rgba(168,85,247,.10),transparent_30%),linear-gradient(135deg,#f8fbff,#f7f7fb_48%,#fffaf1)]',
    auraClass: 'from-sky-300/24 via-violet-300/18 to-emerald-200/22',
    commanderClass: 'from-zinc-950 via-zinc-900 to-black',
  },
  {
    id: 'battlefield',
    name: '战场军绿',
    description: '军绿暗色、雷达扫描和战术边框。',
    rootClass: 'theme-battlefield bg-[radial-gradient(circle_at_10%_0%,rgba(74,222,128,.13),transparent_34%),radial-gradient(circle_at_92%_10%,rgba(245,158,11,.10),transparent_28%),linear-gradient(135deg,#eef7ef,#f7f8ef_48%,#fffaf0)]',
    auraClass: 'from-emerald-300/26 via-lime-200/20 to-amber-200/22',
    commanderClass: 'from-[#102018] via-[#17251c] to-[#090f0c]',
  },
  {
    id: 'cyberpunk',
    name: '霓虹赛博',
    description: '紫粉霓虹、故障艺术和高亮能量。',
    rootClass: 'theme-cyberpunk bg-[radial-gradient(circle_at_16%_0%,rgba(217,70,239,.16),transparent_34%),radial-gradient(circle_at_86%_12%,rgba(6,182,212,.15),transparent_30%),linear-gradient(135deg,#fbf7ff,#f3fbff_45%,#fff7fb)]',
    auraClass: 'from-fuchsia-300/24 via-cyan-300/20 to-violet-300/26',
    commanderClass: 'from-[#19001f] via-[#111827] to-[#001b26]',
  },
  {
    id: 'minimal',
    name: '极简指挥',
    description: '低饱和、少装饰、保留高可读性。',
    rootClass: 'theme-minimal bg-[linear-gradient(135deg,#fafafa,#f5f7fb_52%,#fff)]',
    auraClass: 'from-zinc-200/22 via-sky-100/14 to-white/20',
    commanderClass: 'from-zinc-900 via-zinc-800 to-zinc-950',
  },
];

export const NOTE_SKINS: NoteSkin[] = [
  {
    id: 'default',
    name: '默认玻璃',
    description: '轻备忘默认柔和玻璃卡。',
    cardClass: '',
    accentClass: '',
  },
  {
    id: 'tactical',
    name: '战术边框',
    description: '军绿边框和战术角标。',
    cardClass: 'ring-1 ring-emerald-400/35 shadow-emerald-900/14',
    accentClass: 'after:outline after:outline-1 after:outline-emerald-300/30',
  },
  {
    id: 'neon',
    name: '霓虹发光',
    description: '蓝紫发光，适合高能模式。',
    cardClass: 'ring-1 ring-sky-300/50 shadow-sky-500/22',
    accentClass: 'after:shadow-[0_0_32px_rgba(56,189,248,.24)]',
  },
  {
    id: 'glitch',
    name: '赛博故障',
    description: '故障边线和高对比暗涌。',
    cardClass: 'ring-1 ring-fuchsia-300/50 shadow-fuchsia-500/18',
    accentClass: 'before:mix-blend-screen after:border-fuchsia-300/30',
  },
];

export function resolveSelectedTheme(selected: ThemeId, unlocked: ThemeId[]): BattleTheme {
  const unlockedSet = new Set(unlocked);
  return THEMES.find((theme) => theme.id === selected && unlockedSet.has(theme.id)) ?? THEMES[0];
}

export function resolveSelectedSkin(selected: NoteSkinId, unlocked: NoteSkinId[]): NoteSkin {
  const unlockedSet = new Set(unlocked);
  return NOTE_SKINS.find((skin) => skin.id === selected && unlockedSet.has(skin.id)) ?? NOTE_SKINS[0];
}
