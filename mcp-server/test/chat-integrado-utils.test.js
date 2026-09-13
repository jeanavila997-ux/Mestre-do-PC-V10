import test from "node:test";
import assert from "node:assert/strict";
import {
  filterSkills,
  applySkillShortcut,
  buildAttachmentContext,
} from "../../v10/chat-integrado/chat-utils.js";

test("filtra skills pelo texto digitado depois de /", () => {
  const skills = [
    { id: "diagnostico-rede", title: "Diagnóstico de rede" },
    { id: "limpeza-pc", title: "Limpeza do PC" },
  ];

  assert.deepEqual(filterSkills(skills, "rede").map((skill) => skill.id), ["diagnostico-rede"]);
});

test("expande um atalho de skill para contexto do chat", () => {
  const skills = [{ id: "diagnostico-rede", title: "Diagnóstico de rede", body: "Analise conectividade." }];

  assert.deepEqual(
    applySkillShortcut("/diagnostico-rede verifique o DNS", skills),
    {
      matched: true,
      skill: skills[0],
      text: "Use a skill \"Diagnóstico de rede\" como contexto de trabalho.\n\nAnalise conectividade.\n\nPedido do usuário: verifique o DNS",
    },
  );
});

test("mantém texto normal quando o atalho não existe", () => {
  assert.deepEqual(applySkillShortcut("/nao-existe teste", []), { matched: false, text: "/nao-existe teste" });
});

test("monta contexto de anexos sem incluir imagens como texto", () => {
  const result = buildAttachmentContext("resuma", [
    { name: "notas.md", content: "conteúdo das notas", kind: "text" },
    { name: "foto.png", kind: "image", base64: "abc" },
  ]);

  assert.equal(result.text, "resuma\n\n--- Arquivos anexados ---\n[notas.md]\nconteúdo das notas");
  assert.deepEqual(result.images, ["abc"]);
});
