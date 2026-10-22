import { describe, expect, test } from 'bun:test';

import { plural } from './format.ts';
import { setLocale, t } from './i18n.ts';

describe('t', () => {
  test('returns the English source for English and unknown text', () => {
    setLocale('en');
    expect(t('Start')).toBe('Start');
    setLocale('zh-CN');
    expect(t('a string the dictionary does not know')).toBe('a string the dictionary does not know');
  });

  test('translates exact strings and dynamic sentences', () => {
    setLocale('zh-CN');
    expect(t('Start')).toBe('启动');
    expect(t('Starting Docker…')).toBe('正在启动 Docker…');
    expect(t('Docker isn\'t running.')).toBe('Docker 未运行。');
    expect(t('web failed: exit 1')).toBe('web 失败：exit 1');
    expect(t('+3 more in the Docker panel')).toBe('另有 3 项，见 Docker 面板');
    expect(t('up 2 分钟')).toBe('运行 2 分钟');
  });

  test('follows the host locale, including zh-TW', () => {
    setLocale('zh-TW');
    expect(t('Logs')).toBe('日志');
    setLocale('en');
    expect(t('Logs')).toBe('Logs');
  });
});

describe('plural', () => {
  test('uses Chinese measure words for known nouns', () => {
    setLocale('zh-CN');
    expect(plural(2, 'container')).toBe('2 个容器');
    expect(plural(1, 'unused image')).toBe('1 个未使用的镜像');
    setLocale('en');
    expect(plural(2, 'container')).toBe('2 containers');
  });
});
