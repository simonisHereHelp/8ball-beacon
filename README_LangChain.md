# README_LangChain

LangChain examples for **SEC EDGAR AgentKit** (monorepo) — build an agent that can fetch and analyze SEC EDGAR filings using the AgentKit LangChain integration. citeturn5search4

> Target repo (examples): https://github.com/stefanoamorelli/sec-edgar-agentkit/tree/main/examples

---

## What this repo is

`sec-edgar-agentkit` is an AI-agent toolkit for accessing and analyzing SEC EDGAR filing data, with integrations for frameworks like **LangChain**. citeturn5search4

This README is tailored for running the **LangChain** examples in the `examples/` folder using **Bun** on Windows.

---

## Prerequisites

- **Windows 10 1809+ / Windows 11**
- **PowerShell** (recommended: PowerShell 7)
- An LLM provider API key (e.g., OpenAI / Anthropic) depending on the example you run
- (Recommended) Git for Windows

---

## How to set up Bun on a Windows device

1) **Install Bun (recommended: PowerShell install script)** citeturn5search0turn5search6

Open **PowerShell** and run:

```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

2) **Verify installation** citeturn5search0

```powershell
bun --version
bun --revision
```

3) **If `bun` is not recognized**
- Close and reopen your terminal (PATH refresh)
- Ensure your Bun install directory is in PATH (the installer typically configures this automatically)

---

## Kick start Bun

From the repo root:

```powershell
git clone https://github.com/stefanoamorelli/sec-edgar-agentkit.git
cd sec-edgar-agentkit
```

If the example you want is a standalone Bun project, you’ll usually do one of these:

### Option A — install & run an existing example
```powershell
cd examples
# pick the example folder you want
cd <example-folder>

bun install
bun run dev   # or: bun run start
```

### Option B — create a fresh Bun app (if you’re prototyping)
```powershell
bun init
bun install
bun run index.ts
```

---

## LangChain + AgentKit quick start (typical pattern)

> Exact filenames/scripts can vary per example folder; the pattern below is what most LangChain tool/agent examples follow.

1) **Set environment variables**

The SEC recommends a descriptive User-Agent string for programmatic access patterns; many EDGAR tools expect you to provide one. Configure:

```powershell
# Example (edit to match your info/policy)
$env:SEC_EDGAR_USER_AGENT="Your Name your@email.com"
```

Then set your LLM key, for example:

```powershell
$env:OPENAI_API_KEY="...your key..."
# or
$env:ANTHROPIC_API_KEY="...your key..."
```

2) **Install dependencies**

```powershell
bun install
```

3) **Run the example**

```powershell
bun run dev
# or
bun run start
```

---

## Common issues on Windows

- **Execution policy blocks scripts**
  - Run PowerShell as Admin, then:
    ```powershell
    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
    ```
- **Corporate proxy blocks `irm bun.sh/...`**
  - Try installing via npm:
    ```powershell
    npm install -g bun
    ```
  - Or use an allowed network / proxy configuration.

---

## Useful references

- Bun installation docs citeturn5search0
- Bun repo install instructions citeturn5search6
- SEC EDGAR AgentKit repo overview citeturn5search4
