import { doc, util, type AstPath, type Doc, type ParserOptions, type Printer } from "prettier";
import type { Block, Comment, Config, Directive, Node, Statement, Word } from "./ast.ts";
import { isBlockDirective } from "./ast.ts";
import { wordValue } from "./lexer.ts";
import { dedent, type LuaLine } from "./lua.ts";
import type { NginxOptions } from "./options.ts";
import { insertPragma } from "./pragma.ts";

const { align, fill, hardline, indent, join, line, literalline } = doc.builders;
const { replaceEndOfLine } = doc.utils;
const { getStringWidth } = util;

export type NginxParserOptions = ParserOptions<Node> & NginxOptions;

type Path = AstPath<Node>;
type Print = (selector?: string | number | Array<string | number> | Path) => Doc;

const PRETTIER_IGNORE = /^#\s*prettier-ignore\s*$/;

export const printer: Printer<Node> = {
  print(path, options, print) {
    const node = path.node;
    switch (node.type) {
      case "config":
        return [printStatements(path, print), hardline];
      case "directive":
        return printDirective(path, options as NginxParserOptions, print);
      case "block":
        return printBlock(path, print);
      case "lua":
        return printLuaBody(dedent(node.source, node.longBrackets));
      case "comment":
      case "word":
        return replaceEndOfLine(node.text);
    }
  },

  embed(path) {
    const node = path.node as Node;
    if (node.type !== "lua" || node.source.trim() === "") {
      return null;
    }
    return async (textToDoc) => {
      const body = await textToDoc(node.source, { parser: "lua" });
      return [indent([hardline, body]), hardline];
    };
  },

  hasPrettierIgnore(path) {
    const { parent, index } = path;
    return (
      (parent?.type === "config" || parent?.type === "block") &&
      index !== null &&
      isIgnored(parent.body, index)
    );
  },

  getVisitorKeys(node) {
    switch (node.type) {
      case "config":
      case "block":
        return ["body"];
      case "directive":
        return ["block"];
      default:
        return [];
    }
  },

  // Words are not visited, so they are cleaned here and compared by the value
  // nginx gives them.
  massageAstNode: Object.assign(
    (original: Node, cloned: Record<string, unknown>) => {
      if (original.type === "directive") {
        cloned["name"] = { type: "word", text: wordValue(original.name.text) };
        cloned["args"] = original.args.map((arg) => ({
          type: arg.type,
          text: arg.type === "word" ? wordValue(arg.text) : arg.text,
        }));
      }
      if (original.type === "lua") {
        delete cloned["source"];
        delete cloned["longBrackets"];
      }
      if (original.type === "directive" && original.name.text === "if") {
        const condition = conditionWords(
          original.args.map((arg) => (arg.type === "word" ? wordValue(arg.text) : null)),
        );
        if (condition !== null) {
          cloned["args"] = ["(", ...condition, ")"].map((text) => ({ type: "word", text }));
        }
      }
    },
    { ignoredProperties: new Set(["start", "end", "blankLineBefore"]) },
  ),

  insertPragma,
};

const printStatements = (path: Path, print: Print): Doc => {
  const statements = (path.node as Config | Block).body;
  const parts: Doc[] = [];
  path.each((statementPath) => {
    const index = statementPath.index ?? 0;
    if (index > 0) {
      parts.push(hardline);
      if (needsBlankLine(statements, index)) {
        parts.push(hardline);
      }
    }
    parts.push(print(statementPath));
  }, "body");
  return parts;
};

const needsBlankLine = (statements: readonly Statement[], index: number): boolean => {
  const statement = statements[index]!;
  const previous = statements[index - 1]!;
  if (statement.blankLineBefore) {
    return true;
  }
  if (previous.type === "comment") {
    return false;
  }
  const next = attachedDirective(statements, index);
  if (next === null) {
    return false;
  }
  return isBlockDirective(previous) || isBlockDirective(next);
};

const attachedDirective = (statements: readonly Statement[], index: number): Directive | null => {
  for (let i = index; i < statements.length; i++) {
    const statement = statements[i]!;
    if (i > index && statement.blankLineBefore) {
      return null;
    }
    if (statement.type === "directive") {
      return statement;
    }
  }
  return null;
};

