# Security Analysis: CI/CD Pipeline Findings

**Author:** Abiola Fatunla
**Date:** 29 December 2025
**Project:** My Whisper - Voice Dictation App
**Stage:** Development (Pre-production)

---

## Overview

This document analyses the security findings from my GitHub Actions CI/CD pipeline. The purpose is to demonstrate a risk-based approach to security during development - understanding what each finding means, assessing whether it applies to the current stage of the project, and documenting the decisions made.

This is a point-in-time analysis, not an automated report. It captures the thinking and decision-making process around security findings at this stage of development.

---

## DevSecOps Approach

This project integrates security into the CI/CD pipeline from day one. Security is part of the build process, not a separate phase.

### What This Means in Practice

**Security scanning on every commit:**
- Static Application Security Testing (SAST) via CodeQL
- Dependency vulnerability scanning via npm audit and Trivy
- Secrets detection via Gitleaks
- SBOM generation in CycloneDX format via Trivy
- Results uploaded to GitHub Security tab for tracking

**Security as code:**
- The security workflows themselves are version-controlled in `.github/workflows/`
- Security configuration is reviewable, auditable, and reproducible
- Changes to security tooling go through the same PR process as application code

**Continuous feedback:**
- Dependabot monitors dependencies and creates PRs for updates
- Scheduled scans catch newly disclosed vulnerabilities
- Findings are visible immediately, integrated into the development workflow

**Risk-based decision making:**
- Not every finding requires immediate remediation
- Decisions consider: actual attack surface, development stage, remediation effort, and architectural impact
- Deferral is a valid choice when properly reasoned and documented

### Why This Matters

The value isn't just in having the tools - it's in how findings are handled. The sections below demonstrate the analysis and decision-making process for each finding, including when and why to defer remediation versus addressing something immediately.

### What's Not Included (and Why)

The current pipeline covers SAST, SCA, and secrets detection. Some security tooling is intentionally deferred:

**DAST (Dynamic Application Security Testing)**

Tools like OWASP ZAP or Nuclei test a running application by sending requests and analysing responses. This isn't included because:
- DAST requires a deployed, running application - this project only runs locally
- The application isn't functionally complete yet
- SAST is already identifying the key vulnerabilities

DAST would be added when there's a staging environment to scan, likely using OWASP ZAP's baseline scan in CI/CD or Nuclei for faster template-based checks.

**Verified Secrets Detection**

Gitleaks finds patterns that look like secrets. TruffleHog can go further by verifying if detected credentials are still active (making actual API calls to test them). This isn't included because:
- Gitleaks is sufficient for catching accidentally committed secrets
- Verification adds latency and requires outbound network access
- There are no live credentials in the repository to verify

For a production codebase with historical commits, TruffleHog's verification mode would add value by distinguishing between rotated and active credentials.

---

## Security Workflows

I've set up four security workflows that run on every push to the repository:

| Workflow | Tool | Purpose |
|----------|------|---------|
| CI | npm audit | Dependency vulnerability scanning |
| CodeQL | GitHub CodeQL | Static Application Security Testing (SAST) |
| Trivy | Aqua Trivy | Filesystem scanning, IaC scanning, SBOM generation |
| Gitleaks | Gitleaks | Secrets detection in git history |

All workflows are currently passing, but "passing" doesn't mean "no findings" - it means nothing blocked the pipeline. The Security tab in GitHub shows the actual findings that need review.

---

## Pipeline Reports Summary

### 1. CI Workflow (Build & Test)

**What it does:**
- Installs dependencies with `npm ci`
- Runs linting (if configured)
- Runs tests (if configured)
- Runs `npm audit --audit-level=high`

**Latest run output:**
```
added 257 packages, and audited 258 packages in 2s
found 0 vulnerabilities
```

**Analysis:** No known vulnerabilities in the dependency tree. This is checked against the npm advisory database which tracks CVEs for JavaScript packages.

**Note:** The linting and testing steps currently pass because there's no linter or test suite configured yet. This is expected at this stage - I'm focused on getting core functionality working first. Adding ESLint and Jest is on the roadmap for Phase 6 (Polish).

