# React Compiler — Cheatsheet de Instalação

> Fonte canônica: <https://react.dev/learn/react-compiler/installation>
>
> Este arquivo é uma **folha de referência operacional** (read-only, sem "kills" — sem remover nada do seu setup). Use para colar comandos com confiança em qualquer projeto React do workspace.

Última sincronização com a doc oficial: nesta data do commit.

---

## 1. Pré-requisitos

| Item | Valor |
|---|---|
| React recomendado | **19** |
| React suportado | 17, 18 e 19 |
| Tipo de plugin | Babel (`babel-plugin-react-compiler`) |
| Posição no pipeline | **Deve rodar primeiro** (precisa do source original antes de outras transformações) |

---

## 2. Instalação do compilador (Babel plugin)

```bash
# npm
npm install -D babel-plugin-react-compiler@latest

# Yarn
yarn add -D babel-plugin-react-compiler@latest

# pnpm
pnpm install -D babel-plugin-react-compiler@latest
```

> **Por que `@latest`?** Evita que o doc fique "stale" quando o time do React publica correções. Sem fixar versão, `npm ci` em um lockfile novo puxa o patch mais recente compatível.

---

## 3. Configuração por build tool

### 3.1 Babel puro

```js
// babel.config.js
module.exports = {
  plugins: [
    'babel-plugin-react-compiler', // must run first!
    // ... outros plugins
  ],
};
```

### 3.2 Vite (`@vitejs/plugin-react` >= 6.0.0) — preset oficial

```bash
npm install -D @rolldown/plugin-babel
```

```js
// vite.config.js
import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

export default defineConfig({
  plugins: [
    react(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
});
```

**Fallback para `@vitejs/plugin-react` < 6.0.0** (opção `babel` inline):

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
});
```

**Alternativa explícita com `@rolldown/plugin-babel`:**

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

export default defineConfig({
  plugins: [
    react(),
    babel({
      plugins: ['babel-plugin-react-compiler'],
    }),
  ],
});
```

### 3.3 React Router (Vite)

```bash
npm install vite-plugin-babel
```

```js
// vite.config.js
import { defineConfig } from 'vite';
import babel from 'vite-plugin-babel';
import { reactRouter } from '@react-router/dev/vite';

const ReactCompilerConfig = { /* ... */ };

export default defineConfig({
  plugins: [
    reactRouter(),
    babel({
      filter: /\.[jt]sx?$/,
      babelConfig: {
        presets: ['@babel/preset-typescript'], // se usar TypeScript
        plugins: [
          ['babel-plugin-react-compiler', ReactCompilerConfig],
        ],
      },
    }),
  ],
});
```

### 3.4 Outras ferramentas (links externos)

| Ferramenta | Doc oficial |
|---|---|
| Next.js | <https://nextjs.org/docs/app/api-reference/next-config-js/reactCompiler> |
| Expo | <https://docs.expo.dev/guides/react-compiler/> |
| Metro (React Native) | Use o pipeline Babel padrão (seção 3.1) |
| Webpack | Loader da comunidade: <https://github.com/SukkaW/react-compiler-webpack> |
| Rspack | <https://rspack.dev/guide/tech/react#react-compiler> |
| Rsbuild | <https://rsbuild.dev/guide/framework/react#react-compiler> |

---

## 4. Integração com ESLint

```bash
npm install -D eslint-plugin-react-hooks@latest
```

A regra do compilador vive no preset `recommended-latest`. Não é obrigatório corrigir todas as violações: o compilador simplesmente pula o componente/hook que falhou na regra e segue otimizando o resto.

Para detalhes da config base do `eslint-plugin-react-hooks`:
<https://github.com/react/react/blob/main/packages/eslint-plugin-react-hooks/README.md#installation>

---

## 5. Como verificar que está funcionando

### 5.1 React DevTools

1. Instale a extensão [React Developer Tools](https://react.dev/learn/react-developer-tools).
2. Rode a app em modo dev.
3. Abra o DevTools e procure o badge **"Memo ✨"** ao lado do nome do componente.

Se aparecer o ✨, o componente foi otimizado pelo compilador.

### 5.2 Build output

Procure por imports `react/compiler-runtime` no bundle compilado:

```js
import { c as _c } from "react/compiler-runtime";
export default function MyApp() {
  const $ = _c(1);
  let t0;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t0 = <div>Hello World</div>;
    $[0] = t0;
  } else {
    t0 = $[0];
  }
  return t0;
}
```

Se você ver este padrão, o compilador está ativo.

---

## 6. Opt-out pontual

Para desativar a otimização em um único componente durante debug:

```js
function ProblematicComponent() {
  "use no memo";
  // ... código do componente
}
```

Remova a diretriz após corrigir a causa. Mais detalhes no [guia de debugging](https://react.dev/learn/react-compiler/debugging).

---

## 7. Próximos passos

- [React version compatibility](https://react.dev/reference/react-compiler/target) — React 17 e 18
- [Configuration options](https://react.dev/reference/react-compiler/configuration) — customização do compilador
- [Incremental adoption](https://react.dev/learn/react-compiler/incremental-adoption) — para codebases existentes
- [Debugging techniques](https://react.dev/learn/react-compiler/debugging) — troubleshooting
- [Compiling Libraries](https://react.dev/reference/react-compiler/compiling-libraries) — para autores de libs React
