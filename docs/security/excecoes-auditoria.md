# Exceções da auditoria de dependências

Vulnerabilidades encontradas pelo `pnpm audit` que foram analisadas e aceitas temporariamente.
Cada exceção precisa de justificativa, medida de mitigação e data de revisão.

## GHSA-vfj7-8cjw-p6xm — braces (DoS por padrões aninhados)

| Campo | Valor |
| --- | --- |
| Pacote | `braces` <= 3.0.3 |
| Severidade | Alta |
| Origem | `apps/web > shadcn (CLI) > fast-glob > micromatch > braces` |
| Correção disponível | Não, na data da análise |
| Registrado em | 09/10/2026 |
| Revisar em | 09/11/2026 |

**Por que o risco real é baixo**

- O pacote só é usado pela ferramenta de linha de comando do shadcn, em desenvolvimento.
- Não vai para o navegador nem roda na API em produção.
- O ataque exige controlar os padrões de busca passados à ferramenta, que são fixos.
- Impacto máximo: travar o comando no terminal do desenvolvedor. Nenhum dado exposto.

**Mitigação aplicada**

- `shadcn` movido para `devDependencies`.
- `pnpm audit --prod` (dependências de produção) sem vulnerabilidades.

**Ação na revisão**

Rodar `pnpm audit`. Se houver versão corrigida, atualizar e remover esta exceção.