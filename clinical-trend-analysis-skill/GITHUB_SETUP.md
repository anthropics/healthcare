# GitHub: `rupesh-kartha/skills`

This skill lives **inside** the monorepo:

**https://github.com/rupesh-kartha/skills** → folder **`clinical-trend-analysis-skill/`**

Web UI path: `github.com/rupesh-kartha/skills/tree/main/clinical-trend-analysis-skill`

## Clone

```bash
git clone https://github.com/rupesh-kartha/skills.git
cd skills/clinical-trend-analysis-skill
python evals/run_clinical_trend_eval.py   # needs bundles in synthea-data/
```

## First-time push (maintainers)

From the **`skills`** repo root (parent of this folder):

```bash
cd /path/to/skills
git init   # if new
git add -A
git commit -m "Add clinical-trend-analysis-skill"
git branch -M main
git remote add origin https://github.com/rupesh-kartha/skills.git
git push -u origin main
```

Create the empty **`skills`** repository on GitHub first (no README from the UI).
