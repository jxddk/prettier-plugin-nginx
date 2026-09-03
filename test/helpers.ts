import * as prettier from "prettier";
import plugin from "../src/index.ts";

const base = { parser: "nginx", plugins: [plugin] };

export const format = (text: string, options: prettier.Options = {}): Promise<string> =>
  prettier.format(text, { ...base, ...options });

export const profiles: Record<string, prettier.Options> = {
  default: {},
  universal: { alignUniversally: true },
  plain: { alignDirectives: false, wrapParameters: false },
  tabs: { useTabs: true },
  narrow: { printWidth: 40, continuationIndent: 4 },
};

// The AST as Prettier's --debug-check compares it: massaged by the plugin's
// own hook, so it reflects nginx's reading of the config.
type Debug = {
  parse(
    text: string,
    options: prettier.Options,
    dev: { massage: boolean },
  ): Promise<{ ast: unknown }>;
};

export const massaged = async (text: string): Promise<string> =>
  JSON.stringify(
    (await (prettier as unknown as { __debug: Debug }).__debug.parse(text, base, { massage: true }))
      .ast,
  );
