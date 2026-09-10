# DocScan 1.1 — recorte e perspectiva

Digitalize documentos, una e edite PDFs no navegador. Processamento local, sem envio dos documentos a um servidor.

## Atualização

Para GitHub Pages, substitua a pasta `docs` inteira pela pasta deste pacote, incluindo `vendor`. A estrutura pública permanece compatível com `/docscan/`. Depois da publicação, feche e abra o aplicativo para carregar a versão 21 do cache. Este pacote não foi publicado automaticamente.

Para o servidor Node:

```bash
npm ci
npm start
```

Abra `http://localhost:8080/` ou `http://localhost:8080/docscan/`. Em outro aparelho, use hospedagem HTTPS para os recursos de aplicativo instalado. Não abra `index.html` por `file://`: módulos e workers precisam de um servidor.

A fonte da interface fica em `public`. Após editar:

```bash
npm run sync:docs
```

## O que mudou

- O recorte antigo por extremos foi substituído por contornos OpenCV 4.10.0, com análise de bordas em tons de cinza e canais de cor, segmentação e comparação entre candidatos.
- Os cantos são ordenados em ciclo ao redor do centro. Não se exige igualdade entre lados opostos nem ângulos retos na foto.
- A correção usa `getPerspectiveTransform` e `warpPerspective`. O processamento pesado fica em um Web Worker; buffers são transferidos, e matrizes OpenCV são liberadas após cada operação.
- A saída preserva a razão entre dimensões estimadas ao limitar a resolução. O lado maior da imagem de trabalho fica limitado a 2400 px; a detecção usa até 960 px.
- Um recorte estimado recebe aviso de revisão. Se a folha não for encontrada, a foto é preservada e a interface informa o problema.
- O botão **Ajustar cantos** permite revisar quatro pontos com mouse ou toque; pontos cruzados, repetidos e regiões degeneradas são rejeitados.
- Trocar filtros reaproveita o recorte, evitando nova detecção desnecessária.
- OpenCV e as bibliotecas PDF agora acompanham o projeto. O cache mantém o motor para uso offline depois do primeiro carregamento completo. OCR continua opcional e depende de arquivos externos.
- O servidor mantém `unsafe-eval` fora da interface. Apenas o worker OpenCV tem a permissão necessária aos bindings da biblioteca; a política desse worker bloqueia conexões de rede.
- Correções adicionais: nome escolhido ao salvar PDF editado; impressão com páginas ainda não processadas; caminhos para instalação na raiz ou subpasta; atualização do cache sem apagar caches de outros aplicativos.

## Evidências

Abra `test-results/comparacao.html` para ver as fotografias, os contornos encontrados e as saídas antiga e nova. Leia `RELATORIO-TESTES.md` para resultados, critérios e limites.

```bash
npm test
npm run test:images
npx playwright install chromium
npm run test:browser
```

Os arquivos de teste já estão incluídos. Para recriar apenas os casos sintéticos: instale Pillow e numpy e execute `python tests/generate-fixtures.py`. O teste de navegador permite selecionar um Chromium instalado pela variável `CHROMIUM_PATH`.

## Limites

O detector analisa geometria e contraste; não é um modelo que entende semanticamente o documento. Formas retangulares no fundo podem confundir a seleção. Folhas curvas, reflexos, oclusões, páginas sobrepostas e bordas fora da fotografia podem exigir correção manual ou uma nova foto. A transformação de quatro pontos corrige perspectiva de uma superfície plana; não desfaz dobras. Sem uma referência física ou calibração da câmera, o tamanho e a proporção reais da folha não são garantidos.

Não houve teste físico em iPhone ou Android. O OCR e as demais funções fora dos fluxos descritos no relatório não tiveram validação completa nesta correção.
