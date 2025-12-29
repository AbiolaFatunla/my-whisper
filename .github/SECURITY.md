# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x.x   | Yes |

## How I Handle Security

I take security seriously in this project. The CI/CD pipeline runs multiple layers of scanning on every push and pull request:

| Check | Tool | Frequency |
|-------|------|-----------|
| Static Analysis | CodeQL | Every push/PR + weekly |
| Secrets Detection | Gitleaks | Every push/PR |
| Dependency Vulnerabilities | Trivy | Every push/PR + daily |
| AI-Specific Security | Custom + Claude | Every PR |
| Runtime Protection | Harden-Runner | Every workflow |

### AI/LLM Security

Since this is an AI-powered application, I follow the [OWASP LLM Top 10](https://genai.owasp.org/) guidelines:

- **Prompt Injection** — User input is sanitised before AI processing
- **Insecure Output Handling** — AI responses are validated and escaped
- **Model DoS** — Rate limiting is in place on API endpoints
- **Sensitive Info Disclosure** — Transcriptions are protected with Row Level Security
- **Model Theft** — API keys are stored in environment variables, never committed

### Data Protection

- All user data is isolated using Supabase Row Level Security
- Audio files are stored in private S3 buckets with presigned URLs
- Database connections use TLS encryption
- Sensitive data is not logged

## Reporting a Vulnerability

If you find a security vulnerability, please don't open a public issue. Instead, email me directly.

When reporting, please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

I'll respond within 48 hours. If the issue is confirmed, I'll work on a fix, release a patched version, and credit you in the release notes (unless you prefer to remain anonymous).

## Security Best Practices for Contributors

If you're contributing to this project:

1. **Never commit secrets** — Use environment variables
2. **Validate all input** — Especially before AI processing
3. **Follow least privilege** — Request minimum permissions
4. **Keep dependencies updated** — Dependabot handles this automatically
5. **Review AI output** — Don't trust LLM responses blindly

## Branch Protection

The `main` branch is protected with:
- Required PR reviews
- Required status checks (CI, CodeQL, Trivy, Gitleaks)
- No force pushes
- Linear history enforced

---

Thanks for helping keep this project secure.
