# DocScan v22

- Detector: inspeção dos contornos em RGB, limiares adicionais para baixo contraste e comparação de faixas dos dois lados de cada borda para reduzir a seleção de molduras impressas.
- Detecção incerta preserva a imagem integral. O quadrilátero estimado fica disponível somente para confirmação no ajuste manual.
- Editor manual: altura dinâmica da tela, imagem redimensionável, botões em uma área independente, suporte a orientação horizontal e bloqueio da rolagem do fundo.
- Paleta Turmeric (#FFBE0B) e Malt (#2A2312), com texto escuro em controles amarelos.
- 13 cenários de imagem controlados, incluindo moldura interna com pouco contraste e folha sem borda distinguível; seis fotografias de regressão; testes de interface e PDF no Chromium.
- Limite: as fotos específicas do erro relatado não foram anexadas. Bordas invisíveis, oclusões e folhas curvadas ainda podem exigir ajuste manual. Não houve teste em aparelho físico.
