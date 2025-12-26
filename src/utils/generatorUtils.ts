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

  // 1. Find all generator files
  const generatorFiles = entries
    .filter(e => e.isFile() && e.name.toLowerCase().includes("generator") && e.name.endsWith(".ts"))
    .map(e => path.join(oldFolderPath, e.name));

  // 2. Copy default.yaml / save-data.yaml paths
  const folderDefaultYaml = path.join(oldFolderPath, "default.yaml");
  const defaultYamlSrc = fs.existsSync(folderDefaultYaml) ? folderDefaultYaml : rootDefaultYaml;
  const saveDataYaml = path.join(oldFolderPath, "save-data.yaml");

  // 3. Process each generator file
  generatorFiles.forEach((generatorFilePath, fileIndex) => {
    const content = fs.readFileSync(generatorFilePath, "utf8");

    // Extract all exported generator functions
    const funcRegex = /export\s+(?:async\s+)?(?:function|const)\s+([A-Za-z0-9_]*generator[A-Za-z0-9_]*)/gi;
    const funcNames = Array.from(new Set([...content.matchAll(funcRegex)].map(m => m[1])));

    funcNames.forEach((funcName, funcIndex) => {
      // Folder name: APIName_GeneratorFuncName (add index if duplicates)
      const folderSuffix = funcNames.length > 1 ? `_${funcIndex + 1}` : "";
      const apiFolderName = path.basename(oldFolderPath) + "_" + funcName + folderSuffix;
      const genFolderPath = path.join(newFolderPath, apiFolderName);
      fs.mkdirSync(genFolderPath, { recursive: true });

      // Copy generator file as generator.ts
      fs.copyFileSync(generatorFilePath, path.join(genFolderPath, "generator.ts"));

      // Copy default.yaml
      if (defaultYamlSrc && fs.existsSync(defaultYamlSrc)) {
        fs.copyFileSync(defaultYamlSrc, path.join(genFolderPath, "default.yaml"));
      }

      // Copy save-data.yaml
      if (fs.existsSync(saveDataYaml)) {
        fs.copyFileSync(saveDataYaml, path.join(genFolderPath, "save-data.yaml"));
      }

      // Generate class.ts
      const className = funcName[0].toUpperCase() + funcName.slice(1) + "Class";
      const classTemplate = `import { readFileSync } from "fs";
import yaml from "js-yaml";
import path from "path";
import { MockAction, MockOutput, saveType } from "../../../../classes/mock-action";
import { SessionData } from "../../../../session-types";
import { ${funcName} } from "./generator";

export class ${className} extends MockAction {
  get saveData(): saveType {
    return yaml.load(
      readFileSync(path.resolve(__dirname, "./save-data.yaml"), "utf8")
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
    return "${funcName}";
  }

  generator(existingPayload: any, sessionData: SessionData): Promise<any> {
    return ${funcName}(existingPayload, sessionData);
  }

  get description(): string {
    return "Mock for ${funcName}";
  }

  async validate(targetPayload: any, sessionData: SessionData): Promise<MockOutput> {
    return { valid: true };
  }

  async meetRequirements(sessionData: SessionData): Promise<MockOutput> {
    return { valid: true };
  }
}
`;
      fs.writeFileSync(path.join(genFolderPath, "class.ts"), classTemplate);
      console.log(`Generated class.ts for ${funcName} in ${genFolderPath}`);
    });
  });

  // 4. Recurse into subfolders
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

  const domainFolders = fs
    .readdirSync(oldConfigPath, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const domain of domainFolders) {
    const domainPath = path.join(oldConfigPath, domain.name);
    const newDomainPath = path.join(newConfigPath, domain.name);

    // Domain-level default.yaml fallback
    const domainDefaultYaml = path.join(domainPath, "default.yaml");

    const versionFolders = fs
      .readdirSync(domainPath, { withFileTypes: true })
      .filter((v) => v.isDirectory());

    for (const version of versionFolders) {
      const versionPath = path.join(domainPath, version.name);
      const newVersionPath = path.join(newDomainPath, version.name);

      // Recurse into API folders inside the version
      processFolder(versionPath, newVersionPath, domainDefaultYaml);
    }
  }

  console.log("\nAll API folders, class.ts, and generator.ts files processed successfully!");
}


// Detect all generator functions in a file
function getAllGeneratorFunctions(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, "utf8");
  const generatorNames: string[] = [];

  // Match function declarations with 'generator' in the name (case-insensitive)
  const funcDeclRegex = /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]*generator[A-Za-z0-9_]*)/gi;
  let match;
  while ((match = funcDeclRegex.exec(content))) {
    generatorNames.push(match[1]);
  }

  // Match exported arrow functions with 'generator' in the name
  const arrowFuncRegex = /export\s+const\s+([A-Za-z0-9_]*generator[A-Za-z0-9_]*)\s*=\s*(?:async\s+)?\(/gi;
  while ((match = arrowFuncRegex.exec(content))) {
    generatorNames.push(match[1]);
  }

  // Remove duplicates if any
  return Array.from(new Set(generatorNames));
}
