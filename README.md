<div align="center">
    <img src="./.github/images/prettier-plugin-nginx.png" alt="Banner">
</div>
<h1 align="center">Prettier for NGINX</h1>

<hr>

A [Prettier](https://prettier.io) plugin that formats
[NGINX configuration files](https://nginx.org/en/docs/beginners_guide.html#conf_structure),
including [OpenResty](https://openresty.org) `*_by_lua_block` directives. It is
written in TypeScript, depends only on Prettier, and needs Prettier 3.6 or
later.

## Getting Started

Install [Prettier](https://prettier.io/docs/install) and the plugin:

```shell
npm install --save-dev prettier prettier-plugin-nginx
```

Register the plugin in your
[Prettier configuration](https://prettier.io/docs/configuration):

```json
{
  "plugins": ["prettier-plugin-nginx"]
}
```

The plugin formats these files automatically:

- files with the extensions `.nginx`, `.nginxconf` and `.vhost`,
- `nginx.conf`, `mime.types`, `fastcgi_params`, `fastcgi.conf`, `scgi_params`,
  `uwsgi_params`, `proxy_params`, `koi-utf`, `koi-win` and `win-utf`,
- inside a directory named `nginx`: any `.conf` or `.template` file, such as
  `docker/nginx/default.conf`, and any file in a `sites-available`,
  `sites-enabled`, `conf.d` or `snippets` directory, such as
  `/etc/nginx/sites-available/default`, apart from dotfiles, certificates,
  scripts, logs and backups. List anything else that lives there, such as a
  `supervisord.conf`, in `.prettierignore`.

To format other files, assign them the `nginx` parser with an
[override](https://prettier.io/docs/configuration#configuration-overrides):

```json
{
  "plugins": ["prettier-plugin-nginx"],
  "overrides": [
    {
      "files": ["*.conf", "sites-enabled/*"],
      "options": { "parser": "nginx" }
    }
  ]
}
```

Or from the command line:

```shell
npx prettier --write --plugin prettier-plugin-nginx --parser nginx default.conf
```

## Example

A messy file like this...

```nginx
server {
# server definition
listen 443 ssl; listen [::]:443 ssl;
server_name example.com;
location / { proxy_pass http://proxy; proxy_set_header Host $http_host;
proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_read_timeout 1000; }
# end server definition
}
```

...is transformed to this:

```nginx
server {
    # server definition
    listen      443 ssl;
    listen      [::]:443 ssl;
    server_name example.com;

    location / {
        proxy_pass         http://proxy;
        proxy_set_header   Host $http_host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 1000;
    }
    # end server definition
}
```

## Formatting

This plugin, like Prettier, is
[opinionated](https://prettier.io/docs/option-philosophy). The style follows the
configuration examples in the [NGINX documentation](https://nginx.org/en/docs/):

- Blocks are indented by one `tabWidth`, four spaces by default. Block
  directives are separated from their neighbours by a blank line, and a
  single blank line between other statements is kept; blank lines at the
  start or end of a block are not.
- The parameters of the simple directives in a block, or at the top level,
  are aligned to one column. A name that ends beyond the middle of the line stays out of the
  alignment, so one long name does not push everything else to the right.
- Parameters that do not fit within `printWidth` wrap onto continuation
  lines; the first parameter stays on the directive's line.
- Comments stay where they are: on their own line, after a `;`, or after a
  `{` or `}` on the same line. A comment between a directive's parameters
  ends the line it is on, and one right before the `;` or `{` moves after
  it, joining any comment already there.
- Every word is printed exactly as written. Quotes, escapes, regular
  expressions and multi-line strings are never altered, and an `if`
  condition is only re-spaced as `if (...)`, on one line. With `endOfLine`
  set to `crlf`, the line breaks inside multi-line strings change with the
  rest of the file, and a word continued across lines with a backslash would
  be split, so keep the default `lf` for such files. `cr` is refused, since
  NGINX ends comments only at a line feed.
- `*_by_lua_block` bodies are re-indented as a unit; the Lua inside them is
  not otherwise changed, and lines inside `[[...]]` long brackets are kept
  byte for byte. If a Prettier plugin providing a `lua` parser is loaded, the
  Lua is formatted with it instead.
- A `# prettier-ignore` comment on its own line keeps the next statement,
  including a block and its original inner indentation, exactly as written.
  Other comments and blank lines may sit between the two.
- Range formatting (`--range-start`, `--range-end`) is not supported; with
  a range the file is left unchanged.
- `# @format` or `# @prettier` on the first line works with
  [`--require-pragma`](https://prettier.io/docs/options#require-pragma) and
  [`--insert-pragma`](https://prettier.io/docs/options#insert-pragma), and
  `# @noformat` or `# @noprettier` with `--check-ignore-pragma`.

Invalid configuration, such as a directive without its `;`, is reported as a
syntax error with its location; NGINX would reject it too. Template syntax is
not supported: `{{ ... }}` is rejected as a stray brace, and `<% ... %>` is
not detected at all, so it would be merged into the surrounding directive.
envsubst style `${VAR}` references are fine.

## Configuration

The following options are available.

| API Option           | CLI Option              | Default | Description                                                                                  |
| -------------------- | ----------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `printWidth`         | `--print-width`         | `80`    | [Same option as in Prettier](https://prettier.io/docs/options#print-width)                   |
| `tabWidth`           | `--tab-width`           | `4`     | [Same option as in Prettier](https://prettier.io/docs/options#tab-width)                     |
| `useTabs`            | `--use-tabs`            | `false` | [Same option as in Prettier](https://prettier.io/docs/options#tabs)                          |
| `alignDirectives`    | `--align-directives`    | `true`  | Align directive parameters within a block to the same column.                                |
| `alignUniversally`   | `--align-universally`   | `false` | Align all directive parameters within a file to the same column. Requires `alignDirectives`. |
| `wrapParameters`     | `--wrap-parameters`     | `true`  | Wrap parameters to new lines to fit print width.                                             |
| `continuationIndent` | `--continuation-indent` | `2`     | Additional indentation for wrapped lines.                                                    |

Note that `tabWidth` defaults to `4` rather than Prettier's `2`, to match the
NGINX documentation.

## Contributing

Bug reports and pull requests are welcome on
[GitHub](https://github.com/jxddk/prettier-plugin-nginx/issues).

Development needs Node.js 24 (see `.node-version`). `npm test` builds the
plugin and runs the test suite; CI also runs `npm run typecheck` and
`npm run format:check`, and `npm run coverage` reports coverage. The fixtures
under `test/fixtures` are grouped by case; each case holds two example
configurations taken from the NGINX or OpenResty documentation or from
NGINX's `conf/` directory, cited on their first line and cut down to an
excerpt where marked, and one written to break the formatter, next to their
formatted output or expected error. A documented example is named after its
source page or file and its position among that page's configuration
examples. Run
`npm run test:update` after an intentional change to the output.

## License

The package is available as open source under the terms of the
[MIT License](https://opensource.org/licenses/MIT).
