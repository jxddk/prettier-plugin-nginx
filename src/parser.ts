import type { Block, Comment, Config, Directive, LuaBlock, Statement, Word } from "./ast.ts";
import { isLuaBlockDirective } from "./ast.ts";
import { Lexer, type Token } from "./lexer.ts";

// nginx ends a comment only at a line feed, so a file written with bare
// carriage returns would comment out everything after its first `#`.
export const parse = (text: string, options?: { readonly endOfLine?: string }): Config => {
  if (options?.endOfLine === "cr") {
    throw new Error('endOfLine "cr" cannot be used: nginx ends comments only at a line feed');
  }
  return new Parser(text).config();
};

const popComments = (args: (Word | Comment)[]): string | null => {
  let text: string | null = null;
  while (args[args.length - 1]?.type === "comment") {
    text = joinComments(args.pop()!.text, text);
  }
  return text;
};

const joinComments = (first: string | null, second: string | null): string | null =>
  first === null ? second : second === null ? first : `${first} ${second}`;

class Parser {
  readonly #text: string;
  readonly #lexer: Lexer;
  #lookahead: Token | null = null;

  constructor(text: string) {
    this.#text = text;
    this.#lexer = new Lexer(text);
  }

  config(): Config {
    const body = this.#statements("eof", 0);
    return { type: "config", body, start: 0, end: this.#text.length };
  }

  #peek(): Token {
    this.#lookahead ??= this.#lexer.next();
    return this.#lookahead;
  }

  #advance(): Token {
    const token = this.#peek();
    this.#lookahead = null;
    return token;
  }

  #statements(closer: "eof" | "closeBrace", previousEnd: number, openedAt = 0): Statement[] {
    const body: Statement[] = [];
    for (;;) {
      const token = this.#peek();
      if (token.type === closer) {
        return body;
      }
      const blankLineBefore = this.#hasBlankLine(previousEnd, token.start);
      switch (token.type) {
        case "comment":
          this.#advance();
          body.push({
            type: "comment",
            text: token.text,
            blankLineBefore,
            start: token.start,
            end: token.end,
          });
          break;
        case "word":
          this.#advance();
          body.push(
            this.#directive(
              { type: "word", text: token.text, start: token.start, end: token.end },
              blankLineBefore,
            ),
          );
          break;
        case "eof":
          throw this.#lexer.error('unexpected end of file, expecting "}"', openedAt);
        case "closeBrace":
          throw this.#lexer.error('unexpected "}"', token.start);
        case "semicolon":
          throw this.#lexer.error('unexpected ";"', token.start);
        case "openBrace":
          throw this.#lexer.error('unexpected "{"', token.start);
      }
      previousEnd = body[body.length - 1]!.end;
    }
  }

  #directive(name: Word, blankLineBefore: boolean): Directive {
    const args: (Word | Comment)[] = [];
    let block: Block | LuaBlock | null = null;
    let trailingComment: string | null = null;
    let end: number;
    for (;;) {
      const token = this.#peek();
      if (token.type === "word") {
        this.#advance();
        args.push({ type: "word", text: token.text, start: token.start, end: token.end });
      } else if (token.type === "comment") {
        this.#advance();
        args.push({
          type: "comment",
          text: token.text,
          blankLineBefore: false,
          start: token.start,
          end: token.end,
        });
      } else if (token.type === "semicolon") {
        this.#advance();
        trailingComment = popComments(args);
        end = token.end;
        break;
      } else if (token.type === "openBrace") {
        this.#advance();
        const hoisted = popComments(args);
        if (isLuaBlockDirective(name.text)) {
          block = this.#luaBlock(token);
          trailingComment = hoisted;
        } else {
          block = this.#block(token, hoisted);
        }
        end = block.end;
        break;
      } else if (token.type === "closeBrace") {
        throw this.#lexer.error('unexpected "}"', token.start);
      } else {
        throw this.#lexer.error('unexpected end of file, expecting ";" or "}"', name.start);
      }
    }
    const next = this.#peek();
    if (next.type === "comment" && this.#sameLine(end, next.start)) {
      this.#advance();
      trailingComment = joinComments(trailingComment, next.text);
      end = next.end;
    }
    return {
      type: "directive",
      name,
      args,
      block,
      trailingComment,
      blankLineBefore,
      start: name.start,
      end,
    };
  }

  #block(open: Token, hoistedComment: string | null): Block {
    let openingComment = hoistedComment;
    let previousEnd = open.end;
    const next = this.#peek();
    if (next.type === "comment" && this.#sameLine(open.end, next.start)) {
      this.#advance();
      openingComment = joinComments(openingComment, next.text);
      previousEnd = next.end;
    }
    const body = this.#statements("closeBrace", previousEnd, open.start);
    const close = this.#advance();
    return { type: "block", openingComment, body, start: open.start, end: close.end };
  }

  #luaBlock(open: Token): LuaBlock {
    const raw = this.#lexer.luaBlock();
    return {
      type: "lua",
      source: raw.source,
      longBrackets: raw.longBrackets,
      start: open.start,
      end: raw.end,
    };
  }

  #sameLine(from: number, to: number): boolean {
    return !this.#text.slice(from, to).includes("\n");
  }

  #hasBlankLine(from: number, to: number): boolean {
    const between = this.#text.slice(from, to);
    return between.indexOf("\n") !== between.lastIndexOf("\n");
  }
}
