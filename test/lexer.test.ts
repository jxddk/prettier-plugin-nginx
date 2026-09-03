import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NginxSyntaxError } from "../src/errors.ts";
import { Lexer } from "../src/lexer.ts";

type Flat = [string] | [string, string];

const tokens = (text: string): Flat[] => {
  const lexer = new Lexer(text);
  const out: Flat[] = [];
  for (;;) {
    const token = lexer.next();
    if (token.type === "eof") {
      return out;
    }
    out.push(
      token.type === "word" || token.type === "comment" ? [token.type, token.text] : [token.type],
    );
  }
};

const failsAt = (text: string, message: string, line: number, column: number): void => {
  assert.throws(
    () => tokens(text),
    (error: unknown) =>
      error instanceof NginxSyntaxError &&
      error.message.startsWith(message) &&
      error.loc.start.line === line &&
      error.loc.start.column === column,
  );
};

describe("lexer", () => {
  it("splits words on spaces, tabs, carriage returns and newlines", () => {
    assert.deepEqual(tokens("a b\tc\r\nd\n"), [
      ["word", "a"],
      ["word", "b"],
      ["word", "c"],
      ["word", "d"],
    ]);
  });

  it("produces nothing for empty or blank input", () => {
    assert.deepEqual(tokens(""), []);
    assert.deepEqual(tokens(" \t\n\r\n"), []);
  });

  it("treats semicolons and braces as tokens at word boundaries", () => {
    assert.deepEqual(tokens("server{listen 80;}"), [
      ["word", "server"],
      ["openBrace"],
      ["word", "listen"],
      ["word", "80"],
      ["semicolon"],
      ["closeBrace"],
    ]);
  });

  it("keeps a closing brace inside a word, as nginx does", () => {
    assert.deepEqual(tokens("foo}bar;"), [["word", "foo}bar"], ["semicolon"]]);
    assert.deepEqual(tokens("location ~ ^/x{2}$ {"), [
      ["word", "location"],
      ["word", "~"],
      ["word", "^/x"],
      ["openBrace"],
      ["word", "2}$"],
      ["openBrace"],
    ]);
  });

  it("only starts a comment at a word boundary", () => {
    assert.deepEqual(tokens("foo#bar;"), [["word", "foo#bar"], ["semicolon"]]);
    assert.deepEqual(tokens("foo #c\nbar;"), [
      ["word", "foo"],
      ["comment", "#c"],
      ["word", "bar"],
      ["semicolon"],
    ]);
  });

  it("strips trailing whitespace from comments and stops them at the newline", () => {
    assert.deepEqual(tokens("# a comment \t\r\nb;"), [
      ["comment", "# a comment"],
      ["word", "b"],
      ["semicolon"],
    ]);
    assert.deepEqual(tokens("#"), [["comment", "#"]]);
    assert.deepEqual(tokens("a; # trailing"), [
      ["word", "a"],
      ["semicolon"],
      ["comment", "# trailing"],
    ]);
  });

  it("reads quoted words including their quotes", () => {
    assert.deepEqual(tokens(`a "b c" 'd e';`), [
      ["word", "a"],
      ["word", `"b c"`],
      ["word", "'d e'"],
      ["semicolon"],
    ]);
    assert.deepEqual(tokens(`log_format m escape=json '{"a":"$x"}';`), [
      ["word", "log_format"],
      ["word", "m"],
      ["word", "escape=json"],
      ["word", `'{"a":"$x"}'`],
      ["semicolon"],
    ]);
  });

  it("lets quoted words span lines and contain every special character", () => {
    assert.deepEqual(tokens(`a "x\ny";`), [["word", "a"], ["word", `"x\ny"`], ["semicolon"]]);
    assert.deepEqual(tokens(`a "it's a { brace; # not a comment }";`), [
      ["word", "a"],
      ["word", `"it's a { brace; # not a comment }"`],
      ["semicolon"],
    ]);
    assert.deepEqual(tokens(`a "\\d+" "\\\\d+" "\\t\\n\\r\\"\\'\\\\";`), [
      ["word", "a"],
      ["word", `"\\d+"`],
      ["word", `"\\\\d+"`],
      ["word", `"\\t\\n\\r\\"\\'\\\\"`],
      ["semicolon"],
    ]);
    assert.deepEqual(tokens(`a "x\r\ny";`), [["word", "a"], ["word", `"x\r\ny"`], ["semicolon"]]);
  });

  it("treats quotes inside a word literally", () => {
    assert.deepEqual(tokens(`foo"bar";`), [["word", `foo"bar"`], ["semicolon"]]);
    assert.deepEqual(tokens("it's;"), [["word", "it's"], ["semicolon"]]);
  });

  it("allows only a separator, semicolon, brace or closing parenthesis after a quoted word", () => {
    assert.deepEqual(tokens(`a "b");`), [
      ["word", "a"],
      ["word", `"b"`],
      ["word", ")"],
      ["semicolon"],
    ]);
    assert.deepEqual(tokens(`"foo"{`), [["word", `"foo"`], ["openBrace"]]);
    assert.deepEqual(tokens(`"foo"`), [["word", `"foo"`]]);
    failsAt(`a "b"c;`, 'unexpected "c" after quoted string', 1, 6);
    failsAt(`"foo"}`, 'unexpected "}" after quoted string', 1, 6);
  });

  it("rejects unterminated quoted words", () => {
    failsAt(`a "b;\n`, "unterminated quoted string", 1, 3);
    failsAt(`a 'b\\'`, "unterminated quoted string", 1, 3);
  });

  it("escapes the next character with a backslash inside and outside quotes", () => {
    assert.deepEqual(tokens("a b\\ c;"), [["word", "a"], ["word", "b\\ c"], ["semicolon"]]);
    assert.deepEqual(tokens("a b\\\nc;"), [["word", "a"], ["word", "b\\\nc"], ["semicolon"]]);
    assert.deepEqual(tokens("\\#foo;"), [["word", "\\#foo"], ["semicolon"]]);
    assert.deepEqual(tokens("a\\"), [["word", "a\\"]]);
    assert.deepEqual(tokens("a\\;b;"), [["word", "a\\;b"], ["semicolon"]]);
  });

  it("absorbs a brace directly after a dollar sign, so ${VAR} is a word", () => {
    assert.deepEqual(tokens("set $a ${b}${c};"), [
      ["word", "set"],
      ["word", "$a"],
      ["word", "${b}${c}"],
      ["semicolon"],
    ]);
    assert.deepEqual(tokens("listen ${NGINX_PORT};"), [
      ["word", "listen"],
      ["word", "${NGINX_PORT}"],
      ["semicolon"],
    ]);
    assert.deepEqual(tokens("a $ {\n}"), [
      ["word", "a"],
      ["word", "$"],
      ["openBrace"],
      ["closeBrace"],
    ]);
    assert.deepEqual(tokens("a b$ c;"), [
      ["word", "a"],
      ["word", "b$"],
      ["word", "c"],
      ["semicolon"],
    ]);
    assert.deepEqual(tokens("$x{"), [["word", "$x"], ["openBrace"]]);
    assert.deepEqual(tokens("a \\${b};"), [
      ["word", "a"],
      ["word", "\\$"],
      ["openBrace"],
      ["word", "b}"],
      ["semicolon"],
    ]);
  });

  it("tokenizes if conditions the way nginx does", () => {
    assert.deepEqual(tokens("if ($x) {"), [["word", "if"], ["word", "($x)"], ["openBrace"]]);
    assert.deepEqual(tokens("if ( $x ) {"), [
      ["word", "if"],
      ["word", "("],
      ["word", "$x"],
      ["word", ")"],
      ["openBrace"],
    ]);
    assert.deepEqual(tokens(`if ($x !~* "a b") {`), [
      ["word", "if"],
      ["word", "($x"],
      ["word", "!~*"],
      ["word", `"a b"`],
      ["word", ")"],
      ["openBrace"],
    ]);
    assert.deepEqual(tokens("if($x){"), [["word", "if($x)"], ["openBrace"]]);
  });

  it("reads a Lua block body up to its matching brace", () => {
    const lexer = new Lexer("content_by_lua_block { local t = { a = '}' } } rest;");
    assert.equal(lexer.next().type, "word");
    assert.equal(lexer.next().type, "openBrace");
    const block = lexer.luaBlock();
    assert.equal(block.source, " local t = { a = '}' } ");
    assert.deepEqual(block.longBrackets, []);
    assert.equal(block.end, 46);
    assert.deepEqual(lexer.next(), { type: "word", text: "rest", start: 47, end: 51 });
  });

  it("reports long brackets relative to the Lua block body", () => {
    const lexer = new Lexer("x { [[ } ]] }");
    lexer.next();
    lexer.next();
    assert.deepEqual(lexer.luaBlock().longBrackets, [{ start: 1, end: 8 }]);
  });

  it("rejects an unbalanced Lua block", () => {
    const lexer = new Lexer("x {\n local t = {\n");
    lexer.next();
    lexer.next();
    assert.throws(
      () => lexer.luaBlock(),
      (error: unknown) =>
        error instanceof NginxSyntaxError &&
        error.message.startsWith('unexpected end of file, expecting "}" closing the Lua block') &&
        error.loc.start.line === 1 &&
        error.loc.start.column === 3,
    );
  });
});
