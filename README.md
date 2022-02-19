<div align="center">
    <img src="./.github/images/prettier-plugin-nginx.png" alt="Banner">
</div>
<h1 align="center">Prettier for NGINX</h1>

<hr>

This TypeScript module is a plugin for [Prettier](https://prettier.io) that
beautifies
[NGINX configuration files](https://www.nginx.com/resources/wiki/start/topics/examples/full/).
It is written in [TypeScript](https://www.typescriptlang.org/), and depends only
on Prettier.

## Getting Started

[Install Prettier](https://prettier.io/docs/en/install.html), and then install
this plugin from [npm](https://www.npmjs.com/package/prettier-plugin-nginx):

```shell
npm install -g prettier-plugin-nginx
```

This plugin is configured to run on files with the extension `.nginx` or
`.nginxconfig`. For plugin-level configuration, see
[Configuration](#configuration).

## Configuration

This plugin, like Prettier, is
[opinionated](https://prettier.io/docs/en/option-philosophy.html). The following
options are available, with defaults modelled after the configuration examples
in the [NGINX docs](https://nginx.org/en/docs/faq.html).

| API Option           | CLI Option              | Default | Description                                                                        |
| -------------------- | ----------------------- | ------- | ---------------------------------------------------------------------------------- |
| `printWidth`         | `--print-width`         |         | [Same option as in Prettier](https://prettier.io/docs/en/options.html#print-width) |
| `tabWidth`           | `--tab-width`           |         | [Same option as in Prettier](https://prettier.io/docs/en/options.html#tab-width)   |
| `useTabs`            | `--use-tabs`            |         | [Same option as in Prettier](https://prettier.io/docs/en/options.html#tabs)        |
| `alignDirectives`    | `--align-directives`    | `true`  | Align directive parameters within a block to the same column.                      |
| `alignUniversally`   | `--align-universally`   | `false` | Align all directive parameters within a file to the same column.                   |
| `wrapParameters`     | `--wrap-parameters`     | `true`  | Wrap parameters to new lines to fit print width.                                   |
| `continuationIndent` | `--continuation-indent` | `2`     | Additional indentation for wrapped lines.                                          |

## Contributing

Bug reports and pull requests are welcome on
[GitHub](https://github.com/joedeandev/prettier-plugin-nginx/issues).

## License

The package is available as open source under the terms of the
[MIT License](https://opensource.org/licenses/MIT).
