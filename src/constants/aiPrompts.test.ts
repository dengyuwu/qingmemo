import { describe, expect, it } from 'vitest';
import { buildDailyQuestPrompt, buildNarrativeReviewPrompt, buildProgressAwareAiPrompt } from './aiPrompts';

describe('aiPrompts', () => {
  it('builds a daily quest prompt with strict JSON output and commander context', () => {
    const prompt = buildDailyQuestPrompt({ level: 4, streak: 8, delayDebt: 2, focusScore: 88, noteTitles: ['发布版本', '客户反馈'] });

    expect(prompt).toContain('只输出 JSON');
    expect(prompt).toContain('3 个每日作战任务');
    expect(prompt).toContain('指挥官等级：4');
    expect(prompt).toContain('发布版本');
    expect(prompt).toContain('不要输出 Markdown');
    expect(prompt).toContain('每个任务都必须服务于真实推进');
  });

  it('builds a narrative review prompt with battle-report language and data', () => {
    const prompt = buildNarrativeReviewPrompt({ level: 3, xp: 260, focusScore: 91, delayDebt: 0, completed: 4, capturedIdeas: 9, cleanliness: 94, tomorrowHint: '先发布版本' });

    expect(prompt).toContain('战役战报');
    expect(prompt).toContain('拖延怪');
    expect(prompt).toContain('战场肃清度：94%');
    expect(prompt).toContain('先发布版本');
    expect(prompt).toContain('明日第一步');
    expect(prompt).toContain('不要空泛鸡汤');
  });

  it('adds level and achievement context to existing AI assistant modes', () => {
    const prompt = buildProgressAwareAiPrompt('nextStep', '客户方案', { level: 5, achievements: ['first_victory', 'ai_commander'] });

    expect(prompt).toContain('当前指挥官等级：5');
    expect(prompt).toContain('first_victory、ai_commander');
    expect(prompt).toContain('客户方案');
    expect(prompt).toContain('输出必须能被用户直接执行');
  });
});
