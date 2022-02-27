import {
  AstPath,
  Doc,
  Parser,
  ParserOptions,
  Printer,
  RequiredOptions,
} from "prettier";
import { builders } from "prettier/doc";

const newline = builders.hardline;

export interface NginxOptions extends RequiredOptions, ParserOptions {
  alignDirectives?: boolean;
  alignUniversally?: boolean;
  wrapParameters?: boolean;
  continuationIndent?: number;
}

export const options = {
  alignDirectives: {
    type: "boolean",
    category: "nginx",
    default: true,
    description:
      "Align directive parameters within a block to the same column.",
  },
  alignUniversally: {
    type: "boolean",
    category: "nginx",
    default: false,
    description:
      "Align all directive parameters within a file to the same column.",
  },
  wrapParameters: {
    type: "boolean",
    category: "nginx",
    default: true,
    description: "Wrap parameters to new lines to fit print width.",
  },
  continuationIndent: {
    type: "int",
    category: "nginx",
    default: 2,
    description: "Additional indentation for wrapped lines.",
  },
};

export const defaultOptions = {
  tabWidth: 4,
};

interface ASTNodeInterface {
  start: number;
  end: number;
}

interface ASTBlockNode extends ASTNodeInterface {
  content: ASTNode[];
  type: "main" | "block" | "directive" | "blockdirective";
}

interface ASTContentNode extends ASTNodeInterface {
  type: "name" | "parameter" | "inlinecomment";
  content: string;
}

interface ASTCommentNode extends ASTNodeInterface {
  type: "comment";
  content: string;
}

interface ASTEmptyNode extends ASTNodeInterface {
  type: "semicolon" | "linebreak" | "hardbreak";
  content: undefined;
}

type ASTNode = ASTBlockNode | ASTContentNode | ASTCommentNode | ASTEmptyNode;

export const languages = [
  {
    name: "nginx",
    parsers: ["nginx"],
    extensions: [".nginx", ".nginxconf"],
    linguistLanguageId: 248,
  },
];

