import { describe, it, expect, beforeEach } from 'vitest';
import { ModelManager } from '../../../src/lib/ai/model-manager.js';

describe('ModelManager', () => {
  let manager: ModelManager;

  beforeEach(() => {
    manager = new ModelManager();
  });

  describe('initial state', () => {
    it('is not loaded initially', () => {
      expect(manager.isLoaded()).toBe(false);
    });

    it('has null model path initially', () => {
      expect(manager.getModelPath()).toBeNull();
    });
  });

  describe('inference without loading', () => {
    it('throws when inference called without loading', async () => {
      await expect(
        manager.inference([{ role: 'user', content: 'test' }])
      ).rejects.toThrow('No model loaded');
    });
  });

  describe('load without node-llama-cpp', () => {
    it('throws descriptive error when node-llama-cpp is not installed', async () => {
      // node-llama-cpp is an optional dep that likely isn't installed in test env
      await expect(
        manager.load('/nonexistent/model.gguf')
      ).rejects.toThrow(/node-llama-cpp/);
    });
  });

  describe('unload', () => {
    it('unload on unloaded manager is a no-op', async () => {
      // Should not throw
      await manager.unload();
      expect(manager.isLoaded()).toBe(false);
    });
  });
});
