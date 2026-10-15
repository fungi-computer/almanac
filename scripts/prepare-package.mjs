import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { URL } from "node:url";
import * as Schema from "effect/Schema";

const root = new URL("../", import.meta.url);
const destination = new URL(".botanical/package/", root);
const manifest = Schema.decodeUnknownSync(
  Schema.Record(Schema.String, Schema.Unknown),
)(JSON.parse(await readFile(new URL("package.json", root), "utf8")));
delete manifest.scripts;
delete manifest.botanical;
delete manifest.devDependencies;
delete manifest.publishConfig;
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const path of ["dist", "docs/api", "examples", "README.md", "LICENSE"]) {
  await cp(new URL(path, root), new URL(path, destination), {
    recursive: true,
  });
}
await writeFile(
  new URL("package.json", destination),
  JSON.stringify(manifest, null, 2) + "\n",
);
