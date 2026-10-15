
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = __dirname;
const OUTPUT = path.join(ROOT, "idus-codebase.txt");

const EXCLUDED_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    ".expo",
    "vendor"
]);

const EXCLUDED_FILES = new Set([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    
    "idus-codebase.txt",
    "merge.js"
]);

const INCLUDED_EXTENSIONS = new Set([
    ".env",
    ".env.local",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".json",
    ".html",
    ".css",
    ".scss",
    ".md",
    ".txt",
    ".yml",
    ".yaml",
    ".xml",
    ".sql",
    ".prisma",
    ".sh",
    ".bat",
    ".py",
    ".rs",
    ".cpp",
    ".h"
]);

let output = `IDUS PROJECT CODEBASE
Generated: ${new Date().toISOString()}
Root: ${ROOT}

========================================
`;

let fileCount = 0;

function walkDirectory(directory) {
    const entries = fs.readdirSync(directory, {
        withFileTypes: true
    });

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            if (EXCLUDED_DIRS.has(entry.name)) continue;
            if (entry.name.startsWith(".")) continue;

            walkDirectory(fullPath);
            continue;
        }

        if (!entry.isFile()) continue;
        if (EXCLUDED_FILES.has(entry.name)) continue;

        const extension = path.extname(entry.name).toLowerCase();

        if (!INCLUDED_EXTENSIONS.has(extension)) continue;

        try {
            const content = fs.readFileSync(fullPath, "utf8");
            const relativePath = path.relative(ROOT, fullPath);

            output += `

========================================
FILE: ${relativePath}
========================================

${content}

`;

            fileCount++;

            console.log(`[MERGED] ${relativePath}`);
        } catch (error) {
            console.error(`[ERROR] ${fullPath}:`, error.message);
        }
    }
}

walkDirectory(ROOT);

output += `

========================================
END OF CODEBASE
Total files merged: ${fileCount}
========================================
`;

fs.writeFileSync(OUTPUT, output, "utf8");

console.log("\n================================");
console.log("IDUS CODEBASE MERGED SUCCESSFULLY");
console.log(`Files: ${fileCount}`);
console.log(`Output: ${OUTPUT}`);
console.log("================================");