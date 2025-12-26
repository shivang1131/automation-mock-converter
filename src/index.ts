import path from "path";
import { generateClasses } from "./utils/generatorUtils";

const oldConfigPath = path.join(process.cwd(), "old-config");
const newConfigPath = path.join(process.cwd(), "new-config");

generateClasses(oldConfigPath, newConfigPath);
