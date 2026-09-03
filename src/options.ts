import type { SupportOptions } from "prettier";

export interface NginxOptions {
  readonly alignDirectives: boolean;
  readonly alignUniversally: boolean;
  readonly wrapParameters: boolean;
  readonly continuationIndent: number;
}

export const options: SupportOptions = {
  alignDirectives: {
    type: "boolean",
    category: "NGINX",
    default: true,
    description: "Align directive parameters within a block to the same column.",
  },
  alignUniversally: {
    type: "boolean",
    category: "NGINX",
    default: false,
    description:
      "Align all directive parameters within a file to the same column. Requires alignDirectives.",
  },
  wrapParameters: {
    type: "boolean",
    category: "NGINX",
    default: true,
    description: "Wrap parameters to new lines to fit print width.",
  },
  continuationIndent: {
    type: "int",
    category: "NGINX",
    default: 2,
    range: { start: 0, end: Number.POSITIVE_INFINITY, step: 1 },
    description: "Additional indentation for wrapped lines.",
  },
};

export const defaultOptions = {
  tabWidth: 4,
};
