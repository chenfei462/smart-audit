# Workspace Page Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current single long dashboard into route-based section pages with shared navigation and preserved task deep links.

**Architecture:** Keep the existing backend and module logic. Add a lightweight client-side page router that shows one major workspace section at a time, while preserving `#/tasks/:kind/:id` deep links for task detail selection. Reuse the current render functions and role checks; only change page visibility and navigation.

**Tech Stack:** Static HTML, vanilla JavaScript modules, existing Actix backend, hash-based client routing.

---

### Task 1: Add workspace navigation and route state

**Files:**
- Modify: `static/index.html`
- Modify: `static/app/main.js`

- [ ] Add a visible workspace navigation bar with routes for import, tasks, cases, rectification, operations, automation, and admin.
- [ ] Add hash-based page routing that does not conflict with existing task deep links.
- [ ] Make the default landing route open the first workspace page instead of the full stacked dashboard.

### Task 2: Split the workspace into route-controlled sections

**Files:**
- Modify: `static/index.html`
- Modify: `static/app/auth.js`
- Modify: `static/app/cases.js`
- Modify: `static/app/rectification.js`
- Modify: `static/app/operations.js`
- Modify: `static/app/configuration.js`
- Modify: `static/app/admin.js`

- [ ] Wrap each major workspace area in a dedicated page container.
- [ ] Show and hide containers based on the current route and role.
- [ ] Keep existing render functions working without rewriting their data flow.

### Task 3: Keep task detail routing working

**Files:**
- Modify: `static/app/tasks.js`
- Modify: `static/app/main.js`

- [ ] Preserve `#/tasks/:kind/:id` deep linking and task selection.
- [ ] Ensure switching to the tasks page restores the current task selection.
- [ ] Ensure task selection updates the address bar without forcing other pages open.

### Task 4: Verify the split layout in the browser

**Files:**
- No code changes expected

- [ ] Start or reuse the local app.
- [ ] Check page switching, role visibility, and task deep links in a browser.
- [ ] Confirm the dashboard no longer reads as one long page.
