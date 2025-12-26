import fs from "fs";
import path from "path";

/**
 * Converts folder name to PascalCase class name
 */
function toClassName(folderName: string): string {
  return (
    "Mock" +
    folderName
      .split("_")
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join("") +
    "Class"
  );
}

/**
 * Detects exported generator function in a generator.ts file
 */
function getGeneratorFunctionName(generatorFilePath: string): string | null {
  if (!fs.existsSync(generatorFilePath)) return null;

  const content = fs.readFileSync(generatorFilePath, "utf8");

  // Function declaration
  const funcDeclRegex = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]*generator[A-Za-z0-9_]*)/i;
  const matchDecl = content.match(funcDeclRegex);
  if (matchDecl) return matchDecl[1];

  // Arrow function
  const arrowFuncRegex = /export\s+const\s+([A-Za-z0-9_]*generator[A-Za-z0-9_]*)\s*=\s*(?:async\s+)?\(/i;
  const matchArrow = content.match(arrowFuncRegex);
  if (matchArrow) return matchArrow[1];

  return null;
}

/**
 * Recursively traverse folders and generate class.ts for each folder
 */
function processFolder(oldFolderPath: string, newFolderPath: string, rootDefaultYaml: string) {
  if (!fs.existsSync(newFolderPath)) fs.mkdirSync(newFolderPath, { recursive: true });

  const entries = fs.readdirSync(oldFolderPath, { withFileTypes: true });

  // Check for generator.ts
  const oldGeneratorFile = path.join(oldFolderPath, "generator.ts");
  let generatorFunctionName: string | null = null;

  if (fs.existsSync(oldGeneratorFile)) {
    generatorFunctionName = getGeneratorFunctionName(oldGeneratorFile) || "generator";
    const newGeneratorFile = path.join(newFolderPath, "generator.ts");
    fs.copyFileSync(oldGeneratorFile, newGeneratorFile);
    console.log(`Copied generator.ts for ${oldFolderPath}`);
  }

  // Copy default.yaml: use folder's own, or fallback to root default.yaml
  const folderDefaultYaml = path.join(oldFolderPath, "default.yaml");
  if (fs.existsSync(folderDefaultYaml)) {
    fs.copyFileSync(folderDefaultYaml, path.join(newFolderPath, "default.yaml"));
  } else if (fs.existsSync(rootDefaultYaml)) {
    fs.copyFileSync(rootDefaultYaml, path.join(newFolderPath, "default.yaml"));
  }

  // Copy save-data.yaml if it exists
  const saveDataYaml = path.join(oldFolderPath, "save-data.yaml");
  if (fs.existsSync(saveDataYaml)) {
    fs.copyFileSync(saveDataYaml, path.join(newFolderPath, "save-data.yaml"));
  }

  // Generate class.ts if generator.ts exists
  if (generatorFunctionName) {
    const className = toClassName(path.basename(oldFolderPath));
    const classTemplate = `import { readFileSync } from "fs";
import yaml from "js-yaml";
import path from "path";
import { MockAction, MockOutput, saveType } from "../../../../classes/mock-action";
import { SessionData } from "../../../../session-types";
import { ${generatorFunctionName} } from "./generator";

export class ${className} extends MockAction {
  get saveData(): saveType {
    return yaml.load(
      readFileSync(path.resolve(__dirname, "../save-data.yaml"), "utf8")
    ) as saveType;
  }

  get defaultData(): any {
    return yaml.load(
      readFileSync(path.resolve(__dirname, "./default.yaml"), "utf8")
    );
  }

  get inputs(): any {
    return {};
  }

  name(): string {
    return "${path.basename(oldFolderPath)}";
  }

  generator(existingPayload: any, sessionData: SessionData): Promise<any> {
    return ${generatorFunctionName}(existingPayload, sessionData);
  }

  get description(): string {
    return "Mock for ${path.basename(oldFolderPath)}";
  }

  async validate(targetPayload: any, sessionData: SessionData): Promise<MockOutput> {
    return { valid: true };
  }

  async meetRequirements(sessionData: SessionData): Promise<MockOutput> {
    return { valid: true };
  }
}
`;
    fs.writeFileSync(path.join(newFolderPath, "class.ts"), classTemplate);
    console.log(`Generated class.ts for ${oldFolderPath}`);
  }

  // Recurse into subfolders
  for (const entry of entries) {
    if (entry.isDirectory()) {
      processFolder(
        path.join(oldFolderPath, entry.name),
        path.join(newFolderPath, entry.name),
        rootDefaultYaml
      );
    }
  }
}

/**
 * Main entry
 */
export function generateClasses(oldConfigPath: string, newConfigPath: string) {
  if (!fs.existsSync(oldConfigPath)) {
    console.error("Old config path does not exist:", oldConfigPath);
    return;
  }

  // Determine root default.yaml if exists
  const rootDefaultYaml = path.join(oldConfigPath, "default.yaml");
  processFolder(oldConfigPath, newConfigPath, rootDefaultYaml);
  console.log("\nAll folders, class.ts, and generator.ts files processed successfully!");
}
