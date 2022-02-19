import * as prettier from "prettier";
import * as fs from "fs";
const path = require("path");

const prettierConfig = {
  parser: "nginx",
  plugins: [".."],
};

let exitCode = 0;

const testRoot = path.resolve(__dirname);
let testDirectories: string[] = [];
fs.readdirSync(path.join(testRoot, "files")).forEach((i) => {
  const directoryName = path.join(testRoot, "files", i);
  if (fs.lstatSync(directoryName).isDirectory()) {
    if (!fs.existsSync(path.join(directoryName, "input.nginxconf"))) {
      return;
    }
    if (!fs.existsSync(path.join(directoryName, "options.json"))) {
      return;
    }
    testDirectories.push(directoryName);
  }
});

testDirectories.forEach((testDir) => {
  const input = fs.readFileSync(path.join(testDir, "input.nginxconf"), {
    encoding: "utf-8",
  });
  const options = JSON.parse(
    fs.readFileSync(path.join(testDir, "options.json")).toString()
  );
  options.forEach((option: any) => {
    if (!option.filename) {
      throw TypeError("Option does not have filename property");
    }
    if (!option.options) {
      throw TypeError("Option does not have option property");
    }
    const outputPath = path.join(testDir, option.filename);
    if (!fs.existsSync(outputPath)) {
      throw Error("Option output path " + outputPath + " does not exist");
    }
    const expectedResult = fs.readFileSync(outputPath, { encoding: "utf-8" });
    const result = prettier.format(input, {
      ...prettierConfig,
      ...option.options,
    });
    if (expectedResult != result) {
      console.error(
        `Test "${path.basename(testDir)}" failed on "${option.filename}": ` +
          `Result does not match expected output`
      );
      exitCode += 1;
    }
  });
});

process.exit(exitCode);
