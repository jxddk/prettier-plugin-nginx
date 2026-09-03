import type { Parser, Plugin, Printer } from "prettier";
import type { Node } from "./ast.ts";
import { languages } from "./language.ts";
import { defaultOptions, options } from "./options.ts";
import { parse } from "./parser.ts";
import { hasIgnorePragma, hasPragma } from "./pragma.ts";
import { printer } from "./printer.ts";

export const parsers: Record<string, Parser<Node>> = {
  nginx: {
    astFormat: "nginx",
    parse,
    locStart: (node) => node.start,
    locEnd: (node) => node.end,
    hasPragma,
    hasIgnorePragma,
  },
};

export const printers: Record<string, Printer<Node>> = { nginx: printer };

export { defaultOptions, languages, options };
export type { NginxOptions } from "./options.ts";

const plugin: Plugin<Node> = { languages, parsers, printers, options, defaultOptions };

export default plugin;
