# Vínculo

**Pós-venda no WhatsApp.** Central de pós-venda no WhatsApp: atendimento com IA, pesquisa de
satisfação, saúde da carteira e recompra. A assistente Vi conduz a configuração no primeiro acesso.

## Como este projeto é entregue

O Vínculo é um projeto Lovable entregue por remix: cada cliente recebe uma cópia do projeto de
origem, com o próprio banco (Lovable Cloud) e o próprio endereço. A primeira pessoa que se
cadastra na cópia vira dona da central e é recebida pela Vi.

O nome, a frase e as cores da marca ficam num lugar só: `src/lib/brand.ts`. Os tokens visuais
(azul-marinho `#001F35`, dourado `#B9915B`, fonte Manrope) ficam em `src/styles.css` e
`src/styles/ds/tokens.css`. O logo está em `public/brand/` e em `src/components/layout/Logo.tsx`.

## Stack

TanStack Start, React 19, Tailwind v4 e Supabase (Lovable Cloud).

## Como rodar

```sh
bun install          # dependências
bun run dev          # servidor de desenvolvimento
bunx tsc --noEmit    # checagem de tipos
bunx vitest run      # testes
bun run build        # build de produção
```

## Fluxo de trabalho: git primeiro

Todo código entra por git. O Lovable só publica o que está no repositório.

1. Escreva e teste a mudança localmente.
2. Faça commit e push na branch conectada ao projeto.
3. O Lovable sincroniza o commit e publica. Confira o resultado na URL publicada.

Não reescreva o histórico já publicado (force push, rebase ou amend de commit enviado): isso
quebra o histórico do lado do Lovable. Migrations ficam em `supabase/migrations/`, versionadas
junto com o código.
