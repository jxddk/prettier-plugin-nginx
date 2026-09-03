import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { format } from "./helpers.ts";

const checks = async (input: string, expected: string, options = {}): Promise<void> => {
  const output = await format(input, options);
  assert.equal(output, expected);
  assert.equal(await format(output, options), expected, "not idempotent");
};

describe("options", () => {
  it("honours tabWidth", async () => {
    await checks("server{listen 80;}", "server {\n  listen 80;\n}\n", { tabWidth: 2 });
  });

  it("honours continuationIndent, including zero", async () => {
    const input = "server_name a.example.com b.example.com c.example.com d.example.com;";
    await checks(
      input,
      "server_name a.example.com b.example.com\n  c.example.com d.example.com;\n",
      { printWidth: 40 },
    );
    await checks(input, "server_name a.example.com b.example.com\nc.example.com d.example.com;\n", {
      printWidth: 40,
      continuationIndent: 0,
    });
  });

  it("stops aligning a name exactly when it ends past the middle of the line", async () => {
    const input = "a 1;\nabcdefghijklmnopqrstuvwxyz 2;";
    await checks(input, "a                          1;\nabcdefghijklmnopqrstuvwxyz 2;\n", {
      printWidth: 52,
    });
    await checks(input, "a 1;\nabcdefghijklmnopqrstuvwxyz 2;\n", { printWidth: 51 });
  });

  it("ignores alignUniversally when alignDirectives is off", async () => {
    await checks("listen 80;\nserver_name x;", "listen 80;\nserver_name x;\n", {
      alignDirectives: false,
      alignUniversally: true,
    });
  });
});

describe("if directives", () => {
  it("keeps the parenthesis detached from a quoted first operand", async () => {
    await checks('if ( "$slow" ) { return 503; }', 'if ( "$slow" ) {\n    return 503;\n}\n');
    await checks('if ( "$a" != "b" ) { return 1; }', 'if ( "$a" != "b" ) {\n    return 1;\n}\n');
    await checks('if ($a != "b" ) { return 1; }', 'if ($a != "b") {\n    return 1;\n}\n');
    await checks('if ( "$x" = y\\) { return 1; }', 'if ( "$x" = y\\) {\n    return 1;\n}\n');
    await checks('if ( "$x" = y\\\\ ) { return 1; }', 'if ( "$x" = y\\\\ ) {\n    return 1;\n}\n');
  });
});

describe("wrapping", () => {
  it("counts the terminator when deciding whether a line fits", async () => {
    const fits =
      "add_header Content-Security-Policy \"default-src 'self'; script-src 'self' http\";";
    await checks(fits, `${fits}\n`);
    await checks(
      `${fits.slice(0, -2)}s";`,
      "add_header Content-Security-Policy\n  \"default-src 'self'; script-src 'self' https\";\n",
    );
    await checks("aaa bbbb cccccccccc { }", "aaa bbbb\n  cccccccccc {}\n", { printWidth: 20 });
    await checks("aaa bbbb ccccccccc { }", "aaa bbbb ccccccccc {}\n", { printWidth: 20 });
  });
});

describe("escaped spaces", () => {
  it("never breaks the line after a word that ends in an escaped space", async () => {
    await checks(
      "add_header X /srv/ppp\\  zzzzzzzzzzzzzzzzz;",
      "add_header X\n  /srv/ppp\\  zzzzzzzzzzzzzzzzz;\n",
      { printWidth: 20 },
    );
    await checks(
      "add_header X /srv/pp\\\\ zzzzzzzzzzzzzzzzz;",
      "add_header X\n  /srv/pp\\\\\n  zzzzzzzzzzzzzzzzz;\n",
      { printWidth: 20 },
    );
  });
});

describe("alignment", () => {
  it("does not align a name that spans lines", async () => {
    await checks('"a\nb" c;\nlisten 80;', '"a\nb" c;\nlisten 80;\n');
  });

  it("measures names by display width", async () => {
    await checks(
      "map $h $x {\n日本語.example.com 1;\na.example.com 2;\n}",
      "map $h $x {\n    日本語.example.com 1;\n    a.example.com      2;\n}\n",
    );
  });
});

