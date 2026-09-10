import {cp} from "node:fs/promises";
await cp(new URL("../public/",import.meta.url),new URL("../docs/",import.meta.url),{recursive:true});
console.log("public sincronizado com docs");
