import type { Span } from "./ast.ts";

export interface LuaScan {
  readonly end: number;
  readonly longBrackets: readonly Span[];
}

// Mirrors the scanner behind ngx_http_lua_conf_lua_block_parse() in
// lua-nginx-module. Short strings only count when they close on their line.
export const scanLuaBlock = (text: string, start: number): LuaScan | null => {
  const longBrackets: Span[] = [];
  let depth = 1;
  let pos = start;
  while (pos < text.length) {
    const c = text[pos];
    if (c === "{") {
      depth++;
      pos++;
    } else if (c === "}") {
      depth--;
      if (depth === 0) {
        return { end: pos, longBrackets };
      }
      pos++;
    } else if (c === "[" || (c === "-" && text[pos + 1] === "-")) {
      const bracket = c === "[" ? pos : pos + 2;
      const level = longBracketLevel(text, bracket);
      if (level === null) {
        pos = c === "[" ? pos + 1 : lineEnd(text, pos);
      } else {
        const end = longBracketEnd(text, bracket, level);
        if (end === null) {
          return null;
        }
        longBrackets.push({ start: bracket, end });
        pos = end;
      }
    } else if (c === '"' || c === "'") {
      pos = shortStringEnd(text, pos, c) ?? pos + 1;
    } else {
      pos++;
    }
  }
  return null;
};

const lineEnd = (text: string, pos: number): number => {
  const newline = text.indexOf("\n", pos);
  return newline === -1 ? text.length : newline;
};

const shortStringEnd = (text: string, pos: number, quote: string): number | null => {
  pos++;
  while (pos < text.length) {
    const c = text[pos];
    if (c === "\n") {
      return null;
    }
    if (c === "\\") {
      if (text[pos + 1] === "\n") {
        return null;
      }
      pos += 2;
    } else if (c === quote) {
      return pos + 1;
    } else {
      pos++;
    }
  }
  return null;
};

const longBracketLevel = (text: string, pos: number): number | null => {
  if (text[pos] !== "[") {
    return null;
  }
  let level = 0;
  while (text[pos + 1 + level] === "=") {
    level++;
  }
  return text[pos + 1 + level] === "[" ? level : null;
};

const longBracketEnd = (text: string, pos: number, level: number): number | null => {
  const close = `]${"=".repeat(level)}]`;
  const end = text.indexOf(close, pos + level + 2);
  return end === -1 ? null : end + close.length;
};

export interface LuaLine {
  readonly text: string;
  // Starts inside a long bracket, so it is kept byte for byte.
  readonly literal: boolean;
}

export const dedent = (source: string, longBrackets: readonly Span[] = []): LuaLine[] => {
  let span = 0;
  const inside = (offset: number): boolean => {
    while (span < longBrackets.length && longBrackets[span]!.end <= offset) {
      span++;
    }
    return span < longBrackets.length && longBrackets[span]!.start < offset;
  };
  const lines: LuaLine[] = [];
  let offset = 0;
  for (const raw of source.split("\n")) {
    const literal = inside(offset);
    const trimmed = inside(offset + raw.length) ? raw : raw.trimEnd();
    lines.push({ text: offset === 0 ? trimmed.trimStart() : trimmed, literal });
    offset += raw.length + 1;
  }
  const inline = lines[0]!.text !== "";
  const first = lines.findIndex((line) => line.text !== "");
  const last = lines.findLastIndex((line) => line.text !== "");
  const kept = first === -1 ? [] : lines.slice(first, last + 1);
  const fixed = (line: LuaLine, index: number): boolean =>
    line.text === "" || line.literal || (inline && index === 0);
  const measured = kept.filter((line, index) => !fixed(line, index));
  const common = measured
    .slice(1)
    .reduce(commonIndent, measured[0] === undefined ? "" : leadingWhitespace(measured[0].text));
  return kept.map((line, index) =>
    fixed(line, index) ? line : { ...line, text: line.text.slice(common.length) },
  );
};

const leadingWhitespace = (line: string): string => /^[ \t]*/.exec(line)![0];

const commonIndent = (indentation: string, line: LuaLine): string => {
  const own = leadingWhitespace(line.text);
  let length = 0;
  while (length < indentation.length && indentation[length] === own[length]) {
    length++;
  }
  return indentation.slice(0, length);
};