describe("Lua blocks", () => {
  it("prints an empty body as a single space, which OpenResty accepts", async () => {
    await checks("content_by_lua_block {}", "content_by_lua_block { }\n");
    await checks("content_by_lua_block {\n\n}", "content_by_lua_block { }\n");
  });

  it("keeps trailing whitespace on the line that opens a long bracket", async () => {
    await checks(
      "content_by_lua_block {\n    local s = [[x   \ny]]   \n    local t = [[   \n z ]]\n}",
      "content_by_lua_block {\n    local s = [[x   \ny]]\n    local t = [[   \n z ]]\n}\n",
    );
  });
});

describe("prettier-ignore", () => {
  it("reaches past other comments and blank lines leading the statement", async () => {
    await checks(
      "# prettier-ignore\n# why\nlisten   80;\nroot html;",
      "# prettier-ignore\n# why\nlisten   80;\nroot html;\n",
    );
    await checks("# prettier-ignore\n\nlisten   80;", "# prettier-ignore\n\nlisten   80;\n");
  });

  it("keeps the next directive verbatim, block and trailing comment included", async () => {
    await checks(
      "listen 80;\n# prettier-ignore\nserver_name   a   b; # keep\n# prettier-ignore\nmap $a $b {\n  x    1;\n    y 2;\n}\nroot html;",
      "listen 80;\n# prettier-ignore\nserver_name   a   b; # keep\n\n# prettier-ignore\nmap $a $b {\n  x    1;\n    y 2;\n}\n\nroot   html;\n",
    );
  });
});

describe("pragmas", () => {
  it("formats only files with a pragma when requirePragma is set", async () => {
    const options = { requirePragma: true };
    await checks("listen   80;", "listen   80;", options);
    await checks("# @format\nlisten   80;", "# @format\nlisten 80;\n", options);
    await checks("\n\n  #@prettier  \nlisten   80;", "#@prettier\nlisten 80;\n", options);
    await checks("# intro\n# @format\nlisten   80;", "# intro\n# @format\nlisten   80;", options);
  });

  it("inserts a pragma when insertPragma is set", async () => {
    await checks("listen   80;", "# @format\n\nlisten 80;\n", { insertPragma: true });
    await checks("# @format\nlisten   80;", "# @format\nlisten 80;\n", { insertPragma: true });
  });

  it("leaves files with an ignore pragma alone when checkIgnorePragma is set", async () => {
    const options = { checkIgnorePragma: true };
    await checks("# @noformat\nlisten   80;", "# @noformat\nlisten   80;", options);
    await checks("# @noprettier\nlisten   80;", "# @noprettier\nlisten   80;", options);
    await checks("# @format\nlisten   80;", "# @format\nlisten 80;\n", options);
  });
});

describe("files", () => {
  it("keeps the carriage returns in the fixture that exercises them", async () => {
    const fixture = new URL("./fixtures/blocks/contrived.conf", import.meta.url);
    assert.ok((await import("node:fs")).readFileSync(fixture, "utf8").includes("\r\n"));
  });

  it("prints nothing for an empty or blank file", async () => {
    await checks("", "");
    await checks("\n\n  \t\n", "");
  });

  it("writes the configured endOfLine, inside multi-line strings too", async () => {
    await checks("a 'x\ny';\r\nb 2;", "a 'x\r\ny';\r\nb 2;\r\n", { endOfLine: "crlf" });
    await checks("a 1;\r\nb 2;\r\n", "a 1;\r\nb 2;\r\n", { endOfLine: "auto" });
  });

  it("formats the example from the README", async () => {
    await checks(
      "server {\n# server definition\nlisten 443 ssl; listen [::]:443 ssl;\nserver_name example.com;\nlocation / { proxy_pass http://proxy; proxy_set_header Host $http_host;\nproxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\nproxy_set_header X-Forwarded-Proto $scheme;\nproxy_read_timeout 1000; }\n# end server definition\n}",
      "server {\n    # server definition\n    listen      443 ssl;\n    listen      [::]:443 ssl;\n    server_name example.com;\n\n    location / {\n        proxy_pass         http://proxy;\n        proxy_set_header   Host $http_host;\n        proxy_set_header   X-Real-IP $remote_addr;\n        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header   X-Forwarded-Proto $scheme;\n        proxy_read_timeout 1000;\n    }\n    # end server definition\n}\n",
    );
  });
});
