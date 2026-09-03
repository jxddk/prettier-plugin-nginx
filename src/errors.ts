export interface Position {
  readonly line: number;
  readonly column: number;
}

export class NginxSyntaxError extends SyntaxError {
  readonly loc: { readonly start: Position };

  constructor(message: string, position: Position) {
    super(`${message} (${position.line}:${position.column})`);
    this.name = "NginxSyntaxError";
    this.loc = { start: position };
  }
}

export const positionAt = (text: string, offset: number): Position => {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
};
