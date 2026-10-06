import { readFile, writeFile, mkdir } from "node:fs/promises";
import { encryptHTML } from "pagecrypt/core";
const password=process.env.PAGECRYPT_PASSWORD;
if(!password||password.length<16) throw new Error("PAGECRYPT_PASSWORD missing or too short");
const html=await readFile(new URL("../src/index.html",import.meta.url),"utf8");
const encrypted=await encryptHTML(html,password);
await mkdir(new URL("../dist/",import.meta.url),{recursive:true});
await writeFile(new URL("../dist/index.html",import.meta.url),encrypted,"utf8");
console.log("Encrypted SPA generated in dist/index.html");