export const parsers: { [name: string]: Parser } = {
  nginx: {
    astFormat: "nginx",
    parse: (
      text: string,
      parsers: { [parserName: string]: Parser },
      options: NginxOptions
    ): ASTNode => {
      const parseRecursive = (t: string, rootIndex: number): ASTNode[] => {
        let nodes: ASTNode[] = [];
        let tokenBuffer: [number, string][] = [];
        let insideComment: boolean = false;
        let insideString: "'" | '"' | false = false;
        let skipTo: number | undefined = undefined;

        const breakToken = () => {
          insideComment = false;
          insideString = false;
          if (tokenBuffer.length <= 0) {
            return;
          }
          const start: number = tokenBuffer[0][0] + rootIndex;
          const end: number =
            tokenBuffer[tokenBuffer.length - 1][0] + rootIndex;
          const token: string = tokenBuffer
            .map(([_, c]) => {
              return c;
            })
            .join("");
          tokenBuffer = [];
          if (token === ";") {
            nodes.push({
              type: "semicolon",
              content: undefined,
              start: start,
              end: end,
            });
            return;
          }
          if (token === "\n") {
            if (
              nodes.length > 0 &&
              nodes[nodes.length - 1].type === "linebreak"
            ) {
              return;
            }
            nodes.push({
              type: "linebreak",
              content: undefined,
              start: start,
              end: end,
            });
            return;
          }
          if (token[0] === "#") {
            let commentType: "inlinecomment" | "comment" = "comment";
            if (
              nodes.length > 0 &&
              nodes[nodes.length - 1].type != "linebreak"
            ) {
              commentType = "inlinecomment";
            }
            // if the rootIndex is 0, then this is the main block -
            // if there is no break at the start of a block, and the comment
            // is the first item, then it is an inline comment
            if (rootIndex != 0 && nodes.length === 0) {
              commentType = "inlinecomment";
            }

            nodes.push({
              type: commentType,
              content: token,
              start: start,
              end: end,
            });
            return;
          }
          if (token === "\t" || token === " ") {
            return;
          }
          const semanticTokens: ASTNode[] = nodes.filter((n) => {
            return (
              n.type != "linebreak" &&
              n.type != "inlinecomment" &&
              n.type != "comment"
            );
          });
          if (
            semanticTokens.length === 0 ||
            semanticTokens[semanticTokens.length - 1].type === "semicolon" ||
            semanticTokens[semanticTokens.length - 1].type === "block"
          ) {
            nodes.push({
              type: "name",
              content: token,
              start: start,
              end: end,
            });
            return;
          }
          nodes.push({
            type: "parameter",
            content: token,
            start: start,
            end: end,
          });
        };

        const findParenEnd = (startIndex: number): number => {
          let blockEnd = t.length;
          let parenCount = 0;
          for (let j = startIndex; j < t.length; j++) {
            switch (t[j]) {
              case "{":
                parenCount += 1;
                break;
              case "}":
                parenCount -= 1;
                break;
            }
            if (parenCount === 0) {
              blockEnd = j + 1;
              break;
            }
          }
          return blockEnd;
        };

        for (let i = 0; i < t.length; i++) {
          if (skipTo && i < skipTo) {
            continue;
          }
          const c = t[i];
          if (c === "\r") {
            continue;
          }
          if (c === "\n") {
            breakToken();
            tokenBuffer.push([i, c]);
            breakToken();
            continue;
          }
          if (insideComment) {
            tokenBuffer.push([i, c]);
            continue;
          }
          if (c === "$" && i + 1 < t.length && t[i + 1] === "{") {
            let envVarEnd = findParenEnd(i + 1);
            for (let q = i; q < envVarEnd; q++) {
              tokenBuffer.push([q, t[q]]);
            }
            skipTo = envVarEnd;
            continue;
          }
          if (c === "#") {
            breakToken();
            insideComment = true;
            tokenBuffer.push([i, c]);
            continue;
          }
          if (insideString) {
            if (insideString === c) {
              insideString = false;
            }
            tokenBuffer.push([i, c]);
            continue;
          }
          if (c === "'" || c === '"') {
            insideString = c;
            tokenBuffer.push([i, c]);
            continue;
          }
          if (c === " " || c === "\t") {
            breakToken();
            tokenBuffer.push([i, c]);
            breakToken();
            continue;
          }
          if (c === ";") {
            breakToken();
            tokenBuffer.push([i, c]);
            breakToken();
            continue;
          }
          if (c === "{") {
            breakToken();
            let blockEnd = findParenEnd(i);
            nodes.push({
              type: "block",
              content: parseRecursive(
                t.slice(i + 1, blockEnd + 1),
                rootIndex + i
              ),
              start: i,
              end: blockEnd,
            });
            skipTo = blockEnd;
            continue;
          }
          if (c === "}") {
            continue;
          }
          tokenBuffer.push([i, c]);
        }

        // re-parse nodes to gather directives, remove linebreaks
        nodes = nodes.filter((n) => n.type != "linebreak");
        skipTo = 0;
        let gatheredNodes: ASTNode[] = [];
        for (let i = 0; i < nodes.length; i++) {
          if (i < skipTo) {
            continue;
          }
          const subnode = nodes[i];
          if (subnode.type === "name") {
            let directiveType: "directive" | "blockdirective" = "directive";
            skipTo = i + 1;
            for (let j = i; j < nodes.length; j++) {
              if (nodes[j].type === "semicolon" || nodes[j].type === "block") {
                skipTo = j + 1;
                if (nodes[j].type === "block") {
                  directiveType = "blockdirective";
                }
                if (
                  j + 1 < nodes.length &&
                  nodes[j + 1].type === "inlinecomment"
                ) {
                  skipTo = j + 2;
                }
                break;
              }
            }
            gatheredNodes.push({
              type: directiveType,
              content: nodes.slice(i, skipTo),
              start: subnode.start,
              end: nodes[skipTo - 1].end,
            });
          } else {
            gatheredNodes.push(subnode);
          }
        }

        return gatheredNodes;
      };
      return {
        type: "main",
        start: 0,
        end: text.length,
        content: parseRecursive(text, 0),
      };
    },
    locStart: (node: ASTNode) => {
      return node.start;
    },
    locEnd: (node: ASTNode) => {
      return node.end;
    },
    hasPragma: (text: string) => {
      // TODO: Check all comments before directives, and include @format
      let firstLine: string | null = null;
      text.split(/\r?\n/).some((line) => {
        line = line.replace(" ", "");
        if (line.length > 0) firstLine = line;
        if (line[0]) return firstLine === null;
      });

      return firstLine === "#@prettier";
    },
  },
};