---

### 2. CodeQL Analysis (SAST)

**What it does:**
CodeQL is GitHub's static analysis engine. It builds a database of your code and runs queries against it to find security vulnerabilities, bugs, and code quality issues. I've configured it to run the `security-extended` and `security-and-quality` query suites for comprehensive coverage.

**Findings (7 alerts):**

| Severity | Rule ID | Description | Location |
|----------|---------|-------------|----------|
| Critical | js/request-forgery | Server-side request forgery | server.js:252 |
| Critical | js/request-forgery | Server-side request forgery | server.js:399 |
| Medium | js/cors-permissive-configuration | Permissive CORS configuration | server.js:31 |
| Medium | js/http-to-file-access | Network data written to file | server.js:264 |
| Low | js/regex/duplicate-in-character-class | Duplicate character in regex | server.js:133 |
| Low | js/regex/duplicate-in-character-class | Duplicate character in regex | server.js:133 |
| Low | js/unused-local-variable | Unused variable | server.js |

---

### 3. Trivy Security Scan

**What it does:**
Trivy scans the filesystem for vulnerable dependencies and misconfigured infrastructure-as-code files. It's configured to report CRITICAL, HIGH, and MEDIUM severity issues only, and to ignore unfixed vulnerabilities (ones without available patches).

**Latest run:** No findings reported.

**Analysis:** This confirms what npm audit found - no vulnerable dependencies at this time.

---

### 4. Gitleaks (Secrets Detection)

**What it does:**
Gitleaks scans the entire git history looking for accidentally committed secrets like API keys, passwords, database credentials, or tokens.

**Latest run output:**
```
1 commits scanned.
scanned ~738 bytes in 145ms
no leaks found
```

**Analysis:** No secrets in the repository. The `.gitignore` is properly configured to exclude `.env` files and credential files.

---

## Detailed Finding Analysis

### Finding 1: Server-Side Request Forgery (SSRF) - CRITICAL

**What CodeQL detected:**

Two endpoints accept URLs from user input and make HTTP requests to those URLs:

**Location 1: `/api/transcribe` (server.js:252)**
```javascript
const { fileUrl } = req.body;  // User-controlled input
// ...
const response = await fetch(fileUrl);  // Server fetches user-provided URL
```

**Location 2: `/api/audio-proxy` (server.js:399)**
```javascript
const { url } = req.query;  // User-controlled input
// ...
const response = await fetch(url, fetchOptions);  // Server fetches user-provided URL
```

**Why this matters:**

SSRF allows an attacker to make your server send HTTP requests to unintended destinations. Common attack scenarios include:

1. **Cloud metadata access:** An attacker sends `http://169.254.169.254/latest/meta-data/` to access AWS EC2 instance metadata, potentially exposing IAM credentials.

2. **Internal service probing:** Requests to `http://localhost:6379/` or `http://127.0.0.1:5432/` can probe for Redis, PostgreSQL, or other internal services.

3. **Port scanning:** Attackers can map your internal network by observing response times and errors.

**Validation:**

I verified this finding by reviewing the OWASP SSRF Prevention Cheat Sheet and cross-referencing with security research from Snyk and other sources. The finding is legitimate - this is a real vulnerability pattern.

**Decision: Deferred to Phase 6 (Polish)**

**Reasoning:**

| Factor | Assessment |
|--------|------------|
| Current attack surface | None - app runs locally only, no deployment |
| Likelihood of exploitation | Zero - no external access, no network exposure |
| Remediation effort | Low - URL validation is straightforward to implement |
| Architectural impact | None - fix is additive, doesn't require restructuring |
| Dependencies | None - can be implemented independently |

The vulnerability is real, but the risk is currently zero because there's no attack surface. The fix is also straightforward - it's a validation layer, not an architectural change. This means:
- There's no cost to deferring (zero risk now)
- There's no added complexity from deferring (the fix doesn't get harder later)
- Development velocity is preserved for core functionality

If this required fundamental changes to how the transcription flow works, I'd address it now to avoid rework. But since it's an additive validation check, deferral is appropriate.

This will be addressed before any production deployment. The fix approach is documented below.

