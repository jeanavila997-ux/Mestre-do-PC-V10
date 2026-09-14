#!/usr/bin/env node
/**
 * Script de instalação do Computer Use para Mestre do PC V11
 * Executa: node scripts/install-computer-use.js
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = join(__dirname, '..');
const PACKAGE_JSON = join(PROJECT_DIR, 'package.json');

console.log('🔧 Instalando Computer Use no Mestre do PC V11...\n');

try {
  // Verifica se package.json existe
  if (!existsSync(PACKAGE_JSON)) {
    throw new Error('package.json não encontrado. Execute este script na raiz do projeto.');
  }

  // Lê package.json atual
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));

  // Adiciona dependência se não existir
  if (!pkg.dependencies || !pkg.dependencies['@qwen-code/cua-sdk']) {
    console.log('📦 Adicionando @qwen-code/cua-sdk@0.20.4 às dependências...');
    if (!pkg.dependencies) pkg.dependencies = {};
    pkg.dependencies['@qwen-code/cua-sdk'] = '0.20.4';
    writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2), 'utf8');
  } else {
    console.log('✅ @qwen-code/cua-sdk já está nas dependências');
  }

  // Executa npm install
  console.log('\n⏳ Instalando pacotes (isso pode levar alguns minutos)...');
  execSync('npm install', {
    cwd: PROJECT_DIR,
    stdio: 'inherit',
    env: { ...process.env }
  });

  // Verifica se instalação foi bem sucedida
  const sdkPath = join(PROJECT_DIR, 'node_modules', '@qwen-code', 'cua-sdk');
  if (existsSync(sdkPath)) {
    console.log('\n✅ Computer Use instalado com sucesso!');
    console.log('\n📚 Próximo passo:');
    console.log('   1. Execute o launcher: npm start');
    console.log('   2. Acesse http://127.0.0.1:7777');
    console.log('   3. Navegue até "🖱️ Computer Use"');
    console.log('\n📖 Documentação: docs/computer-use.md\n');
  } else {
    throw new Error('@qwen-code/cua-sdk não foi encontrado em node_modules após npm install.');
  }

} catch (error) {
  console.error('\n❌ Erro na instalação:', error.message);
  console.error('\nTente manualmente:');
  console.error('   npm install @qwen-code/cua-sdk@0.20.4\n');
  process.exit(1);
}
