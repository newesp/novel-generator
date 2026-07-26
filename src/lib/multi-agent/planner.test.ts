import { describe, expect, it } from 'vitest';
import { parsePlannerResponse } from './planner';

describe('Planner Response Parser', () => {
  it('parses valid JSON response with Markdown code blocks', () => {
    const raw = `\`\`\`json
{
  "beat": "衝突升級 (Rising Action)",
  "points": "主角在酒館遇到神祕商人，得知魔法書的秘密。",
  "explanation": "推進主線動機並增加章節懸念。"
}
\`\`\``;
    const parsed = parsePlannerResponse(raw);
    expect(parsed.beat).toBe('衝突升級 (Rising Action)');
    expect(parsed.points).toContain('主角在酒館遇到神祕商人');
    expect(parsed.explanation).toBe('推進主線動機並增加章節懸念。');
  });

  it('handles array points and converts to newline-separated string', () => {
    const raw = JSON.stringify({
      beat: '高潮 (Climax)',
      points: ['要點一：正面衝突', '要點二：神祕武器登場'],
      explanation: '高潮情節安排',
    });
    const parsed = parsePlannerResponse(raw);
    expect(parsed.beat).toBe('高潮 (Climax)');
    expect(parsed.points).toBe('要點一：正面衝突\n要點二：神祕武器登場');
  });

  it('throws descriptive error if JSON is malformed or missing fields', () => {
    expect(() => parsePlannerResponse('invalid json text')).toThrow('無法解析 Planner 模型 JSON 回應');
    expect(() => parsePlannerResponse(JSON.stringify({ points: '要點' }))).toThrow('缺少「beat」');
    expect(() => parsePlannerResponse(JSON.stringify({ beat: '高潮' }))).toThrow('缺少「points」');
  });
});