**Production Fix Approach:**

```javascript
// URL validation helper
function isAllowedUrl(urlString) {
  try {
    const url = new URL(urlString);

    // Only allow HTTPS
    if (url.protocol !== 'https:') {
      return false;
    }

    // Only allow our S3 bucket domain
    const allowedHosts = [
      'voice-recording-app.s3.amazonaws.com',
      'voice-recording-app.s3.us-east-1.amazonaws.com'
    ];

    if (!allowedHosts.includes(url.hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Usage in endpoint
app.post('/api/transcribe', async (req, res) => {
  const { fileUrl } = req.body;

  if (!isAllowedUrl(fileUrl)) {
    return res.status(400).json({ error: 'Invalid file URL' });
  }

  // ... rest of endpoint
});
```

For the audio proxy endpoint, if it needs to remain open for legitimate use cases, additional protections would include:
- Blocking private IP ranges (10.x.x.x, 192.168.x.x, 172.16-31.x.x, 127.x.x.x)
- Blocking the AWS metadata IP (169.254.169.254)
- Disabling redirects with `{ redirect: 'manual' }`
- Rate limiting per IP

---

### Finding 2: Permissive CORS Configuration - MEDIUM

**What CodeQL detected:**

```javascript
app.use(cors({
  origin: '*',  // Allows any website to call the API
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
}));
```

**Why this matters:**

CORS controls which websites can make requests to your API from a browser. With `origin: '*'`, any website on the internet can call your API. If a user is logged in to your app and visits a malicious site, that site can make authenticated requests on their behalf.

**Decision: Deferred to Phase 5 (Authentication)**

**Reasoning:**

| Factor | Assessment |
|--------|------------|
| Current attack surface | None - no authentication means nothing to protect |
| Likelihood of exploitation | Zero - CORS only matters when there are credentials to steal |
| Remediation effort | Low - single configuration change |
| Architectural impact | None - configuration only |
| Dependencies | Yes - requires knowing the production frontend domain |

CORS restrictions protect authenticated sessions. Without authentication, there's nothing for a malicious site to steal or abuse. The fix also depends on knowing the production frontend URL, which doesn't exist yet.

This is a clear case where the fix has a dependency (auth implementation) that makes early remediation pointless. The fix will be applied as part of Phase 5 when authentication is added.

**Production Fix Approach:**

```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://mywhisper.app',
  credentials: true,  // Allow cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
}));
```

---

### Finding 3: Network Data Written to File - MEDIUM

**What CodeQL detected:**

```javascript
// Line 252-258: Download from user-provided URL
const response = await fetch(fileUrl);
const buffer = await response.arrayBuffer();
const audioFile = Buffer.from(buffer);

// Line 264: Write to filesystem
fs.writeFileSync(tempFilePath, audioFile);
```

**Why this matters:**

Writing untrusted data to disk can be risky if:
1. The filename contains path traversal characters (`../../../etc/passwd`)
2. The content is malicious and gets executed somehow
3. The file fills up disk space (denial of service)

**Validation:**

Looking at the code, the risk is mitigated by:
1. The file is written to `/tmp/` (line 263)
2. `path.basename()` is used which strips directory components, preventing path traversal
3. The file is deleted immediately after use (line 275)
4. The content is only used as input to the Whisper API, not executed

**Decision: Accept (Low residual risk)**

**Reasoning:**

| Factor | Assessment |
|--------|------------|
| Current attack surface | Limited - file written to /tmp/, deleted immediately |
| Likelihood of exploitation | Low - path.basename() prevents directory traversal |
| Remediation effort | Medium - would require streaming approach |
| Architectural impact | Medium - changes how audio processing works |
| Dependencies | Would depend on OpenAI API supporting streams |

The current implementation already mitigates the main risks through:
- Writing to `/tmp/` (not application directories)
- Using `path.basename()` to strip directory components
- Immediate deletion after use (finally block)

The alternative (streaming directly to the API) would require architectural changes to the transcription flow and depends on whether the OpenAI Whisper API supports streaming input. The security benefit is marginal given the existing mitigations.

