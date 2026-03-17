/**
 * Model Manager — Load/unload GGUF models via node-llama-cpp
 *
 * Lifecycle: load(modelPath) → inference(messages, jsonSchema?) → unload()
 * Only one model loaded at a time. Memory freed on unload().
 *
 * node-llama-cpp is an optional dependency. If not installed, load() throws.
 */

export interface InferenceMessage {
  role: 'system' | 'user';
  content: string;
}

export type ProgressCallback = (message: string) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LlamaModule = any;

export class ModelManager {
  private llama: LlamaModule = null;
  private model: LlamaModule = null;
  private modelPath: string | null = null;
  private llamaModule: LlamaModule = null;

  async load(modelPath: string, onProgress?: ProgressCallback): Promise<void> {
    if (this.model && this.modelPath === modelPath) {
      onProgress?.('Model already loaded — reusing');
      return;
    }

    await this.unload();

    onProgress?.('Importing node-llama-cpp module...');

    try {
      this.llamaModule = await import('node-llama-cpp');
    } catch (err) {
      throw new Error(
        `node-llama-cpp is not installed or failed to load: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    onProgress?.('Initializing llama engine...');

    try {
      this.llama = await this.llamaModule.getLlama("lastBuild");
    } catch (err) {
      throw new Error(
        `Failed to initialize llama engine: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    onProgress?.(`Loading model into memory (${(await import('node:fs')).statSync(modelPath).size / 1024 / 1024 | 0} MB)...`);

    this.model = await this.llama.loadModel({ modelPath });
    this.modelPath = modelPath;
    onProgress?.('Model loaded successfully');
  }

  async inference(
    messages: InferenceMessage[],
    jsonSchema?: Record<string, unknown>,
    onProgress?: ProgressCallback
  ): Promise<string> {
    if (!this.model || !this.llama || !this.llamaModule) {
      throw new Error('No model loaded. Call load() first.');
    }

    const { LlamaChatSession, LlamaJsonSchemaGrammar } = this.llamaModule;

    onProgress?.('Creating context...');
    const context = await this.model.createContext({ contextSize: 2048 });

    try {
      const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
      });

      const systemMsg = messages.find((m) => m.role === 'system');
      if (systemMsg) {
        session.setChatHistory([
          { type: 'system', text: systemMsg.content },
        ]);
      }

      const userMsg = messages.find((m) => m.role === 'user');
      if (!userMsg) throw new Error('No user message provided');

      const promptOptions: Record<string, unknown> = {};

      if (jsonSchema) {
        onProgress?.('Building JSON grammar...');
        const grammar = new LlamaJsonSchemaGrammar(this.llama, jsonSchema);
        promptOptions.grammar = grammar;
      }

      onProgress?.('Running inference...');

      // Cap output length to avoid rambling
      promptOptions.maxTokens = 500;

      // Track tokens for progress — onToken fires per token
      let tokenCount = 0;
      const inferenceStart = Date.now();
      promptOptions.onToken = () => {
        tokenCount++;
        if (tokenCount % 20 === 0) {
          const elapsed = ((Date.now() - inferenceStart) / 1000).toFixed(0);
          onProgress?.(`Generating... ${tokenCount} tokens (${elapsed}s)`);
        }
      };

      const response = await session.prompt(userMsg.content, promptOptions);
      const elapsed = ((Date.now() - inferenceStart) / 1000).toFixed(1);
      onProgress?.(`Done — ${tokenCount} tokens in ${elapsed}s`);
      return response;
    } finally {
      await context.dispose();
    }
  }

  async unload(): Promise<void> {
    if (this.model) {
      await this.model.dispose();
      this.model = null;
      this.modelPath = null;
    }
  }

  isLoaded(): boolean {
    return this.model !== null;
  }

  getModelPath(): string | null {
    return this.modelPath;
  }
}

export const modelManager = new ModelManager();
