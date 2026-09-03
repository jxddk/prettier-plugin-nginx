export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface Word extends Span {
  readonly type: "word";
  readonly text: string;
}

export interface Comment extends Span {
  readonly type: "comment";
  readonly text: string;
  readonly blankLineBefore: boolean;
}

export interface Directive extends Span {
  readonly type: "directive";
  readonly name: Word;
  readonly args: readonly (Word | Comment)[];
  readonly block: Block | LuaBlock | null;
  readonly trailingComment: string | null;
  readonly blankLineBefore: boolean;
}

export interface Block extends Span {
  readonly type: "block";
  readonly openingComment: string | null;
  readonly body: readonly Statement[];
}

export interface LuaBlock extends Span {
  readonly type: "lua";
  readonly source: string;
  readonly longBrackets: readonly Span[];
}

export interface Config extends Span {
  readonly type: "config";
  readonly body: readonly Statement[];
}

export type Statement = Directive | Comment;

export type Node = Config | Directive | Block | LuaBlock | Comment | Word;

export const isBlockDirective = (statement: Statement): boolean =>
  statement.type === "directive" && statement.block !== null;

export const isLuaBlockDirective = (name: string): boolean => name.endsWith("_by_lua_block");
