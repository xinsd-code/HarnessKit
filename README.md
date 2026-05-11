# HarnessKit (Custom Fork)

A unified management tool for AI coding agents. HarnessKit brings all your agent configurations, skills, MCP servers, plugins, and hooks under one roof — allowing you to see, secure, and manage everything across every agent from one place.

## Overview

Modern AI coding agents (Claude Code, Cursor, Windsurf, Antigravity, etc.) scatter their extensions and configurations across different directories and formats. HarnessKit solves this by providing a clean, centralized interface (both Desktop App and Web UI) to manage them all.

### Key Features

- **Multi-Agent Management**: Supports 16+ agents including Claude Code, Codex, Cursor, Windsurf, Antigravity, and GitHub Copilot.
- **Full Suite Extensions**: Manage Skills, MCP Servers, Plugins, Hooks, and Agent-first CLIs across all your agents.
- **Scope Awareness**: Smartly distinguish between **Global** extensions and **Project-specific** extensions. Global assets are clearly tagged and grouped when viewing project environments.
- **Local Hub Sync**: A built-in local backup center to backup, sync, and restore extensions across different agents and projects.
- **Security Audit**: Built-in static analysis rules to give extensions a Trust Score, ensuring your workspace remains secure.
- **Marketplace Integration**: Discover and install new skills and MCP servers directly from public registries.

## Development Setup

This project uses a standard web frontend (React + Vite + Tailwind CSS) coupled with a Tauri Rust backend.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://rustup.rs/) (latest stable)
- [Tauri CLI](https://tauri.app/)

### Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the application in development mode:**
   ```bash
   npm run dev
   ```
   *This starts both the Vite dev server and the Tauri window.*

3. **Build the production application:**
   ```bash
   npm run build
   ```

4. **Package the Desktop App:**
   ```bash
   cargo tauri build
   ```
   *Note: Automated desktop and CLI builds for multiple platforms are also configured via GitHub Actions in `.github/workflows/release.yml`.*

## Architecture & Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Zustand (State Management), Lucide Icons.
- **Backend/Desktop**: Rust, Tauri v2.
- **CLI**: The Rust binary can also function as a standalone CLI (`hk`), serving the frontend as a web UI for remote or headless environments.

---

*fork from https://github.com/RealZST/HarnessKit*
