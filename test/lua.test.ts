import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dedent, scanLuaBlock } from "../src/lua.ts";

// The Lua body between the braces of `{...}`, or null when unbalanced.
const body = (text: string): string | null => {
  const scan = scanLuaBlock(text, 1);
  return scan === null ? null : text.slice(1, scan.end);
};

describe("Lua block scanner", () => {
  it("balances nested braces", () => {
    assert.equal(body("{ local t = { a = 1 } }"), " local t = { a = 1 } ");
    assert.equal(body("{ local t = { a = { b = {} } } }"), " local t = { a = { b = {} } } ");
    assert.equal(body("{ x = 1 } trailing }"), " x = 1 ");
  });

  it("ignores braces inside short strings that close on their line", () => {
    assert.equal(body(`{ ngx.say("}") }`), ` ngx.say("}") `);
    assert.equal(body(`{ ngx.say('}') }`), ` ngx.say('}') `);
    assert.equal(body(`{ ngx.say("it's }") }`), ` ngx.say("it's }") `);
    assert.equal(body(`{ ngx.say('a"b}') }`), ` ngx.say('a"b}') `);
    assert.equal(body(`{ ngx.say("a\\"b}") }`), ` ngx.say("a\\"b}") `);
  });

  it("ignores braces inside comments", () => {
    assert.equal(body("{ -- } in a comment\n ngx.say(1) }"), " -- } in a comment\n ngx.say(1) ");
    assert.equal(
      body("{ --[[ } in a block\n comment }} ]] ngx.say(1) }"),
      " --[[ } in a block\n comment }} ]] ngx.say(1) ",
    );
    assert.equal(body("{ ---[[ x }\n }"), " ---[[ x }\n ");
    assert.equal(body("{ local a = 1 --[[x]] local b = 2 }"), " local a = 1 --[[x]] local b = 2 ");
  });

  it("ignores braces inside long bracket strings of any level", () => {
    assert.equal(body("{ local s = [[ } raw }} ]] }"), " local s = [[ } raw }} ]] ");
    assert.equal(body("{ local s = [==[ ]] } ]==] }"), " local s = [==[ ]] } ]==] ");
    assert.equal(body("{ local s = [=[[0-9]+]=] }"), " local s = [=[[0-9]+]=] ");
    assert.equal(body("{ -- unmatched [[ here\n x = 1 }"), " -- unmatched [[ here\n x = 1 ");
    assert.equal(body("{ x = t[1] }"), " x = t[1] ");
    assert.equal(body("{ x = ]] }"), " x = ]] ");
  });

  it("does not treat # or ; specially", () => {
    assert.equal(body("{ local n = #t; if n > 0 then end }"), " local n = #t; if n > 0 then end ");
  });

  it("ends the block early at a brace after a string that does not close on its line, like nginx", () => {
    assert.equal(body('{ local s = "oops }\n more" ngx.say(1) }'), ' local s = "oops ');
    assert.equal(body('{ local s = "a\\\nb}" ngx.say(2) }'), ' local s = "a\\\nb');
    assert.equal(
      body('{ local s = "unterminated\n ngx.say(1) }'),
      ' local s = "unterminated\n ngx.say(1) ',
    );
    assert.equal(body('{ x = "eof'), null);
  });

  it("returns null for unbalanced input", () => {
    assert.equal(body("{ local t = {"), null);
    assert.equal(body("{ [[ never closed }"), null);
    assert.equal(body("{ --[==[ never closed ]] }"), null);
  });

  it("reports the spans of long brackets", () => {
    assert.deepEqual(scanLuaBlock("{ [[a]] --[=[b]=] }", 1)?.longBrackets, [
      { start: 2, end: 7 },
      { start: 10, end: 17 },
    ]);
  });
});

describe("Lua dedent", () => {
  const texts = (source: string): string[] => dedent(source).map((line) => line.text);

  it("returns nothing for an empty or blank body", () => {
    assert.deepEqual(dedent(""), []);
    assert.deepEqual(dedent(" \n\t\n "), []);
  });

  it("removes the common indentation and surrounding blank lines", () => {
    assert.deepEqual(
      texts("\n        local a = 1\n        if a then\n            b()\n        end\n    "),
      ["local a = 1", "if a then", "    b()", "end"],
    );
  });

  it("keeps blank lines inside the body and strips trailing whitespace", () => {
    assert.deepEqual(texts("\n  a()  \n\n  b()\t\n"), ["a()", "", "b()"]);
  });

  it("uses the longest common prefix when tabs and spaces are mixed", () => {
    assert.deepEqual(texts("\n\t  a()\n\t    b()\n\t  c()\n"), ["a()", "  b()", "c()"]);
    assert.deepEqual(texts("\n\ta()\n  b()\n"), ["\ta()", "  b()"]);
  });

  it("does not measure code written on the opening brace's line", () => {
    assert.deepEqual(texts(" a()\n        b()\n    "), ["a()", "b()"]);
    assert.deepEqual(texts(" a() "), ["a()"]);
  });

  it("keeps lines inside long brackets byte for byte", () => {
    const source = "\n    local s = [[\n  first  \n        second\n]]\n    return s\n";
    const scan = scanLuaBlock(`{${source}}`, 1)!;
    const shifted = scan.longBrackets.map((span) => ({ start: span.start - 1, end: span.end - 1 }));
    assert.deepEqual(dedent(source, shifted), [
      { text: "local s = [[", literal: false },
      { text: "  first  ", literal: true },
      { text: "        second", literal: true },
      { text: "]]", literal: true },
      { text: "return s", literal: false },
    ]);
  });
});
