# Materiais da Chrome Web Store - Mestre do PC

Rascunho para versão 1.0.2. Não enviado à loja.

## Cadastro sugerido

- Nome: Mestre do PC - Integração
- Categoria: Functionality & UI (integração e abertura de app local).
- Descrição curta: Integra o navegador com o Mestre do PC V10 e outros apps locais como Chat Hub.
- Idioma: português do Brasil.
- Suporte: https://github.com/jeanavila997-ux/Mestre-do-PC-V10/issues

## Descrição completa

Acesse o Mestre do PC V10 pelo navegador: consulte disponibilidade do launcher e
do Ollama, solicite diagnóstico ou limpeza e abra o app local. Integração opcional
com Chat Hub para verificar disponibilidade.

Com sua autorização, envie título, URL e texto selecionado da aba ao app para
análise com IA. O envio ocorre somente quando você aciona o botão ou menu de contexto.
A extensão não lê páginas continuamente nem envia automaticamente o histórico.

Requer Mestre do PC V10 instalado e iniciado no Windows, token configurado e ID da
extensão autorizado no launcher. IA exige Ollama e modelo compatível disponíveis.
Não é serviço independente de manutenção nem instala o app automaticamente.

## Minuta de política de privacidade

Atualizada em 25/10/2026. Responsável pelo projeto: Jean Carlos de Avila.

### Dados tratados e finalidade

Token, URLs dos apps e preferências são armazenados neste perfil do navegador para
autenticar e configurar a integração. Não são gravados em `storage.sync` nesta
versão. Ao atualizar, configurações legadas são copiadas para armazenamento local
antes da remoção da cópia sincronizada. Armazenamento local não é cofre criptografado.

Ao autorizar análise por IA e acionar envio, a extensão lê título, URL e texto
selecionado da página para compor a solicitação. URLs e seleções podem conter dados
pessoais; evite enviar senhas, tokens e informações sigilosas. Não é enviado o
HTML completo da página. Diagnóstico e limpeza enviam identificadores de comandos.

### Destinos e compartilhamento

Requisições da extensão vão apenas a serviços HTTP em `127.0.0.1`, neste computador.
Redirecionamentos são bloqueados. O launcher encaminha análises ao Ollama configurado
no app. Serviços e provedores usados pelo app podem ter processamento, registros e
retenção próprios, inclusive em nuvem; confira essa configuração antes de autorizar
envios. Esta política da extensão não substitui políticas dos serviços envolvidos.

O código da extensão não inclui anúncios, telemetria, venda de dados ou envio direto
a servidores externos. Não registra histórico de navegação nem mantém um arquivo
de páginas ou respostas de IA.

### Retenção e controle

Configurações permanecem no perfil até serem alteradas, apagadas ou a extensão ser
desinstalada. Para apagar o token, esvazie seu campo e salve. Para interromper novos
envios à IA, desmarque a autorização nas opções e salve. Isso não apaga dados já
enviados ao launcher ou aos serviços de IA; consulte registros e políticas desses
serviços separadamente.

Contato para dúvidas e solicitações: página de suporte do projeto indicada neste
documento. Não publique tokens ou dados pessoais nas issues públicas.

## Campos de privacidade e permissões

No painel, informe tratamento de informações de autenticação (token), conteúdo de
sites (título e seleção) e URLs visitadas enviadas por ação explícita. Confirme os
nomes e definições atuais dos campos no formulário. Não declare "nenhum dado"
apenas porque o destino inicial é local.

Justificativas: `storage` conserva configuração local; `activeTab` e `scripting`
extraem conteúdo solicitado; `contextMenus` oferece ações; `notifications` mostra
resultados e erros; permissões de host conectam os apps locais. Portas adicionais
exigem concessão opcional. Não há login Google; autenticação usa token do launcher.

## Pendências antes do envio

- Publicar política revisada em URL pública estável e cadastrá-la no painel.
- Preparar capturas reais, ícone da loja e materiais exigidos pelo formulário atual.
- Confirmar conta de desenvolvedor, dados de contato e declarações de privacidade.
- Testar IA com token e origem reais, operações de manutenção e compatibilidade nas versões suportadas.
- Validar política de dados também no launcher e nos provedores realmente configurados.

## Referências oficiais

- https://developer.chrome.com/docs/webstore/best_practices
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- https://developer.chrome.com/docs/webstore/images
