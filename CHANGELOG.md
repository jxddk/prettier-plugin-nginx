# Changelog

## 2.0.0

A rewrite for Prettier 3, with a parser that follows NGINX's own lexer.

### Breaking changes

- Requires Prettier 3.6 and Node.js 18 or later.
- The package is published as both ES and CommonJS modules, and no longer
  ships its TypeScript sources.
- The repository moved to `jxddk/prettier-plugin-nginx`.
- A single blank line between statements is preserved; longer runs collapse
  to one. ([#11](https://github.com/jxddk/prettier-plugin-nginx/issues/11))
- Files end with a newline, unless they are empty.
  ([#8](https://github.com/jxddk/prettier-plugin-nginx/issues/8))
- Empty blocks print as `{}` on one line, or `{ }` for a Lua block, which
  OpenResty requires to be non-empty.
- Directives without parameters no longer receive alignment padding
  (`ip_hash;` instead of `ip_hash ;`).
- Directive names that end beyond the middle of the line are left out of
  the alignment, so one long name, such as those in `mime.types`, no longer
  pushes every other parameter to the right margin.
- `if` conditions are printed as `if (...)` with single spaces.
- `continuationIndent: 0` is respected instead of falling back to `2`.
- Invalid configuration is rejected with a syntax error, including its line
  and column, rather than being silently mangled.
- `endOfLine: "cr"` is refused, because NGINX ends comments only at a line
  feed.

### Features

- `*_by_lua_block` directives from lua-nginx-module and
  stream-lua-nginx-module are recognised and their bodies re-indented,
  following the OpenResty block scanner. When a Prettier plugin providing a
  `lua` parser is loaded, the Lua is formatted with it.
  ([#2](https://github.com/jxddk/prettier-plugin-nginx/issues/2))
- `nginx.conf`, `mime.types`, `fastcgi_params`, `fastcgi.conf`,
  `scgi_params`, `uwsgi_params`, `proxy_params`, `koi-utf`, `koi-win`,
  `win-utf` and `.vhost` files are formatted automatically, as are `.conf`
  and `.template` files inside an `nginx` directory and the files in any
  `sites-available`, `sites-enabled`, `conf.d` or `snippets` directory
  below it.
  ([#10](https://github.com/jxddk/prettier-plugin-nginx/issues/10),
  [#9](https://github.com/jxddk/prettier-plugin-nginx/pull/9))
- `# prettier-ignore` keeps the next statement verbatim.
- `# @format` joins `# @prettier` as a pragma for `--require-pragma`, and
  `--insert-pragma` and `--check-ignore-pragma` (`# @noformat`,
  `# @noprettier`) are supported.
- Comments between a directive's parameters are kept.

### Fixes

- Quoted strings spanning several lines are kept verbatim instead of being
  dropped. ([#5](https://github.com/jxddk/prettier-plugin-nginx/issues/5))
- `#` inside a word (`location /a#b`) is no longer treated as a comment.
- `}` inside a word and `${VAR}` references are handled as NGINX does.
- Quoted strings containing `{`, `;` or `#` are handled correctly.
- The `tabWidth` default of 4 is documented.
  ([#7](https://github.com/jxddk/prettier-plugin-nginx/issues/7))

### Internal

- TypeScript 7 with strict settings; tests run on `node:test` with no other
  development dependencies.
  ([#6](https://github.com/jxddk/prettier-plugin-nginx/pull/6))
- The test fixtures are grouped by case: two examples per case taken from
  the nginx.org documentation, the OpenResty READMEs or NGINX's `conf/`
  directory, cited on their first line and cut to an excerpt where marked,
  and one written to break the formatter. Every fixture that parses
  is also checked for idempotence and for preserving the parsed configuration
  across five option profiles.

## 1.0.3

- Handle `${ENV}` references correctly.
