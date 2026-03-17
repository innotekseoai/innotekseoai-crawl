declare module 'node-llama-cpp' {
  export function getLlama(): Promise<any>;
  export class LlamaChatSession {
    constructor(options: any);
    setChatHistory(history: any[]): void;
    prompt(text: string, options?: any): Promise<string>;
  }
  export class LlamaJsonSchemaGrammar {
    constructor(llama: any, schema: any);
  }
}

declare module 'sql.js' {
  interface Database {
    run(sql: string, params?: unknown[]): Database;
    exec(sql: string): QueryExecResult[];
    export(): Uint8Array;
    close(): void;
  }

  interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>;
}
