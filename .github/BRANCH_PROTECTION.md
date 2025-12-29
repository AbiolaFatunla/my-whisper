# Branch Protection Setup Guide

To maximize the security value of this CI/CD pipeline for recruiters and interviewers, configure branch protection rules in GitHub.

## Steps to Configure

1. Go to your repository on GitHub
2. Navigate to **Settings** > **Branches**
3. Click **Add branch protection rule**
4. Set **Branch name pattern** to `main`

## Recommended Settings

### Protect Matching Branches

- [x] **Require a pull request before merging**
  - [x] Require approvals: `1`
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [x] Require review from Code Owners

- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - Required status checks:
    - `Build & Test` (from ci.yml)
    - `Analyze JavaScript/TypeScript` (from codeql.yml)
    - `Gitleaks Secret Scan` (from secrets-scan.yml)
    - `Trivy Vulnerability Scan` (from trivy.yml)

- [x] **Require conversation resolution before merging**

- [x] **Require signed commits** (optional but impressive)

- [x] **Require linear history**
  - Enforces clean git history with rebases

- [x] **Do not allow bypassing the above settings**

### Rules Applied to Everyone Including Administrators

- [x] **Include administrators**

## Why This Matters to Recruiters

### For AI Engineer Roles
- Shows you understand AI security (OWASP LLM Top 10)
- Demonstrates you can operationalize AI tools in production
- Proves security-conscious development practices

### For AI Solutions Architect Roles
- Complete CI/CD pipeline design
- Defense-in-depth security architecture
- Modern DevSecOps implementation
- Supply chain security awareness

### For Security-Focused Roles
- Multiple layers of security scanning
- Secrets management
- Dependency vulnerability management
- Workflow hardening with StepSecurity

## Talking Points for Interviews

1. **"I implemented a multi-layered security scanning pipeline..."**
   - SAST with CodeQL
   - Secrets detection with Gitleaks
   - Dependency scanning with Trivy
   - AI-powered code review with Claude

2. **"I'm aware of modern supply chain attacks..."**
   - Reference the March 2025 GitHub Actions attack
   - Explain why you use Harden-Runner
   - Discuss SHA pinning for actions

3. **"For AI applications, I follow OWASP LLM Top 10..."**
   - Prompt injection prevention
   - Secure handling of AI outputs
   - API key protection
   - Rate limiting

4. **"The pipeline is designed for zero-cost operation..."**
   - All tools are free for public repositories
   - Only cost is Anthropic API for Claude reviews (optional)

## Quick Reference: Required GitHub Secrets

| Secret | Purpose | Required |
|--------|---------|----------|
| `ANTHROPIC_API_KEY` | Claude Code reviews | For AI review features |
| `GITLEAKS_LICENSE` | Enterprise features | Optional |

`GITHUB_TOKEN` is automatically provided by GitHub Actions.

---

After configuring, your repository will show:
-  Protected branch badge
-  Required checks on PRs
-  Security scanning results in the Security tab
