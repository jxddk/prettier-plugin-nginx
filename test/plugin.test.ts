import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import plugin from "../src/index.ts";
import { format, massaged } from "./helpers.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const inferredParser = async (file: string): Promise<string | null> =>
  (await prettier.getFileInfo(file, { plugins: [plugin] })).inferredParser;

describe("language detection", () => {
  it("recognises the conventional extensions", async () => {
    for (const file of ["a.nginx", "b.nginxconf", "c.vhost", "/srv/site.NGINX"]) {
      assert.equal(await inferredParser(file), "nginx", file);
    }
  });

  it("recognises the files nginx ships with", async () => {
    for (const file of [
      "nginx.conf",
      "/etc/nginx/mime.types",
      "fastcgi_params",
      "fastcgi.conf",
      "scgi_params",
      "uwsgi_params",
      "proxy_params",
      "koi-utf",
      "koi-win",
      "win-utf",
    ]) {
      assert.equal(await inferredParser(file), "nginx", file);
    }
  });

  it("recognises config and site files inside an nginx directory", async () => {
    for (const file of [
      "/etc/nginx/sites-available/default",
      "/etc/nginx/sites-enabled/example.com",
      "docker/nginx/default.conf",
      "nginx/conf.d/app.conf",
      "NGINX\\templates\\default.conf.template",
      "nginx/snippets/ssl",
      "nginx/vhosts/conf.d/api",
      "/etc/nginx/sites-available/example.com.disabled",
    ]) {
      assert.equal(await inferredParser(file), "nginx", file);
    }
  });

  it("leaves other files alone, including neighbours of nginx configs", async () => {
    for (const file of [
      "default.conf",
      "/etc/apache2/sites-available/default",
      "nginx",
      "my-nginx/x.conf",
      "nginx/README.md",
      "nginx.md",
      "nginx/Dockerfile",
      "docker/nginx/entrypoint.sh",
      "nginx/.env",
      "/etc/nginx/ssl/cert.pem",
      "nginx/htpasswd",
      "/etc/nginx/sites-available/.gitkeep",
      "nginx/conf.d/server.pem",
      "nginx/sites-enabled/app.conf.bak",
      "nginx/conf.d/entrypoint.sh",
    ]) {
      assert.notEqual(await inferredParser(file), "nginx", file);
    }
  });
});

describe("plugin metadata", () => {
  it("exposes its options with their defaults", async () => {
    const { options, languages } = await prettier.getSupportInfo({ plugins: [plugin] });
    const own = Object.fromEntries(
      options
        .filter((option) => option.category === "NGINX")
        .map((option) => [option.name, option.default]),
    );
    assert.deepEqual(own, {
      alignDirectives: true,
      alignUniversally: false,
      wrapParameters: true,
      continuationIndent: 2,
    });
    assert.equal(languages.find((language) => language.name === "nginx")?.linguistLanguageId, 248);
  });

  it("defaults tabWidth to four", async () => {
    assert.equal(await format("a{b c;}"), "a {\n    b c;\n}\n");
  });
});

describe("built packages", () => {
  const sample = "server{listen 80;server_name x;}";
  const expected = "server {\n    listen      80;\n    server_name x;\n}\n";

  it("formats through the ESM build", async () => {
    const esm = path.join(root, "dist/esm/index.js");
    assert.equal(await prettier.format(sample, { parser: "nginx", plugins: [esm] }), expected);
    const loaded = await import(esm);
    assert.equal(loaded.default.parsers.nginx.astFormat, "nginx");
  });

  it("formats through the CommonJS build", async () => {
    const cjs = path.join(root, "dist/cjs/index.js");
    assert.equal(await prettier.format(sample, { parser: "nginx", plugins: [cjs] }), expected);
    const loaded = createRequire(import.meta.url)(cjs);
    assert.equal(loaded.parsers.nginx.astFormat, "nginx");
    assert.equal(await prettier.format(sample, { parser: "nginx", plugins: [loaded] }), expected);
  });
});

