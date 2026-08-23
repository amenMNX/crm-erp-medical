# CI/CD Guide — crm-erp-radiotherapy

This document describes recommended Continuous Integration and Continuous Deployment (CI/CD) practices, example GitHub Actions workflows, and operational notes for deploying the `crm-erp-radiotherapy` project.

1. Goals
 - Run tests and linters on every PR to keep quality high.
 - Build reproducible artifacts (Docker images) and store them in a registry.
 - Deploy automatically to staging on successful merges to `main` (or a dedicated `staging` branch).
 - Provide a safe, optionally manual, promotion path from staging to production.
 - Ensure safe database migrations and easy rollback strategy.

2. Pipeline stages (recommended)
 - Validate: syntax checks, dependency checks.
 - Test: run backend unit tests, frontend unit tests, and integration tests.
 - Lint & Format: run `flake8`/`black` for Python and `eslint`/`prettier` for frontend.
 - Build: create frontend static assets and backend Docker image.
 - Security scan: optional SAST (e.g., `dependabot`, `snyk`, `trivy` for images).
 - Publish: push Docker images to container registry (ECR, ACR, GCR, Docker Hub).
 - Deploy (staging): deploy new images automatically to staging environment.
 - Deploy (production): manual approval or gated promotion from staging.

3. Git branching & release model
 - Use feature branches and open PRs to `develop` or `main` depending on your branching model.
 - Protect `main`/`release` branches with required status checks (CI jobs + reviews).
 - Use semantic version tags (vMAJOR.MINOR.PATCH) for production releases.

4. Environment & secrets
 - Store secrets in GitHub Secrets, a cloud secrets manager, or Vault.
 - Required secrets (examples): `DOCKER_REGISTRY`, `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `PROD_DB_URL`, `STAGING_DB_URL`, `CLOUD_CREDENTIALS`.
 - Avoid committing `.env` files to the repository.

5. Database migrations strategy
 - Always generate migrations locally and include them in PRs.
 - In CI, run migrations against a transient test database to validate migration scripts.
 - In production, perform migrations with care:
   - Prefer zero-downtime, backwards-compatible migrations: Add new columns nullable, backfill data, flip reads, then remove old columns.
   - Use a maintenance window for destructive/failing migrations.
   - Keep previous application image available to rollback quickly if migration + deploy fails.

6. Rollback plan
 - Keep previous image tags in registry; deploy the last-known-good image if a release breaks.
 - Revert migrations only if safe; prefer forward-fix migrations.
 - Monitor errors and performance after each release to detect regressions early.

7. Observability & post-deploy checks
 - Run smoke tests after deploy: login, create patient, schedule appointment, create invoice.
 - Verify health endpoint (`/api/dashboard/health/`) and key metrics.
 - Configure alerts for high error rates, high latency, or job failures.

8. GitHub Actions examples

8.1 CI workflow (tests, lint, build)

Create `.github/workflows/ci.yml` with a job to validate backend and frontend.

```yaml
name: CI

on:
  pull_request:
    branches: [ main ]
  push:
    branches: [ main ]

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_USER: postgres
          POSTGRES_DB: test_db
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd "pg_isready -U postgres -d test_db"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install backend deps
        run: |
          python -m pip install --upgrade pip
          pip install -r backend/requirements.txt
      - name: Run migrations and tests
        env:
          DATABASE_URL: postgres://postgres:postgres@127.0.0.1:5432/test_db
        run: |
          cd backend
          python manage.py migrate
          python manage.py test

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'
      - name: Install & test frontend
        run: |
          cd frontend
          npm ci
          npm run build --if-present
          npm test --if-present
```

8.2 Build & Publish Docker images

Create `.github/workflows/build-and-push.yml` to build and publish images when commits are merged to `main`.

```yaml
name: Build and Publish
on:
  push:
    branches: [ main ]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      - name: Login to registry
        uses: docker/login-action@v2
        with:
          registry: ${{ secrets.DOCKER_REGISTRY }}
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      - name: Build backend image
        run: |
          docker build -f backend/Dockerfile -t ${{ secrets.DOCKER_REGISTRY }}/crm-erp-backend:${{ github.sha }} backend
      - name: Build frontend image (optional)
        run: |
          cd frontend
          npm ci
          npm run build
          docker build -f Dockerfile -t ${{ secrets.DOCKER_REGISTRY }}/crm-erp-frontend:${{ github.sha }} .
      - name: Push images
        run: |
          docker push ${{ secrets.DOCKER_REGISTRY }}/crm-erp-backend:${{ github.sha }}
          docker push ${{ secrets.DOCKER_REGISTRY }}/crm-erp-frontend:${{ github.sha }}
```

8.3 Deploy to staging (example using SSH/Ansible or kubectl)

This step depends on your infra. Example with Kubernetes:

```yaml
name: Deploy Staging
on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up kubectl
        uses: azure/setup-kubectl@v3
      - name: Authenticate to cluster
        run: |
          echo "${{ secrets.KUBE_CONFIG_DATA }}" | base64 --decode > kubeconfig
          export KUBECONFIG=$PWD/kubeconfig
      - name: Update deployment images
        run: |
          kubectl set image deployment/crm-erp-backend crm-erp-backend=${{ secrets.DOCKER_REGISTRY }}/crm-erp-backend:${{ github.sha }} -n staging
          kubectl set image deployment/crm-erp-frontend crm-erp-frontend=${{ secrets.DOCKER_REGISTRY }}/crm-erp-frontend:${{ github.sha }} -n staging
      - name: Run smoke tests
        run: |
          # Simple smoke test: health endpoint
          curl -f https://staging.example.com/api/dashboard/health/ || exit 1
```

8.4 Promote to production
 - Use a manual approval step (GitHub Environments with required reviewers) or a separate workflow triggered by a release tag.
 - Before promotion, ensure backups and a rollback plan are in place.

9. Additional recommendations
 - Use immutability: tag images with commit SHA and never overwrite tags.
 - Use feature flags for risky changes.
 - Automate DB backups before production deployments that include schema changes.
 - Run dependency vulnerability scans periodically.
 - Use infrastructure-as-code (Terraform, Helm) to manage deploys reproducibly.

10. Quick commands for dev & ops

Build backend image locally:

```bash
docker build -f backend/Dockerfile -t crm-erp-backend:local backend
```

Run backend tests locally:

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1  # PowerShell on Windows
pip install -r requirements.txt
python manage.py test
```

11. Where to put workflows
 - Add workflow YAML files under `.github/workflows/` in the repository root.

12. Next steps I can help with
 - Create the example workflows in `.github/workflows/` and push as draft PRs.
 - Add environment definitions (staging/production) and required reviewers.
 - Produce a short runbook for releases and rollbacks.

---

File created: `ci-cd.md` in the repository root. Let me know if you want the workflows added as actual files under `.github/workflows/` next.
