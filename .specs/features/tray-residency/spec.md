# Tray Residency Specification

## Problem Statement

Fechar a janela do Playground encerra o app inteiro: o `window-all-closed` mata todas as sessões e sai
(`src/main/index.ts:935`). Não existe processo de pé quando a janela está fechada, então nenhum trabalho em
segundo plano (o polling do `ado-triggers`, um futuro agendador de agentes) pode rodar sem a janela aberta,
e fechar a janela por engano derruba agentes no meio do turno. O AD-067 escolheu resolver isso mantendo o
app residente na bandeja e iniciando com o Windows, em vez de um daemon de sessões.

## Goals

- [ ] Fechar a janela pelo X não encerra nenhuma sessão: o app e todas as sessões continuam rodando com a janela oculta (TRAY-01..06)
- [ ] O app só sai por um pedido explícito, e com sessões rodando o owner confirma antes (TRAY-10..16)
- [ ] Com a opção ligada, o app sobe junto com o login do Windows, oculto na bandeja, sem abrir janela (TRAY-20..26)
- [ ] Existe no máximo uma instância do app; abrir o app de novo traz a janela existente (TRAY-30..32)

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Daemon de sessões / sessões que sobrevivem ao app | AD-067: adiado; o PTY host continua morrendo com o app |
| Aplicar update com o app residente (reiniciar sozinho, aviso de "reiniciar para atualizar") | Owner, 2026-11-06: o update continua aplicado só ao sair (`autoInstallOnAppQuit`, `update-service.ts:66`) |
| Eventos de ciclo de vida do `SessionManager` (`spawned`/`finished`/`lost`) | Pertencem ao `ado-triggers`, que é quem os consome (AD-067) |
| Agendador de agentes | Feature própria; esta só garante o processo de pé |
| Marca de "não vista" no ícone da bandeja | O ponto da barra de tarefas (TBDT) já cobre a janela minimizada; notificações nativas cobrem a janela oculta |
| Rodar com o usuário deslogado / serviço do Windows | AD-067: perderia o perfil com as credenciais de `az`, `gh` e `claude` |
| macOS / Linux | O app é só Windows (AD-005) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --------------------- | -------------- | --------- | ---------- |
| O que o X faz | Sempre esconde a janela; não depende de haver sessões | Owner, 2026-11-06; comportamento previsível | y |
| Iniciar com o Windows | Opção desligada de fábrica; ligada, sobe oculto na bandeja | Owner, 2026-11-06 | y |
| Sair com sessões rodando | Diálogo nativo de confirmação com a contagem; sem sessões, sai direto | Owner, 2026-11-06 | y |
| Aplicação de update | Só ao sair, como hoje | Owner, 2026-11-06 | y |
| Onde a opção de login é guardada | No próprio registro de login do Windows (`app.setLoginItemSettings` / `getLoginItemSettings`), não em `config.json` | Uma só fonte da verdade; o owner pode desligar pelo Gerenciador de Tarefas e a UI reflete | y |
| Como o app sabe que subiu pelo login | Argumento `--hidden` gravado no item de login | `openAsHidden` só existe no macOS | y |
| Janela oculta | `hide()` mantendo o renderer vivo, não destruir e recriar | Reabrir é instantâneo e o terminal anexado não perde estado; custo é a memória do renderer | y |
| Opção de login fora do build empacotado | Desabilitada na UI com a nota "only in the installed app"; nada é gravado | Em `electron-vite dev` o item apontaria para o `electron.exe` do repo | y |
| Encerramento do Windows (logoff/desligar) | Sai sem diálogo, encerrando as sessões | Um diálogo bloquearia o logoff | y |
| Minimizar | Inalterado: vai para a barra de tarefas | Só o X muda | y |
| Textos | Em inglês, como o resto da UI (`Open Playground`, `Quit`) | Consistência com `SettingsDialog.tsx` | y |
| Visual | Só um checkbox na aba General e menus/diálogos nativos; sem handoff novo | Nenhuma superfície custom nova | y |

**Open questions:** none - all resolved or logged above (required before the spec is confirmed).

---

## User Stories

### P1: Fechar a janela mantém o app e as sessões rodando ⭐ MVP

**User Story**: As the owner, I want the window's X to hide the app to the tray so that running agents and background work keep going while the window is closed.

**Why P1**: É a condição para qualquer trabalho em segundo plano (AD-067).

**Acceptance Criteria**:

