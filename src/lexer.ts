import type { Span } from "./ast.ts";
import { NginxSyntaxError, positionAt } from "./errors.ts";
import { scanLuaBlock } from "./lua.ts";

export type Token = Span &
  (
    | { readonly type: "word" | "comment"; readonly text: string }
    | { readonly type: "semicolon" | "openBrace" | "closeBrace" | "eof" }
  );

export interface RawBlock {
  readonly source: string;
  readonly longBrackets: readonly Span[];
  readonly end: number;
}

// The value nginx gives a word: surrounding quotes removed and the escapes
// ngx_conf_read_token() decodes applied.
export const wordValue = (text: string): string => {
  const quoted = text.startsWith('"') || text.startsWith("'");
  const inner = quoted ? text.slice(1, -1) : text;
  return inner.replace(/\\(.)/gs, (escape, c: string) =>
    c === "t" ? "\t" : c === "r" ? "\r" : c === "n" ? "\n" : `"'\\`.includes(c) ? c : escape,
  );
};

const isSpace = (c: string | undefined): boolean =>
  c === " " || c === "\t" || c === "\n" || c === "\r";

const endsWord = (c: string | undefined): boolean =>
  c === undefined || isSpace(c) || c === ";" || c === "{";

// Mirrors ngx_conf_read_token() in nginx's src/core/ngx_conf_file.c.
export class Lexer {
  readonly #text: string;
  #pos = 0;

  constructor(text: string) {
    this.#text = text;
  }

  error(message: string, offset: number): NginxSyntaxError {
    return new NginxSyntaxError(message, positionAt(this.#text, offset));
  }

  next(): Token {
    this.#skipWhitespace();
    const start = this.#pos;
    const c = this.#text[start];
    switch (c) {
      case undefined:
        return { type: "eof", start, end: start };
      case "#":
        return this.#comment(start);
      case ";":
        this.#pos++;
        return { type: "semicolon", start, end: this.#pos };
      case "{":
        this.#pos++;
        return { type: "openBrace", start, end: this.#pos };
      case "}":
        this.#pos++;
        return { type: "closeBrace", start, end: this.#pos };
      case '"':
      case "'":
        return this.#quoted(start, c);
      default:
        return this.#bare(start);
    }
  }

  // Call right after consuming the opening brace; consumes through the matching one.
  luaBlock(): RawBlock {
    const start = this.#pos;
    const scan = scanLuaBlock(this.#text, start);
    if (scan === null) {
      throw this.error('unexpected end of file, expecting "}" closing the Lua block', start - 1);
    }
    this.#pos = scan.end + 1;
    const longBrackets = scan.longBrackets.map((span) => ({
      start: span.start - start,
      end: span.end - start,
    }));
    return { source: this.#text.slice(start, scan.end), longBrackets, end: this.#pos };
  }

  #skipWhitespace(): void {
    while (isSpace(this.#text[this.#pos])) {
      this.#pos++;
    }
  }

  #comment(start: number): Token {
    let end = this.#text.indexOf("\n", start);
    if (end === -1) {
      end = this.#text.length;
    }
    this.#pos = end;
    return {
      type: "comment",
      text: this.#text.slice(start, end).replace(/[ \t\r]+$/, ""),
      start,
      end,
    };
  }

  #quoted(start: number, quote: string): Token {
    let pos = start + 1;
    for (;;) {
      const c = this.#text[pos];
      if (c === undefined) {
        throw this.error("unterminated quoted string", start);
      }
      pos++;
      if (c === "\\") {
        pos++;
      } else if (c === quote) {
        break;
      }
    }
    const after = this.#text[pos];
    if (!endsWord(after) && after !== ")") {
      throw this.error(`unexpected "${after}" after quoted string`, pos);
    }
    this.#pos = pos;
    return { type: "word", text: this.#text.slice(start, pos), start, end: pos };
  }

  #bare(start: number): Token {
    let pos = start;
    let variable = false;
    for (;;) {
      const c = this.#text[pos];
      if (c === "\\") {
        pos += 2;
        variable = false;
      } else if (c === "$") {
        pos++;
        variable = true;
      } else if (c === "{" && variable) {
        pos++;
      } else if (endsWord(c)) {
        break;
      } else {
        pos++;
        variable = false;
      }
    }
    this.#pos = Math.min(pos, this.#text.length);
    return { type: "word", text: this.#text.slice(start, this.#pos), start, end: this.#pos };
  }
}
