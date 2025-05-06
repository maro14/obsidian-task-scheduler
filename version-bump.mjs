import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.argv[2];
const minAppVersion = process.argv[3];

// read minAppVersion from manifest.json if not provided
if (!minAppVersion) {
	const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
	const { minAppVersion: currentMinAppVersion } = manifest;
	console.log(`Using minAppVersion ${currentMinAppVersion} from manifest.json`);
}

// update version in manifest.json
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = targetVersion;
if (minAppVersion) {
	manifest.minAppVersion = minAppVersion;
}
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// update version in package.json
let packageJSON = JSON.parse(readFileSync("package.json", "utf8"));
packageJSON.version = targetVersion;
writeFileSync("package.json", JSON.stringify(packageJSON, null, "\t"));

// update version in versions.json
let versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

console.log(`Version bumped to ${targetVersion}`);