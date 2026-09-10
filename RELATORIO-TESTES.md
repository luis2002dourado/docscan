# Relatório da correção — 10/09/2026

## Diagnóstico

O servidor Express apenas serve os arquivos. A falha de recorte estava em `public/vision.js`, também duplicado em `docs/vision.js`.

O detector antigo priorizava extremos de soma/diferença de coordenadas. Em quadriláteros com perspectiva forte, esses extremos podem selecionar o mesmo vértice. O fallback separava os pontos em dois grupos pela altura, o que não garante a ordem correta. Outros caminhos favoreciam similaridade de lados. A rotina OpenCV existente não era chamada por `processPhoto`, e o HTML não carregava esse motor. Além disso, `lib/vision.mjs`, usado nos testes, era uma cópia divergente do código executado na interface.

A biblioteca compartilhada agora reexporta a implementação efetiva. O detector novo é exercitado com pixels de imagens, e a exportação passa por um navegador real.

## Resultados executados

- **20/20 testes de código:** geometria, homografia, rejeição de cantos inválidos, validação de entrada e configuração do servidor. Os testes antigos de UI são verificações de texto; por isso foram complementados pelo teste de navegador.
- **11/11 cenários controlados:** dez documentos com quatro cantos conhecidos e uma imagem sem documento. Casos: frontal, trapézio, perspectiva forte, rotação, vista lateral, sombra, textura no fundo, baixo contraste, desfoque e paisagem. Critério: quatro cantos a menos de 14 px da referência em imagens de 800 × 720, ou rejeição correta do caso vazio.
- **Preservação dos quatro marcadores:** cada imagem retificada mantém marcadores de cores nos quatro cantos. A comparação de cor considera a sombra aplicada na própria imagem de teste.
- **Perspectiva forte:** a versão original não encontrou um quadrilátero; a nova encontrou os quatro cantos, com erro máximo de 7,81 px. Em nove dos dez casos positivos o erro máximo ficou em até 1,42 px.
- **Seis fotografias reais públicas:** quatro com status de detecção e duas com aviso de revisão. Contornos e resultados foram inspecionados visualmente. Uma foto contém uma cédula; as outras mostram folhas impressas. Essa amostra não é uma medida de precisão sobre todos os documentos possíveis.
- **Navegador Chromium 138 em Linux:** upload pela interface, processamento no worker, PDF baixado e aberto por um parser (uma página e dimensões coerentes com o recorte), ajuste manual com eventos reais de ponteiro, layout com viewport de 390 × 844, aviso de ausência de folha, nome do PDF editado e processamento do JPEG original com orientação EXIF.
- **Offline após instalação/cache:** recarregamento do aplicativo, novo upload local, recorte e download do PDF, com a conexão desligada no contexto do navegador.
- **Responsividade do processamento:** temporizador da página continuou avançando enquanto o worker processava as seis fotos. Não se trata de uma medição de desempenho em aparelhos móveis.
- **Nenhum erro JavaScript não tratado no fluxo final testado.** Nenhuma requisição de upload de documentos foi observada; a implementação transfere os pixels apenas ao worker local.

## Falhas encontradas durante a correção

1. O primeiro detector substituto também perdia uma perspectiva muito forte. A aproximação de contornos passou a testar tolerâncias menores, preservando o quarto vértice.
2. Uma folha com dobras era confundida com a tabela impressa nela. A seleção passou a admitir um contorno externo consistente como estimativa, com aviso de revisão.
3. Uma mesa amarela com luminosidade parecida com a folha prejudicava a verificação das bordas. Foram adicionadas bordas por canal de cor e diferenciação entre detecção firme e estimada.
4. A build OpenCV exigia geração dinâmica de funções. A configuração foi isolada no worker, mantendo a política da página.
5. O objeto OpenCV possui comportamento `thenable`; resolvê-lo diretamente em uma Promise podia entrar em assimilação recursiva. A inicialização agora resolve um objeto que contém o motor.
6. Dependências PDF externas não estavam disponíveis no ambiente de execução. Foram incluídas localmente e verificadas no fluxo real de exportação.

## O que não foi comprovado

Não foram fornecidas as fotos específicas que falhavam no aparelho do usuário. Não houve teste em hardware iPhone/Android, Safari, câmera ao vivo ou todos os modelos de celular. O viewport móvel foi testado em Chromium de computador, com mouse; suporte por toque foi implementado com Pointer Events, sem alegação de ensaio em tela física.

O OCR não foi validado nesta bateria e continua usando dependências externas. Não foi feita uma auditoria completa de segurança nem de todos os recursos de PDFs. Casos com sombras extremas, reflexos, folhas curvas e objetos concorrentes podem precisar do ajuste manual. A proporção física original da folha não é recuperada com garantia a partir de uma única foto sem referência.

## Reprodução e fontes

Comandos e dependências estão no README. Resultados detalhados ficam nos JSONs e arquivos de texto em `test-results`.

- OpenCV: https://docs.opencv.org/4.10.0/ e https://github.com/opencv/opencv/tree/4.10.0
- Build distribuída: `@techstark/opencv-js@4.10.0-release.1`, arquivo `dist/opencv.js`, incluído em `public/vendor` com licença Apache 2.0.
- Fotografias: https://github.com/ColonelParrot/jscanify/tree/master/docs/images/test — arquivos `test.png`, `test2.png`, `test3.jpg`, `test4.JPG`, `test5.JPG`, `test6.JPG`. Cópias originais e versões normalizadas para 1200 px incluídas; licença MIT do projeto preservada em `tests/fixtures/JSCANIFY-LICENSE.txt`.
- PDF.js 3.11.174 e pdf-lib 1.17.1: versões previamente usadas pelo aplicativo, agora incluídas com as respectivas licenças.
- O arquivo `tests/legacy-vision.mjs` é a versão original recebida, preservada exclusivamente para comparação.
