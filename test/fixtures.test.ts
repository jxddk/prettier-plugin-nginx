import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { Options } from "prettier";
import { NginxSyntaxError } from "../src/errors.ts";
import { parse } from "../src/parser.ts";
import { format, massaged, profiles } from "./helpers.ts";

// Every case holds two examples copied from the NGINX or OpenResty
// documentation and one written to break the formatter; the first line of
// each says where it comes from. A case may carry an options.json. Run with
// UPDATE_FIXTURES=1 to rewrite the expected outputs.
const update = process.env["UPDATE_FIXTURES"] === "1";
const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const HEADER = /^# (?:source: https?:\/\/\S+(?: \(excerpt\))?|contrived: \S.*)$/;

const expectFile = (file: string, actual: string): void => {
  if (update) {
    fs.writeFileSync(file, actual);
    return;
  }
  assert.ok(
    fs.existsSync(file),
    `missing ${path.relative(fixtures, file)}; run with UPDATE_FIXTURES=1`,
  );
  assert.equal(actual, fs.readFileSync(file, "utf8"));
};

const readOptions = (directory: string): Options => {
  const file = path.join(directory, "options.json");
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Options) : {};
};

for (const group of fs.readdirSync(fixtures).sort()) {
  describe(group, () => {
    const directory = path.join(fixtures, group);
    const caseOptions = readOptions(directory);
    const inputs = fs
      .readdirSync(directory)
      .filter((file: string) => file.endsWith(".conf") && !file.endsWith(".formatted.conf"))
      .sort();
    it("holds two documented examples and one contrived one", () => {
      const headers = inputs.map(
        (name) => fs.readFileSync(path.join(directory, name), "utf8").split("\n")[0] ?? "",
      );
      assert.equal(headers.filter((header) => header.startsWith("# source: ")).length, 2);
      assert.equal(headers.filter((header) => header.startsWith("# contrived: ")).length, 1);
    });
    for (const name of inputs) {
      it(name, async () => {
        const stem = path.join(directory, name.slice(0, -".conf".length));
        const input = fs.readFileSync(`${stem}.conf`, "utf8");
        assert.match(input.split("\n")[0] ?? "", HEADER, "the first line must cite the source");
        try {
          parse(input);
        } catch (error) {
          if (!(error instanceof NginxSyntaxError)) {
            throw error;
          }
          const message = error.message;
          await assert.rejects(
            format(input, caseOptions),
            (rejection: unknown) =>
              rejection instanceof SyntaxError && rejection.message.startsWith(message),
          );
          expectFile(`${stem}.error.txt`, `${message}\n`);
          assert.ok(!fs.existsSync(`${stem}.formatted.conf`));
          return;
        }
        const expected = await massaged(input);
        for (const [profile, profileOptions] of Object.entries(profiles)) {
          const options = { ...caseOptions, ...profileOptions };
          const output = await format(input, options);
          assert.equal(await format(output, options), output, `${profile}: not idempotent`);
          assert.equal(await massaged(output), expected, `${profile}: meaning changed`);
          if (profile === "default") {
            expectFile(`${stem}.formatted.conf`, output);
          }
        }
        assert.ok(!fs.existsSync(`${stem}.error.txt`));
      });
    }
  });
}