1. WHEN the app becomes ready THEN the app SHALL show a tray icon using the app icon with the tooltip `Playground` <!-- TRAY-01 -->
2. WHEN the user closes the main window (X, Alt+F4) THEN the app SHALL hide the window and SHALL NOT stop any session <!-- TRAY-02 -->
3. WHILE the window is hidden the app SHALL keep every running session's PTY, its activity hooks and its notifications working <!-- TRAY-03 -->
4. WHEN the user clicks the tray icon THEN the app SHALL show, restore and focus the main window <!-- TRAY-04 -->
5. The tray icon's context menu SHALL offer `Open Playground` (same as TRAY-04) and `Quit` <!-- TRAY-05 -->
6. WHEN the user clicks a native notification while the window is hidden THEN the app SHALL show and focus the window on that session <!-- TRAY-06 -->

**Independent Test**: Abrir uma sessão, fechar a janela pelo X, esperar o agente terminar o turno: chega a notificação nativa; clicar no ícone da bandeja reabre a janela com o terminal no estado atual.

---

### P1: Sair é explícito e confirmado ⭐ MVP

**User Story**: As the owner, I want quitting to be an explicit action that warns me about running sessions so that I never kill agents by accident.

**Why P1**: Sem uma saída, o X deixaria de ser o único jeito de encerrar o app e o update nunca seria aplicado.

**Acceptance Criteria**:

1. WHEN the user picks `Quit` with no running session THEN the app SHALL quit without a dialog <!-- TRAY-10 -->
2. WHEN the user picks `Quit` with N ≥ 1 running sessions THEN the app SHALL show a native dialog reading `N running session(s) will be stopped. Quit anyway?` with buttons `Quit` and `Cancel`, `Cancel` the default <!-- TRAY-11 -->
3. WHEN the user confirms `Quit` THEN the app SHALL stop every session and quit through the existing shutdown path (PTY host shutdown, time tracker close, hook server stop) <!-- TRAY-12 -->
4. WHEN the user picks `Cancel` THEN the app SHALL keep running with every session untouched <!-- TRAY-13 -->
5. WHEN the app quits THEN a downloaded update SHALL be applied as today (`autoInstallOnAppQuit`) <!-- TRAY-14 -->
6. WHEN Windows ends the user session (logoff, shutdown, restart) THEN the app SHALL quit without a dialog <!-- TRAY-15 -->
7. WHEN the app quits THEN the tray icon SHALL be removed <!-- TRAY-16 -->

**Independent Test**: Com duas sessões rodando, `Quit` na bandeja mostra "2 running session(s)…"; `Cancel` mantém as duas; `Quit` encerra o app e nenhum `pwsh`/`claude` fica órfão.

---

### P1: Iniciar com o Windows, oculto ⭐ MVP

**User Story**: As the owner, I want an option to start Playground at Windows login, hidden in the tray, so that background work is running without me opening the app.

**Why P1**: Sem ela, um reboot deixa o app parado até alguém abri-lo.

**Acceptance Criteria**:

1. The Settings dialog's General tab SHALL show a checkbox `Start Playground when Windows starts` with the note `opens hidden in the tray` <!-- TRAY-20 -->
2. The checkbox SHALL reflect the OS login item state read when the dialog opens, unchecked by default <!-- TRAY-21 -->
3. WHEN the user toggles the checkbox THEN the app SHALL register or remove the login item for the installed executable with the argument `--hidden` at once, as the dialog's shell and notification switches persist on change <!-- TRAY-22 -->
4. WHEN the app starts with `--hidden` THEN the app SHALL create the window without showing it and SHALL show the tray icon <!-- TRAY-23 -->
5. WHEN the app starts without `--hidden` THEN the app SHALL show the window as today <!-- TRAY-24 -->
6. WHERE the app is not packaged the checkbox SHALL be disabled with the note `only in the installed app` and the app SHALL never write a login item <!-- TRAY-25 -->
7. IF registering or removing the login item fails THEN the checkbox SHALL return to the OS state read back after the attempt and the dialog SHALL show `Couldn't change the startup setting: <failure line>` under it <!-- TRAY-26 -->

**Independent Test**: No app instalado, marcar a opção, salvar, fazer logoff/login: o ícone aparece na bandeja sem janela; clicar nele abre a janela. Desmarcar e repetir: nada sobe.

---

### P1: Instância única ⭐ MVP

**User Story**: As the owner, I want opening Playground again to bring up the running instance so that a resident app and a second launch never fight over config and sessions.

**Why P1**: Com o app residente oculto, abrir pelo atalho criaria uma segunda instância com outro PTY host, hook server e escritas concorrentes no `config.json`.