This is a case where the residual risk is low and the fix would require disproportionate effort. Accept and move on.

---

### Finding 4: Duplicate Character in Regex - LOW

**What CodeQL detected:**

```javascript
.replace(/["'`""'']/g, '')
```

Some quote characters in the character class may be duplicates (e.g., standard `"` vs curly `"`).

**Decision: Fix when convenient (code quality)**

This is a code quality issue, not a security issue. I'll clean this up during the next refactoring pass.

---

### Finding 5: Unused Variable - LOW

**Decision: Fix when convenient (code quality)**

Minor cleanup item. Will address during code review.

---

## Dependabot Pull Requests

Dependabot has created 9 pull requests for dependency updates:

| PR | Package | Current | Proposed | Type |
|----|---------|---------|----------|------|
| #5 | openai | 4.x | 6.x | Major |
| #4 | express | 4.x | 5.x | Major |
| #7 | uuid | 9.x | 13.x | Major |
| #6 | csv-parse | 5.x | 6.x | Major |
| #8 | dotenv | 16.x | 17.x | Major |
| #9 | express-rate-limit | 7.x | 8.x | Major |
| #1-3 | GitHub Actions | Various | Latest | CI |

**Decision: Do not merge yet**

Major version bumps often include breaking changes. The app isn't functional yet (blocked on AWS credentials), so merging these now would mean:
1. I can't test if anything breaks
2. If something does break, I've added another problem to debug

Once the app is working end-to-end, I'll tackle these one at a time with proper testing.

---

## Security Posture Summary

| Finding | Severity | Status | Reasoning |
|---------|----------|--------|-----------|
| SSRF (2 instances) | Critical | Deferred | No attack surface during local development |
| Permissive CORS | Medium | Deferred | No authentication to protect yet |
| Network data to file | Medium | Accepted | Already mitigated by implementation |
| Regex duplicates | Low | Backlog | Code quality, not security |
| Unused variable | Low | Backlog | Code quality, not security |

---

## Secure Development Lifecycle Approach

This project follows a risk-based approach to security that aligns with the Secure Development Lifecycle (SDL):

**1. Shift-Left Security**
Security tooling is integrated from day one. Even though the app is in early development, the CI/CD pipeline includes SAST (CodeQL), dependency scanning (npm audit, Trivy), and secrets detection (Gitleaks).

**2. Risk-Based Prioritisation**
Not every finding needs immediate remediation. The key questions are:
- Is there an actual attack surface?
- What's the likelihood of exploitation?
- What's the potential impact?

For a local development project with no deployment, the answers are: no attack surface, zero likelihood, zero impact. That changes the moment the app goes to production.

**3. Security Gates**
The production deployment plan includes:
- [ ] Fix all Critical and High severity findings
- [ ] Restrict CORS to production frontend domain
- [ ] Implement URL allowlisting for fetch operations
- [ ] Add input validation on all user-controlled data
- [ ] Enable authentication and authorisation
- [ ] Remove temporary RLS bypass policies from Supabase
- [ ] Security review of Supabase Row Level Security policies

**4. Continuous Monitoring**
The workflows run on every push and on a schedule (CodeQL weekly, Trivy daily). This means new vulnerabilities in dependencies will be caught automatically.

---

## Conclusion

The CI/CD pipeline is doing its job - it's finding real issues and giving me visibility into the security posture of the codebase. The critical SSRF findings are legitimate vulnerabilities that would need to be fixed before any production deployment.

At the current stage (local development, no authentication, no external access), the practical risk is zero. But the findings are documented, the fixes are understood, and they're queued for implementation at the appropriate stage.

This is what secure development looks like in practice - not fixing everything immediately regardless of context, but understanding risks, making informed decisions, and building security into the process from the start.

---

## Production Scenario: What Would Change

The analysis above reflects the current context: a development project running locally with no deployment, no users, and no customer data. But what if the context were different?

This section explores how the security decisions would change if My Whisper were:
- Going to production
- Customer-facing
- Handling real user data (voice recordings, transcripts)
- Publicly accessible

### Changed Risk Profile

| Factor | Development | Production |
|--------|-------------|------------|
| Attack surface | None (local only) | Full (internet-facing) |
| Data sensitivity | Test data only | Customer voice recordings, transcripts |
| Regulatory considerations | None | Potentially GDPR, data protection laws |
| Reputational risk | None | Customer trust, brand damage |
| Exploitation likelihood | Zero | Active scanning by attackers |

### Revised Decisions

**SSRF Vulnerabilities (Critical)**

| Development Decision | Production Decision |
|---------------------|---------------------|
| Defer to Phase 6 | **Fix before deployment - mandatory** |

In production, SSRF becomes a genuine attack vector. An attacker could:
- Access AWS metadata endpoints and steal IAM credentials
- Probe internal services
- Use the server as a proxy for attacks on other systems

The fix (URL allowlisting) would be implemented and tested before any production deployment. This would be a release blocker.

**CORS Configuration (Medium)**

| Development Decision | Production Decision |
|---------------------|---------------------|
| Defer to Phase 5 | **Fix as part of auth implementation - mandatory** |

With real user sessions, permissive CORS becomes a session hijacking risk. The production configuration would:
- Restrict origin to the production frontend domain only
- Enable credentials mode for authenticated requests
- Be environment-specific (different settings for staging vs production)

**Network Data to File (Medium)**

| Development Decision | Production Decision |
|---------------------|---------------------|
| Accept (mitigations in place) | **Review and harden** |

The existing mitigations are reasonable, but for production I would:
- Add file size limits to prevent disk exhaustion attacks
- Consider memory-only processing if feasible
- Add monitoring/alerting for unusual file operations
- Review the cleanup logic for race conditions under load

### Additional Security Tooling for Production

The current pipeline would be expanded with:

**DAST (Dynamic Application Security Testing)**
- OWASP ZAP baseline scan against staging environment
- Nuclei scans for known vulnerability patterns
- Run on deployment to staging, not on every commit (too slow)
- Would catch runtime issues SAST can't see

**Verified Secrets Detection**
- Add TruffleHog with verification mode to scheduled scans
- Identifies credentials that are still active vs rotated
- More valuable for repositories with longer history

Note: SBOM generation is already implemented via Trivy in CycloneDX format, uploaded as an artifact on each workflow run.

### Additional Production Considerations

Beyond tooling, a production deployment would require:

**Infrastructure Security**
- HTTPS everywhere (TLS certificates, HSTS headers)
- Rate limiting tuned for production traffic patterns
- Web Application Firewall (WAF) in front of the application
- Network segmentation (application tier, database tier)

**Authentication & Authorisation**
- Proper session management
- Token expiry and refresh handling
- Row Level Security (RLS) policies verified and tested
- Principle of least privilege for database access

**Data Protection**
- Encryption at rest for stored audio and transcripts
- Encryption in transit (S3 bucket policies)
- Data retention policies
- User consent and data deletion capabilities (GDPR)

**Operational Security**
- Centralised logging and monitoring
- Security alerting for suspicious patterns
- Incident response procedures
- Regular dependency updates (not just when Dependabot prompts)

**Pre-Deployment Checklist**

Before any production deployment, I would ensure:

- [ ] All Critical and High severity findings resolved
- [ ] CORS restricted to production domain
- [ ] URL validation implemented for all fetch operations
- [ ] Authentication and authorisation fully tested
- [ ] RLS policies verified with integration tests
- [ ] Penetration testing or security review completed
- [ ] Monitoring and alerting configured
- [ ] Incident response plan documented
- [ ] Data backup and recovery tested
- [ ] DAST scan completed against staging environment
- [x] SBOM generated and attached to release (already implemented)
- [ ] TruffleHog verification scan completed (no active secrets in history)

### The Point

Security decisions are context-dependent. The same finding can be:
- Acceptable to defer in development (zero risk, zero attack surface)
- A release blocker in production (real risk, real consequences)

Understanding this distinction - and being able to articulate the reasoning - is the difference between checking boxes and actually thinking about security.

---

*This document captures security thinking at a point in time (December 2025, development phase). It demonstrates the decision-making process, not just the decisions themselves.*
