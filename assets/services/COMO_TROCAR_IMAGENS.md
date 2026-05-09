# 🖼️ Como Trocar as Imagens dos Serviços

## Estrutura

```
assets/services/
├── corte-simples.jpg   → Serviço "Corte Simples"
├── barba.jpg           → Serviço "Barba"
├── corte-barba.jpg     → Serviço "Corte + Barba"
├── hidratacao.jpg      → Serviço "Hidratação"
└── pigmentacao.jpg     → Serviço "Pigmentação"
```

## Para trocar uma imagem

1. Renomeie sua nova foto para o nome exato acima (ex: `barba.jpg`)
2. Copie para esta pasta `assets/services/`
3. Pronto — sem precisar alterar nenhum código!

## Dicas de qualidade
- Resolução mínima recomendada: **400×400px**
- Formato: **JPG ou WebP** (menor tamanho)
- Orientação: foque no rosto/cabelo do cliente
- O sistema já aplica `object-fit: cover` automaticamente
