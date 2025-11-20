# Fluxo de Releases com Changesets, CI e GitHub Releases

Este documento descreve o fluxo completo de versionamento, publicação e criação de releases, usando:

- Changesets
- GitHub Actions
- pnpm
- Git tags + GitHub Releases
- Script `scripts/create-releases.js`

Os diagramas Mermaid utilizam um tema de cores em **tons pastéis** com **alto contraste de texto**.

> Para visualizar com tema customizado, use Mermaid com `theme: 'base'` + `themeVariables` indicados abaixo.

---

## 1. Visão Geral do Fluxo

```mermaid
flowchart LR
  classDef pastelNode fill:#fdf2ff,stroke:#7f1d8d,color:#1f2933,stroke-width:1.5px;
  classDef pastelAction fill:#e0f2fe,stroke:#0369a1,color:#082f49,stroke-width:1.5px;
  classDef pastelCI fill:#ecfdf3,stroke:#15803d,color:#052e16,stroke-width:1.5px;

  Dev["Dev: edita código"]:::pastelNode
  PRFeature["PR com changesets"]:::pastelNode
  Main["main"]:::pastelNode
  WFRelease["Workflow Release"]:::pastelCI
  PRVersion["PR Version Packages"]:::pastelCI
  Publish["pnpm release (changeset tag)"]:::pastelAction
  Tags["Tags locais (@repo/ui@0.3.0)"]:::pastelAction
  PushTags["git push --follow-tags"]:::pastelAction
  GHRepo["Repo GitHub (tags)"]:::pastelNode
  GHReleases["GitHub Releases"]:::pastelNode

  Dev --> PRFeature --> Main
  Main --> WFRelease

  WFRelease -->|há changesets pendentes| PRVersion
  PRVersion -->|merge em main| Main

  Main -->|novo push| WFRelease
  WFRelease --> Publish
  Publish --> Tags
  Publish -->|usa tags locais| GHReleases
  Tags --> PushTags --> GHRepo
```

---

## 2. Detalhe: Workflow de Release no GitHub Actions

```mermaid
flowchart TD
  classDef pastelStep fill:#eff6ff,stroke:#1d4ed8,color:#020617,stroke-width:1.5px;
  classDef pastelIO fill:#fef9c3,stroke:#a16207,color:#422006,stroke-width:1.5px;

  Trigger["push em main"]:::pastelIO

  Checkout["Checkout repo"]:::pastelStep
  SetupPNPM["Setup pnpm"]:::pastelStep
  SetupNode["Setup Node.js"]:::pastelStep
  SetupGHCLI["Setup gh CLI"]:::pastelStep
  InstallDeps["pnpm install"]:::pastelStep
  ChangesetsAction["changesets/action@v1 (publish: pnpm release)"]:::pastelStep
  PushTags["git push --follow-tags"]:::pastelStep

  Trigger --> Checkout --> SetupPNPM --> SetupNode --> SetupGHCLI --> InstallDeps --> ChangesetsAction --> PushTags
```

---

## 3. Detalhe: Comando `pnpm release`

```mermaid
sequenceDiagram
  autonumber
  participant CI as GitHub Actions Job
  participant PNPM as pnpm
  participant CS as Changesets CLI (changeset tag)
  participant Script as create-releases.js
  participant Git as Git local
  participant GH as GitHub

  CI->>PNPM: executar pnpm release (changeset tag)
  PNPM->>CS: rodar changeset tag
  CS->>Git: criar tags locais (@repo/ui@0.3.0, docs@1.0.1, ...)

  PNPM->>Script: rodar node scripts/create-releases.js
  Script->>Git: ler git tag --points-at HEAD
  Git-->>Script: devolver lista de tags locais
  Script->>GH: criar GitHub Releases com gh release create

  CI->>Git: git push --follow-tags
  Git->>GH: enviar commits e tags para o remoto
```

---

## 4. Detalhe: Por que as tags não apareciam no GitHub

```mermaid
flowchart TD
  classDef pastelWarn fill:#fef3c7,stroke:#b45309,color:#7c2d12,stroke-width:1.5px;
  classDef pastelFix fill:#dcfce7,stroke:#16a34a,color:#052e16,stroke-width:1.5px;

  LocalTags["Tags locais criadas"]:::pastelWarn
  NoPush["Sem git push --tags"]:::pastelWarn
  RunnerTerminated["Runner descartado"]:::pastelWarn

  FixStep["Step Push tags"]:::pastelFix
  RemoteTags["Tags remotas no GitHub"]:::pastelFix

  LocalTags --> NoPush --> RunnerTerminated
  LocalTags --> FixStep --> RemoteTags
```

---

## 5. Tema pastel com alto contraste (para Mermaid)

Se você estiver usando Mermaid com suporte a `themeVariables`, pode aplicar algo nessa linha:

```js
{
  theme: 'base',
  themeVariables: {
    primaryColor: '#eff6ff',
    primaryBorderColor: '#1d4ed8',
    primaryTextColor: '#020617',

    secondaryColor: '#ecfdf3',
    secondaryBorderColor: '#15803d',
    secondaryTextColor: '#052e16',

    tertiaryColor: '#fdf2ff',
    tertiaryBorderColor: '#7f1d8d',
    tertiaryTextColor: '#1f2933',

    lineColor: '#1f2933',
    textColor: '#020617',
    mainBkg: '#ffffff'
  }
}
```

---

## 6. Resumo do papel de cada comando

- **`changeset version`**  
  Gera changelogs e atualiza `package.json` nas branches de feature / PR de versionamento.

- **`changeset publish`** (usado em `pnpm release`)  
  - Cria **tags locais** de versão.  
  - Publica pacotes no registry.  
  - Não faz `git push`.

- **`scripts/create-releases.js`**  
  - Lê tags do último commit (`git tag --points-at HEAD`).  
  - Decide para quais tags criar **GitHub Releases** com `gh release create`.

- **`git push --follow-tags`** (step `Push tags` no CI)  
  - Envia commits + **todas as tags novas** para o GitHub.  
  - É o passo que faltava para as tags `@repo/ui@0.3.0`, `docs@1.0.1`, `web@0.1.3` aparecerem na aba **Tags**.
