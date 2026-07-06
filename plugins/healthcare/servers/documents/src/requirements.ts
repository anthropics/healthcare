// Must run before anything imports node:sqlite (needs node >= 22.5); engines
// in package.json isn't enforced at spawn time.
const [maj = 0, min = 0] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  process.stderr.write(
    `mcp-server-documents: node ${process.versions.node} is too old — this server needs node >= 22.13 (node:sqlite with columns()). ` +
      `Install a current node (https://nodejs.org) and retry.\n`,
  );
  process.exit(1);
}