const printDirective = (path: Path, options: NginxParserOptions, print: Print): Doc => {
  const node = path.node as Directive;
  const parts: Doc[] = [replaceEndOfLine(node.name.text)];
  const terminator = node.block === null ? ";" : " {";
  const condition =
    node.name.text === "if"
      ? conditionWords(node.args.map((arg) => (arg.type === "word" ? arg.text : null)))
      : null;
  if (condition !== null) {
    // A quote only opens a quoted word at the start of a token, so `(` cannot
    // be glued onto a quoted first operand; a `)` after an escaping backslash
    // must stay glued.
    const detached = node.args[0]?.text === "(" && /^["']/.test(condition[0] ?? "");
    const open = detached ? " ( " : " (";
    const close = detached && !escapesNext(condition[condition.length - 1] ?? "") ? " )" : ")";
    parts.push(open, join(" ", condition), close, terminator);
  } else if (node.args.length > 0) {
    parts.push(" ".repeat(padding(path, options)), printArgs(node.args, options, terminator));
  } else {
    parts.push(terminator);
  }
  if (node.block !== null) {
    parts.push(print("block"), "}");
  }
  if (node.trailingComment !== null) {
    parts.push(" ", node.trailingComment);
  }
  return parts;
};

// The words of an `if` condition without its parentheses, the way
// ngx_http_rewrite_if_condition() strips them, or null when the arguments do
// not form a condition.
export const conditionWords = (words: readonly (string | null)[]): string[] | null => {
  const first = words[0];
  const last = words[words.length - 1];
  if (
    first === undefined ||
    first === null ||
    last === null ||
    !first.startsWith("(") ||
    !last!.endsWith(")") ||
    words.includes(null)
  ) {
    return null;
  }
  const stripped = [...(words as string[])];
  stripped[0] = first.slice(1);
  stripped[stripped.length - 1] = stripped[stripped.length - 1]!.slice(0, -1);
  return stripped.slice(
    stripped[0] === "" ? 1 : 0,
    stripped[stripped.length - 1] === "" ? -1 : stripped.length,
  );
};

// Whether a word ends with a backslash that escapes whatever follows it.
const escapesNext = (text: string): boolean => /(?:^|[^\\])(?:\\\\)*\\$/.test(text);

// Prettier trims the space before a line break, so a word that ends in an
// escaped space must not be followed by a breakable separator.
const escapesTrailingSpace = (text: string): boolean =>
  /[ \t]$/.test(text) && escapesNext(text.slice(0, -1));

// The terminator rides on the last parameter so the fill measures it.
const printArgs = (
  args: readonly (Word | Comment)[],
  options: NginxParserOptions,
  terminator: string,
): Doc => {
  const parts: Doc[] = [];
  args.forEach((arg, index) => {
    if (index > 0) {
      const previous = args[index - 1]!;
      parts.push(
        previous.type === "comment"
          ? hardline
          : options.wrapParameters && !escapesTrailingSpace(previous.text)
            ? line
            : " ",
      );
    }
    const text = replaceEndOfLine(arg.text);
    parts.push(index === args.length - 1 ? [text, terminator] : text);
  });
  return align(options.continuationIndent, fill(parts));
};

const printBlock = (path: Path, print: Print): Doc => {
  const node = path.node as Block;
  const parts: Doc[] = [];
  if (node.openingComment !== null) {
    parts.push(" ", node.openingComment);
  }
  if (node.body.length > 0) {
    parts.push(indent([hardline, printStatements(path, print)]), hardline);
  } else if (node.openingComment !== null) {
    parts.push(hardline);
  }
  return parts;
};

// OpenResty rejects a block whose body is empty, but accepts a single space.
const printLuaBody = (lines: readonly LuaLine[]): Doc => {
  if (lines.length === 0) {
    return " ";
  }
  const parts: Doc[] = [];
  lines.forEach((line, index) => {
    if (index > 0) {
      parts.push(line.literal ? literalline : hardline);
    }
    parts.push(line.text);
  });
  return [indent([hardline, parts]), hardline];
};

const padding = (path: Path, options: NginxParserOptions): number => {
  const node = path.node as Directive;
  if (!options.alignDirectives || node.block !== null) {
    return 1;
  }
  const depth = path.ancestors.filter((ancestor) => ancestor.type === "block").length;
  const column = nameColumn(node, depth, options);
  if (column === null) {
    return 1;
  }
  const width = options.alignUniversally
    ? widestName(path.root as Config, 0, options, true)
    : widestName(path.parent as Config | Block, depth, options, false);
  return width - column + 1;
};

// Names ending past the middle of the line stay out of the alignment.
const nameColumn = (
  directive: Directive,
  depth: number,
  options: NginxParserOptions,
): number | null => {
  if (
    directive.block !== null ||
    directive.args.length === 0 ||
    directive.name.text.includes("\n")
  ) {
    return null;
  }
  const column = depth * options.tabWidth + getStringWidth(directive.name.text);
  return column <= options.printWidth / 2 ? column : null;
};

// A `# prettier-ignore` among the comments leading a statement applies to it.
const isIgnored = (statements: readonly Statement[], index: number): boolean => {
  for (let i = index - 1; i >= 0; i--) {
    const previous = statements[i]!;
    if (previous.type !== "comment") {
      return false;
    }
    if (PRETTIER_IGNORE.test(previous.text)) {
      return true;
    }
  }
  return false;
};

const widths = new WeakMap<NginxParserOptions, WeakMap<Config | Block, number>>();

const widestName = (
  container: Config | Block,
  depth: number,
  options: NginxParserOptions,
  recurse: boolean,
): number => {
  let cache = widths.get(options);
  if (cache === undefined) {
    cache = new WeakMap();
    widths.set(options, cache);
  }
  let width = cache.get(container);
  if (width === undefined) {
    width = 0;
    for (const [index, statement] of container.body.entries()) {
      if (statement.type !== "directive" || isIgnored(container.body, index)) {
        continue;
      }
      const column = nameColumn(statement, depth, options);
      if (column !== null) {
        width = Math.max(width, column);
      } else if (recurse && statement.block?.type === "block") {
        width = Math.max(width, widestName(statement.block, depth + 1, options, recurse));
      }
    }
    cache.set(container, width);
  }
  return width;
};
