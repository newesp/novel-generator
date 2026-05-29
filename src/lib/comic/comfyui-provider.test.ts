import { describe, expect, it } from 'vitest';
import { buildComfyWorkflow, extractComfyOutputImages } from './comfyui-provider';

describe('buildComfyWorkflow', () => {
  it('injects prompt, negative prompt, seed, and size into configured nodes', () => {
    const workflow = {
      '1': { inputs: { text: '' } },
      '2': { inputs: { text: '' } },
      '3': { inputs: { seed: 0, width: 512, height: 512 } },
    };

    const next = buildComfyWorkflow(workflow, {
      promptNodeId: '1',
      negativePromptNodeId: '2',
      seedNodeId: '3',
      widthNodeId: '3',
      heightNodeId: '3',
      outputNodeId: '9',
    }, {
      prompt: '阿飛 standing in mist',
      negativePrompt: 'extra fingers',
      seed: 42,
      width: 768,
      height: 1024,
    });

    expect(next['1']?.inputs?.text).toBe('阿飛 standing in mist');
    expect(next['2']?.inputs?.text).toBe('extra fingers');
    expect(next['3']?.inputs?.seed).toBe(42);
    expect(next['3']?.inputs?.width).toBe(768);
    expect(next['3']?.inputs?.height).toBe(1024);
  });
});

describe('extractComfyOutputImages', () => {
  it('extracts image view URLs from history output nodes', () => {
    const images = extractComfyOutputImages({
      outputs: {
        '9': {
          images: [{ filename: 'panel.png', subfolder: 'comic', type: 'output' }],
        },
      },
    }, 'http://127.0.0.1:8188');

    expect(images).toEqual([
      'http://127.0.0.1:8188/view?filename=panel.png&subfolder=comic&type=output',
    ]);
  });
});