**Acceptance Criteria**:

1. The app SHALL hold a single-instance lock; IF the lock is already held THEN the new process SHALL quit before creating any window, PTY host or hook server <!-- TRAY-30 -->
2. WHEN a second launch happens THEN the running instance SHALL show, restore and focus its window, even when that launch carries `--hidden` <!-- TRAY-31 -->
3. WHEN the app starts and the lock is acquired THEN the app SHALL behave as TRAY-23/TRAY-24 <!-- TRAY-32 -->

**Independent Test**: Com o app oculto na bandeja, abrir pelo atalho do Menu Iniciar: a janela existente aparece e o Gerenciador de Tarefas mostra uma só árvore de processos do Playground.

---

## Edge Cases

- WHEN the window is hidden and the user starts a quit from the tray THEN TRAY-11 SHALL show its dialog without first showing the main window (covered by TRAY-11)
- IF the app quits through a path other than `Quit` (TRAY-15, update installer, crash) THEN the existing `will-quit` guard SHALL still wait for the PTY host (AD-053) (covered by TRAY-12)
- WHEN the window is hidden while a session is attached THEN the attached terminal SHALL keep receiving data, so reopening shows the current screen (covered by TRAY-03/TRAY-04)

---

## Implicit-Requirement Dimensions Sweep

| Dimension | Resolution |
| --------- | ---------- |
| Input validation & bounds | N/A because the only input is a checkbox and the `--hidden` flag |
| Failure / partial-failure | TRAY-26 (login item write fails) |
| Idempotency / dedup | TRAY-30/31: single instance; TRAY-22 writes the login item from the checkbox state, so repeated saves converge |
| Auth boundaries | N/A because nothing new is exposed; no network, no IPC caller outside the renderer |
| Concurrency / ordering | TRAY-30: the lock is taken before any window, PTY host or hook server exists |
| Data lifecycle | Login item lives in the OS, removed by TRAY-22; the NSIS uninstaller leaves a stale entry only if the user left it on (accepted) |
| Observability | TRAY-26 inline error; quit dialog shows the session count (TRAY-11) |
| External-dependency failure | TRAY-26 |
| State-transition integrity | Window `shown` ↔ `hidden` (TRAY-02/04/06/31); app `running` → `quitting` only through TRAY-10/12/15 |

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| TRAY-01 | P1: Fechar mantém rodando | Design | Pending |
| TRAY-02 | P1: Fechar mantém rodando | Design | Pending |
| TRAY-03 | P1: Fechar mantém rodando | Design | Pending |
| TRAY-04 | P1: Fechar mantém rodando | Design | Pending |
| TRAY-05 | P1: Fechar mantém rodando | Design | Pending |
| TRAY-06 | P1: Fechar mantém rodando | Design | Pending |
| TRAY-10 | P1: Sair explícito | Design | Pending |
| TRAY-11 | P1: Sair explícito | Design | Pending |
| TRAY-12 | P1: Sair explícito | Design | Pending |
| TRAY-13 | P1: Sair explícito | Design | Pending |
| TRAY-14 | P1: Sair explícito | Design | Pending |
| TRAY-15 | P1: Sair explícito | Design | Pending |
| TRAY-16 | P1: Sair explícito | Design | Pending |
| TRAY-20 | P1: Iniciar com o Windows | Design | Pending |
| TRAY-21 | P1: Iniciar com o Windows | Tasks | Implementing |
| TRAY-22 | P1: Iniciar com o Windows | Tasks | Implementing |
| TRAY-23 | P1: Iniciar com o Windows | Design | Pending |
| TRAY-24 | P1: Iniciar com o Windows | Design | Pending |
| TRAY-25 | P1: Iniciar com o Windows | Tasks | Implementing |
| TRAY-26 | P1: Iniciar com o Windows | Tasks | Implementing |
| TRAY-30 | P1: Instância única | Design | Pending |
| TRAY-31 | P1: Instância única | Design | Pending |
| TRAY-32 | P1: Instância única | Design | Pending |

**Coverage:** 23 total, 0 mapped to tasks, 23 unmapped ⚠️

---

## Success Criteria

- [ ] Fechar a janela com N sessões rodando deixa as N rodando; reabrir pela bandeja mostra cada terminal no estado atual
- [ ] Nenhum caminho além de `Quit` confirmado, logoff do Windows ou crash encerra sessões
- [ ] Com a opção ligada, após um login do Windows o app está na bandeja sem janela visível
- [ ] Em nenhum momento existem dois processos principais do Playground
