import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Block, Directive, LuaBlock } from "../src/ast.ts";
import { NginxSyntaxError } from "../src/errors.ts";
import { parse } from "../src/parser.ts";

const directive = (text: string, index = 0): Directive => {
  const statement = parse(text).body[index];
  assert.equal(statement?.type, "directive");
  return statement as Directive;
};

const blockOf = (directive: Directive): Block => {
  if (directive.block?.type !== "block") {
    throw new Error(`expected a block after ${directive.name.text}`);
  }
  return directive.block;
};

const luaOf = (directive: Directive): LuaBlock => {
  if (directive.block?.type !== "lua") {
    throw new Error(`expected a Lua block after ${directive.name.text}`);
  }
  return directive.block;
};

const failsAt = (text: string, message: string, line: number, column: number): void => {
  assert.throws(
    () => parse(text),
    (error: unknown) =>
      error instanceof NginxSyntaxError &&
      error.message.startsWith(message) &&
      error.loc.start.line === line &&
      error.loc.start.column === column,
  );
};

describe("parser", () => {
  it("parses an empty config", () => {
    assert.deepEqual(parse(""), { type: "config", body: [], start: 0, end: 0 });
    assert.deepEqual(parse("\n\n").body, []);
  });

  it("parses a simple directive with its words and span", () => {
    assert.deepEqual(directive("listen 80 ssl;"), {
      type: "directive",
      name: { type: "word", text: "listen", start: 0, end: 6 },
      args: [
        { type: "word", text: "80", start: 7, end: 9 },
        { type: "word", text: "ssl", start: 10, end: 13 },
      ],
      block: null,
      trailingComment: null,
      blankLineBefore: false,
      start: 0,
      end: 14,
    });
  });

  it("parses a block directive with nested statements", () => {
    const server = directive("server { listen 80; location / { root html; } }");
    assert.equal(blockOf(server).body.length, 2);
    const location = blockOf(server).body[1] as Directive;
    assert.equal(location.name.text, "location");
    assert.deepEqual(
      location.args.map((arg) => arg.text),
      ["/"],
    );
    assert.equal(blockOf(location).body.length, 1);
    assert.equal(server.end, 47);
  });

  it("attaches comments on the same line as a semicolon or closing brace as trailing comments", () => {
    const text = "listen 80; # trailing\nserver {\n} # after block\nroot html;\n# own line\n";
    const config = parse(text);
    assert.equal(config.body.length, 4);
    const [listen, server, root, comment] = config.body as [
      Directive,
      Directive,
      Directive,
      { text: string },
    ];
    assert.equal(listen.trailingComment, "# trailing");
    assert.equal(listen.end, text.indexOf("\nserver"));
    assert.equal(server.trailingComment, "# after block");
    assert.equal(root.trailingComment, null);
    assert.equal(comment.text, "# own line");
  });

  it("attaches a comment on the opening brace's line to the block", () => {
    const server = directive("server { # php\n listen 80;\n}");
    assert.equal(blockOf(server).openingComment, "# php");
    assert.equal(blockOf(server).body.length, 1);
    const events = directive("events {\n# not opening\n}");
    assert.equal(blockOf(events).openingComment, null);
    assert.equal(blockOf(events).body[0]?.type, "comment");
  });

  it("records whether a blank line precedes each statement", () => {
    const config = parse("a;\nb;\n\nc;\n\n\n# d\ne; # f\n\ng { h; }");
    assert.deepEqual(
      config.body.map((statement) => statement.blankLineBefore),
      [false, false, true, true, false, true],
    );
    assert.equal(blockOf(config.body[5] as Directive).body[0]?.blankLineBefore, false);
  });

  it("ignores newlines inside quoted words when looking for blank lines", () => {
    const config = parse("a 'x\n\ny';\nb;");
    assert.equal(config.body[1]?.blankLineBefore, false);
  });

  it("keeps comments between arguments in place", () => {
    const listen = directive("listen # why\n  80;");
    assert.deepEqual(
      listen.args.map((arg) => [arg.type, arg.text]),
      [
        ["comment", "# why"],
        ["word", "80"],
      ],
    );
    const ret = directive("return 200 # done\n;");
    assert.deepEqual(
      ret.args.map((arg) => arg.type),
      ["word"],
    );
    assert.equal(ret.trailingComment, "# done");
  });

  it("reads *_by_lua_block bodies as Lua", () => {
    const content = directive("content_by_lua_block {\n    local t = { a = [[}]] }\n}");
    assert.deepEqual(content.block, {
      type: "lua",
      source: "\n    local t = { a = [[}]] }\n",
      longBrackets: [{ start: 21, end: 26 }],
      start: 21,
      end: 52,
    });
    const set = directive("set_by_lua_block $x { return 1 } # c");
    assert.deepEqual(
      set.args.map((arg) => arg.text),
      ["$x"],
    );
    assert.equal(luaOf(set).source, " return 1 ");
    assert.equal(set.trailingComment, "# c");
  });

  it("does not treat other directives as Lua", () => {
    const js = directive("js_content { x; }");
    assert.equal(blockOf(js).body.length, 1);
    const lua = directive("content_by_lua 'x';");
    assert.equal(lua.block, null);
  });

  it("rejects a closing brace without an opening one", () => {
    failsAt("}", 'unexpected "}"', 1, 1);
    failsAt("a;\n  }", 'unexpected "}"', 2, 3);
  });

  it("rejects a closing brace before a directive is terminated", () => {
    failsAt("server { listen 80 }", 'unexpected "}"', 1, 20);
    failsAt("server {\n    ...\n}", 'unexpected "}"', 3, 1);
  });

  it("rejects a stray semicolon or opening brace", () => {
    failsAt(";", 'unexpected ";"', 1, 1);
    failsAt("a; ;", 'unexpected ";"', 1, 4);
    failsAt("{", 'unexpected "{"', 1, 1);
    failsAt("server {\n  {\n}", 'unexpected "{"', 2, 3);
  });

  it("rejects an unterminated directive, pointing at its start", () => {
    failsAt("a b\n", 'unexpected end of file, expecting ";" or "}"', 1, 1);
    failsAt("server {\n    listen 80\n", 'unexpected end of file, expecting ";" or "}"', 2, 5);
  });

  it("rejects an unclosed block", () => {
    failsAt(
      "http {\n  server {\n    listen 80;\n  }\n",
      'unexpected end of file, expecting "}"',
      1,
      6,
    );
  });

  it("rejects an unclosed Lua block", () => {
    failsAt(
      "content_by_lua_block {\n  local t = {\n",
      'unexpected end of file, expecting "}" closing the Lua block',
      1,
      22,
    );
  });
});