describe("embedded Lua", () => {
  const upperLua: prettier.Plugin<{ text: string }> = {
    parsers: {
      lua: {
        parse: (text) => ({ text }),
        astFormat: "upper-lua",
        locStart: () => 0,
        locEnd: (node) => node.text.length,
      },
    },
    printers: { "upper-lua": { print: (path) => path.node.text.trim().toUpperCase() } },
  };

  it("hands Lua blocks to a Lua parser when one is available", async () => {
    const output = await prettier.format(
      "location / {\n  content_by_lua_block {\n    ngx.say('hi') -- {\n  }\n}",
      { parser: "nginx", plugins: [plugin, upperLua] },
    );
    assert.equal(
      output,
      "location / {\n    content_by_lua_block {\n        NGX.SAY('HI') -- {\n    }\n}\n",
    );
  });

  it("does not hand over empty or ignored Lua blocks", async () => {
    const output = await prettier.format(
      "content_by_lua_block {}\n# prettier-ignore\ncontent_by_lua_block { x }",
      { parser: "nginx", plugins: [plugin, upperLua] },
    );
    assert.equal(
      output,
      "content_by_lua_block { }\n\n# prettier-ignore\ncontent_by_lua_block { x }\n",
    );
  });
});

describe("massaged AST", () => {
  it("reads words as nginx does, so quoting and escapes are compared by value", async () => {
    assert.equal(await massaged('a "b\\"c" \'d\';'), await massaged('a b\\"c d;'));
    assert.notEqual(await massaged('a "b";'), await massaged("a b c;"));
    assert.notEqual(await massaged('if ( "$slow" ) {}'), await massaged('if ("$slow") {}'));
    assert.notEqual(await massaged('if ( $a = "" ) {}'), await massaged("if ( $a = ) {}"));
  });

  it("ignores layout and the plugin's own normalisations", async () => {
    assert.equal(await massaged("if ( $x ) {}"), await massaged("if ($x) {}"));
    assert.equal(await massaged("a 1;\n\n\nb 2;"), await massaged("a 1; b 2;"));
    assert.equal(
      await massaged("x_by_lua_block { a() }"),
      await massaged("x_by_lua_block { b() }"),
    );
    assert.notEqual(await massaged("if $x {}"), await massaged("if ($x) {}"));
  });

  it("agrees with the formatter, as Prettier's --debug-check requires", async () => {
    const input =
      "if ( $request_method = POST ) { return 405; }\nlocation / { x_by_lua_block { local t = {\n  a = [[\n  b ]] } } }";
    assert.equal(await massaged(await format(input)), await massaged(input));
  });
});

describe("cursor tracking", () => {
  it("maps the cursor into the formatted text without a whole-file diff", async () => {
    const input = "server {\n    listen    80;\n    server_name  x;\n}\n";
    const { formatted, cursorOffset } = await prettier.formatWithCursor(input, {
      parser: "nginx",
      plugins: [plugin],
      cursorOffset: input.indexOf("80") + 1,
    });
    assert.equal(cursorOffset, formatted.indexOf("80") + 1);
  });
});

describe("line endings", () => {
  it("refuses to write bare carriage returns, which would comment out the file", async () => {
    await assert.rejects(format("# c\nlisten 80;\n", { endOfLine: "cr" }), /endOfLine "cr"/);
    await assert.rejects(
      format("# c\nadd_header X 'a\rb';\nlisten 80;\n", { endOfLine: "auto" }),
      /endOfLine "cr"/,
    );
    assert.equal(await format("a 1;\r\nb 2;\r\n", { endOfLine: "auto" }), "a 1;\r\nb 2;\r\n");
  });
});

describe("errors", () => {
  it("reports syntax errors with a location Prettier can frame", async () => {
    await assert.rejects(format("server {\n  listen 80\n}"), (error: unknown) => {
      assert.ok(error instanceof SyntaxError);
      assert.match(error.message, /unexpected "}"/);
      assert.deepEqual((error as unknown as { loc: unknown }).loc, {
        start: { line: 3, column: 1 },
      });
      return true;
    });
  });
});
