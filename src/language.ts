import type { SupportLanguage } from "prettier";

// Inside an nginx directory: .conf and .template files anywhere, and inside
// the conventional site directories any file that is not a dotfile, a
// certificate, a script or a backup.
const CONFIG_UNDER_NGINX = /(?:^|[\\/])nginx[\\/].*\.(?:conf|template)$/i;
const SITE_UNDER_NGINX =
  /(?:^|[\\/])nginx[\\/](?:.*[\\/])?(?:sites-available|sites-enabled|conf\.d|snippets)[\\/](?![^\\/]*\.(?:pem|crt|cer|key|csr|der|p12|pfx|sh|py|pl|rb|bak|orig|old|tmp|swp|log|txt)$)[^\\/.][^\\/]*$/i;

export const languages: SupportLanguage[] = [
  {
    name: "nginx",
    parsers: ["nginx"],
    extensions: [".nginx", ".nginxconf", ".vhost"],
    filenames: [
      "nginx.conf",
      "mime.types",
      "fastcgi_params",
      "fastcgi.conf",
      "scgi_params",
      "uwsgi_params",
      "proxy_params",
      "koi-utf",
      "koi-win",
      "win-utf",
    ],
    aliases: ["nginx configuration file"],
    linguistLanguageId: 248,
    tmScope: "source.nginx",
    aceMode: "nginx",
    codemirrorMode: "nginx",
    codemirrorMimeType: "text/x-nginx-conf",
    vscodeLanguageIds: ["nginx"],
    isSupported: ({ filepath }) =>
      CONFIG_UNDER_NGINX.test(filepath) || SITE_UNDER_NGINX.test(filepath),
  },
];
