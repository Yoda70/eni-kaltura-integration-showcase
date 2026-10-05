import { readFile, writeFile, mkdir } from "node:fs/promises";
import { encryptHTML } from "pagecrypt/core";

const password = process.env.PAGECRYPT_PASSWORD;
if (!password) throw new Error("PAGECRYPT_PASSWORD is not configured.");
if (password.length < 16) throw new Error("PAGECRYPT_PASSWORD must contain at least 16 characters.");

const sourcePath = new URL("../src/index.html", import.meta.url);
const outputDir = new URL("../dist/", import.meta.url);
const outputPath = new URL("../dist/index.html", import.meta.url);
const sourceHtml = await readFile(sourcePath, "utf8");
const encryptedHtml = await encryptHTML(sourceHtml, password);
await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, encryptedHtml, "utf8");
console.log("Encrypted dashboard generated in dist/index.html");
