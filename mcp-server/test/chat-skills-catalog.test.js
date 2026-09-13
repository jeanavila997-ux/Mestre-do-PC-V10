import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const catalogFile = join(__dirname, "..", "..", "v10", "chat-integrado", "chat-skills.json");

async function loadCatalog() {
  return JSON.parse(await readFile(catalogFile, "utf8"));
}

test("catálogo inclui as áreas solicitadas", async () => {
  const data = await loadCatalog();
  const ids = new Set(data.items.map((skill) => skill.id));
  const required = [
    "find-skills",
    "skill-creator",
    "programming",
    "code-review",
    "react-nextjs",
    "testing",
    "devops",
    "ui-ux-design",
    "documentation",
    "git-github",
    "github-project-explainer",
    "automation",
    "teaching",
    "orchestration",
    "desktop-commander",
  ];

  for (const id of required) assert.ok(ids.has(id), `Skill ausente: ${id}`);
});

test("catálogo tem identificadores únicos e conteúdo acionável", async () => {
  const data = await loadCatalog();
  const ids = data.items.map((skill) => skill.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.ok(data.items.length >= 20);
  for (const skill of data.items) {
    assert.match(skill.id, /^[a-z0-9-]+$/);
    assert.ok(skill.title);
    assert.ok(skill.category);
    assert.ok(skill.description.length >= 20);
    assert.ok(skill.body.length >= 100);
  }
});
