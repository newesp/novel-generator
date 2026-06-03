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

  it('injects reference images into configured reference nodes', () => {
    const workflow = {
      '1': { inputs: { text: '' } },
      '2': { inputs: { image: '' } },
      '3': { inputs: { image: '' } },
    };

    const next = buildComfyWorkflow(workflow, {
      promptNodeId: '1',
      negativePromptNodeId: '',
      seedNodeId: '',
      widthNodeId: '',
      heightNodeId: '',
      outputNodeId: '9',
      referenceImageNodeIds: ['2', '3'],
    }, {
      prompt: 'A Fei in workshop',
      width: 1024,
      height: 1024,
      referenceImages: [
        { id: 'asset-1', projectId: 'p1', kind: 'character_reference_image', url: 'data:image/png;base64,aaa', mimeType: 'image/png', createdAt: 1 },
        { id: 'asset-2', projectId: 'p1', kind: 'scene_reference_image', url: 'data:image/png;base64,bbb', mimeType: 'image/png', createdAt: 1 },
      ],
    });

    expect(next['2']?.inputs?.image).toBe('data:image/png;base64,aaa');
    expect(next['3']?.inputs?.image).toBe('data:image/png;base64,bbb');
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
