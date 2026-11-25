# Git & GitHub Workflow Standard for raintyaa

This rule guides the AI Agent to help **raintyaa** execute clean, standardized, and safe Git & GitHub workflows across any new or existing project.

---

## 🎯 Core Principles
1. **Never Commit Directly to Untested Code**: Ensure code builds or runs before committing.
2. **Conventional Commits**: Use semantic prefixes (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `chore:`).
3. **Feature Branching**: Use dedicated branches for new features or risky experimental code instead of committing directly to `main`.
4. **Clean & Iterative History**: Encourage small, daily commits to maintain a healthy GitHub contribution graph.

---

## 🚀 1. New Project Initial Push (Step-by-Step)
When starting a brand new project and connecting it to a fresh GitHub repository:

```bash
git init
git add .
git commit -m "feat: initial commit - [short project description]"
git branch -M main
git remote add origin https://github.com/raintyaa/<repository-name>.git
git push -u origin main
```

---

## 🌿 2. Feature Branching Workflow
When adding a major new feature, UI change, or refactoring:

### Step 1: Create & Switch to a New Branch
```bash
git checkout -b <branch-type>/<feature-name>
# Example: git checkout -b feat/pixel-art-table
```

### Step 2: Commit & Push the Branch
```bash
git add .
git commit -m "<type>: <description>"
git push -u origin <branch-type>/<feature-name>
```

### Step 3: Merge back to `main` (when tested & stable)
```bash
git checkout main
git merge <branch-type>/<feature-name>
git push
```

---

## 📝 3. Conventional Commit Prefixes
Always suggest and use these commit message prefixes:

* `feat:` New feature added (e.g., `feat: add expense calculation logic`)
* `fix:` Bug fix (e.g., `fix: resolve incorrect total balance calculation`)
* `docs:` Documentation changes (e.g., `docs: update README with setup instructions`)
* `style:` Formatting, UI tweak, or pixel art asset update without code logic change (e.g., `style: update retro button icons`)
* `refactor:` Code restructuring without changing functionality (e.g., `refactor: simplify database query helper`)
* `chore:` Configuration, dependencies, or repo maintenance (e.g., `chore: add .gitignore for python cache`)

---

## 🔄 4. Daily 3-Step Commit Cycle
For regular day-to-day updates on an existing project:

$$\text{git add .} \longrightarrow \text{git commit -m "<type>: <description>"} \longrightarrow \text{git push}$$

*(Since `-u` was executed initially, `git push` without extra arguments is sufficient).*
