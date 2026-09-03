const firstLine = (text: string): string => /^.*/.exec(text.trimStart())![0];

export const hasPragma = (text: string): boolean =>
  /^#\s*@(?:prettier|format)\s*$/.test(firstLine(text));

export const hasIgnorePragma = (text: string): boolean =>
  /^#\s*@(?:noprettier|noformat)\s*$/.test(firstLine(text));

export const insertPragma = (text: string): string => `# @format\n\n${text}`;