export const printers: { [name: string]: Printer } = {
  nginx: {
    print(
      path: AstPath<ASTNode>,
      options: NginxOptions,
      print: (path: AstPath<ASTNode>) => Doc
    ): Doc[] {
      const root = path.getNode();
      if (!root || root.type != "main") {
        throw Error("Invalid root node");
      }

      // pre-parse the AST to add linebreaks between blocks and directives
      const preparseRecursive = (node: ASTNode) => {
        if (
          node.type != "main" &&
          node.type != "block" &&
          node.type != "directive" &&
          node.type != "blockdirective"
        ) {
          return;
        }
        let insertions: [number, ASTNode][] = [];
        for (let i = 0; i < node.content.length; i++) {
          const subnode = node.content[i];
          if (
            subnode.type === "main" ||
            subnode.type === "block" ||
            subnode.type === "directive" ||
            subnode.type === "blockdirective"
          ) {
            preparseRecursive(subnode);
          }
          if (subnode.type !== "blockdirective") {
            continue;
          }
          // if there is a previous directive, insert a break
          for (let j = i - 1; j >= 0; j--) {
            if (
              node.content[j].type != "comment" &&
              node.content[j].type != "inlinecomment"
            ) {
              let pos: number;
              if (j > 0) {
                pos = node.content[j - 1].end;
              } else {
                pos = 0;
              }
              insertions.push([
                j + 1,
                {
                  type: "hardbreak",
                  content: undefined,
                  start: pos,
                  end: pos,
                },
              ]);
              break;
            }
          }
          // if there is any following element, insert a break
          if (i != node.content.length - 1) {
            let hasExtraElement = false;
            for (
              let j = i + 1;
              j < node.content.length && !hasExtraElement;
              j++
            ) {
              switch (node.content[j].type) {
                case "comment":
                case "inlinecomment":
                  break;
                default:
                  hasExtraElement = true;
              }
            }
            if (hasExtraElement) {
              insertions.push([
                i + 1,
                {
                  type: "hardbreak",
                  content: undefined,
                  start: subnode.end,
                  end: subnode.end,
                },
              ]);
            }
          }
        }

        for (let i = 0; i < insertions.length; i++) {
          const [index, breakNode] = insertions[i];
          node.content.splice(i + index, 0, breakNode);
        }
      };
      preparseRecursive(root);
      const getIndents = (indents: number): string => {
        if (options.useTabs) {
          return "\t".repeat(indents);
        }
        return " ".repeat(options.tabWidth).repeat(indents);
      };
      const getLineLength = (lineDocs: string[]): number => {
        let width = 0;
        for (let i = lineDocs.length - 1; i >= 0; i--) {
          for (let j = lineDocs[i].length - 1; j >= 0; j--) {
            switch (lineDocs[i][j]) {
              case "\t":
                width += options.tabWidth;
                break;
              case "\n":
              case "\r":
                return width;
              default:
                width += 1;
            }
          }
        }
        return width;
      };
      // find length of longest directive, for aligning parameters to columns
      const getNameColEnd = (
        node: ASTNode,
        all: boolean,
        longest: number = 0,
        indents: number = 0
      ): number => {
        indents = Math.max(indents, 0);
        if (node.type === "name") {
          const paramColStart =
            getLineLength([getIndents(indents)]) + node.content.length;
          longest = Math.max(longest, paramColStart);
        }
        if (
          node.type === "main" ||
          node.type === "directive" ||
          node.type === "block" ||
          node.type === "blockdirective"
        ) {
          node.content.forEach((n) => {
            if ((!all && n.type === "block") || n.type === "main") {
              return;
            }
            // block directives don't get aligned
            if (node.type === "blockdirective" && n.type === "name") {
              return;
            }
            longest = Math.max(
              getNameColEnd(
                n,
                all,
                longest,
                node.type === "block" ? indents + 1 : indents
              ),
              longest
            );
          });
        }
        return longest;
      };
      let universalColEnd = 0;
      if (options.alignUniversally && options.alignDirectives) {
        universalColEnd = getNameColEnd(root, true);
      }
      const generateDirectiveDocs = (
        node: ASTBlockNode,
        indentsCount: number,
        blockColEnd: number
      ): string[] => {
        let directiveDocs: string[] = [];

        if (node.content.length <= 0) {
          return [];
        }
        let maxColName: number = 0;
        if (options.alignDirectives) {
          maxColName = blockColEnd;
          if (options.alignUniversally) {
            maxColName = universalColEnd;
          }
        }
        const indents = getIndents(indentsCount);
        directiveDocs.push(indents);
        for (let i = 0; i < node.content.length; i++) {
          const subnode = node.content[i];
          if (subnode.type === "name") {
            if (i != 0) {
              throw Error("Invalid index of name node");
            }
            directiveDocs.push(subnode.content);
            // add column alignment spaces
            let alignmentSpaces = maxColName - getLineLength(directiveDocs) + 1;
            if (node.type != "blockdirective" && alignmentSpaces > 0) {
              directiveDocs.push(" ".repeat(alignmentSpaces));
            }
          } else if (subnode.type === "semicolon") {
            directiveDocs.push(";");
          } else if (subnode.type === "inlinecomment") {
            directiveDocs.push(subnode.content);
            directiveDocs.push("\n");
          } else if (subnode.type === "parameter") {
            if (
              options.wrapParameters &&
              getLineLength(directiveDocs) + subnode.content.length + 1 >
                options.printWidth &&
              i >= 1 &&
              node.content[i - 1].type != "name"
            ) {
              directiveDocs.push("\n");
              directiveDocs.push(indents);
              directiveDocs.push(
                " ".repeat(
                  options.continuationIndent ? options.continuationIndent : 2
                )
              );
            }
            directiveDocs.push(subnode.content);
          } else if (subnode.type === "block") {
            directiveDocs.push("{");
            directiveDocs = directiveDocs.concat(
              generateBlockDocs(subnode, indentsCount + 1, blockColEnd)
            );
            directiveDocs.push("\n");
            directiveDocs.push(indents);
            directiveDocs.push("}");
            if (
              node.content.length > i + 1 &&
              node.content[i + 1].type != "inlinecomment"
            ) {
              directiveDocs.push("\n");
            }
          }
          if (
            i < node.content.length - 1 &&
            node.content[i + 1].type != "semicolon" &&
            (directiveDocs.length > 0
              ? [" ", "\t", undefined].indexOf(directiveDocs.at(-1)?.at(-1)) ===
                -1
              : true)
          ) {
            directiveDocs.push(" ");
          }
        }
        return directiveDocs.flat();
      };
      const generateBlockDocs = (
        node: ASTBlockNode,
        indentsCount: number,
        blockColEnd: number
      ): string[] => {
        let blockDocs: string[] = [];
        if (options.alignDirectives) {
          blockColEnd = getNameColEnd(node, false, 0, indentsCount - 1);
        }
        if (
          !(node.content.length > 0 && node.content[0].type == "inlinecomment")
        ) {
          blockDocs.push("\n");
        }
        node.content.forEach((subnode) => {
          switch (subnode.type) {
            case "inlinecomment":
              blockDocs.push(" ");
              blockDocs.push(subnode.content);
              blockDocs.push("\n");
              break;
            case "comment":
              blockDocs.push("\n");
              blockDocs.push(getIndents(indentsCount) + subnode.content);
              blockDocs.push("\n");
              break;
            case "blockdirective":
              blockDocs = blockDocs.concat(
                generateDirectiveDocs(subnode, indentsCount, 0)
              );
              break;
            case "directive":
              blockDocs = blockDocs.concat(
                generateDirectiveDocs(subnode, indentsCount, blockColEnd)
              );
              blockDocs.push("\n");
              break;
            case "hardbreak":
              blockDocs.push("\r");
              break;
          }
        });
        return blockDocs.flat();
      };
      let docs: Doc[] = [];
      const addToDocs = (item: Doc) => {
        if (item === "\n") {
          if (docs.length > 0 && docs[docs.length - 1] != newline) {
            docs.push(newline);
          }
        } else if (item === "\r") {
          while (
            (docs.length > 0 ? docs[docs.length - 1] : " ") != newline ||
            (docs.length > 1 ? docs[docs.length - 2] : " ") != newline
          ) {
            docs.push(newline);
          }
        } else {
          docs.push(item);
        }
      };
      generateBlockDocs(root, 0, 0).forEach((d) => addToDocs(d));
      return docs;
    },
  },
};
