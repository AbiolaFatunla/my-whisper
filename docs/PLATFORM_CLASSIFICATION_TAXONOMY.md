# Platform Classification & Terminology

Industry-standard classifications and professional terminology for describing My Whisper in various contexts.

---

## 1. Industry-Standard Platform Categories

### Primary Classifications

| Category | Fit | Rationale |
|----------|-----|-----------|
| **AI-Powered SaaS** | Strong | Cloud-hosted, multi-tenant, AI core functionality |
| **Speech-to-Text Platform** | Strong | Primary function is voice transcription |
| **Productivity Tool** | Strong | Enables faster note-taking and documentation |
| **Adaptive/Learning System** | Strong | Personalisation engine learns from corrections |
| **Serverless Application** | Strong | Lambda + API Gateway architecture |
| **B2C Web Application** | Moderate | Direct to consumer, but also B2B features |

### Secondary Classifications

| Category | Fit | Rationale |
|----------|-----|-----------|
| Voice AI Application | Yes | Whisper integration for STT |
| Developer Tools | Partial | BA feature generates technical specs |
| Requirements Engineering Tool | Partial | AI BA feature for gathering requirements |
| Personal Productivity App | Yes | Primary use case is personal dictation |

### What It Is NOT

| Category | Why Not |
|----------|---------|
| Real-time Transcription | Batch processing, not live streaming |
| Enterprise Platform | No team features, admin console, or SSO |
| Mobile App | Web-only (responsive, but not native) |
| General-purpose AI | Specific to voice transcription |

---

## 2. Feature-Domain Terminology

### Voice & Audio Domain

| Feature | Professional Term | Technical Term |
|---------|------------------|----------------|
| Voice recording | Audio capture / Voice input | MediaRecorder API |
| Sound visualisation | Audio waveform | Byte frequency analysis |
| Speech-to-text | Transcription / STT | Whisper API integration |
| Title generation | Automatic summarisation | LLM-based titling |

### AI/ML Domain

| Feature | Professional Term | Technical Term |
|---------|------------------|----------------|
| Learning from corrections | Adaptive learning / User feedback loop | LCS diff algorithm |
| Auto-corrections | Personalisation / Learned preferences | Phrase-matching replacement |
| Conversation AI | Conversational interface / Chat agent | GPT-4o-mini integration |
| Requirements extraction | AI-assisted analysis | Structured prompt engineering |

### Infrastructure Domain

| Feature | Professional Term | Technical Term |
|---------|------------------|----------------|
| Cloud hosting | Serverless architecture | Lambda + API Gateway |
| File storage | Object storage | AWS S3 with presigned URLs |
| Database | PostgreSQL backend | Supabase with RLS |
| Deployment | CI/CD pipeline | GitHub Actions workflows |
| Infrastructure code | IaC / Infrastructure as Code | Terraform |

### Security Domain

| Feature | Professional Term | Technical Term |
|---------|------------------|----------------|
| User authentication | OAuth / SSO | Supabase Auth (Google) |
| Data isolation | Multi-tenant security | Row Level Security (RLS) |
| Code scanning | Static analysis / SAST | CodeQL |
| Vulnerability detection | Dependency scanning | Trivy |
| Secret protection | Credential management | Gitleaks |

---

## 3. Comparable Commercial Products

### Direct Competitors (Speech-to-Text)

| Product | Similarity | Key Difference |
|---------|------------|----------------|
| **Otter.ai** | High | Otter focuses on meeting transcription with collaboration; My Whisper focuses on personal dictation with learning |
| **Rev.com** | Moderate | Rev offers human transcription; My Whisper is AI-only |
| **Descript** | Moderate | Descript is video/audio editing; My Whisper is transcription-focused |
| **Whisper (OpenAI)** | Core tech | My Whisper adds personalisation layer on top of Whisper |

### Adjacent Products (Productivity)

| Product | Similarity | Relationship |
|---------|------------|--------------|
| **Notion** | Low | Different purpose, but similar "personal productivity" positioning |
| **Grammarly** | Conceptual | Both learn from user corrections |
| **Google Docs Voice Typing** | Moderate | Similar input method, no learning |

### AI Feature Comparison

| Product | AI Model | Learning | Personalisation |
|---------|----------|----------|-----------------|
| My Whisper | Whisper + GPT-4o | Yes | Phrase-level corrections |
| Otter.ai | Proprietary | Limited | Speaker identification |
| Google STT | Google | No | Voice model training |
| Amazon Transcribe | AWS | Limited | Custom vocabulary |

---

## 4. Professional Role Perspectives

### Software Architect View

> "A well-architected serverless application demonstrating separation of concerns. Frontend static assets on CDN, API layer on Lambda with proper CORS handling, PostgreSQL with Row Level Security for multi-tenant isolation. The personalisation engine uses a clever LCS-based diff algorithm. Infrastructure is Terraform-managed with a solid CI/CD pipeline including SAST and dependency scanning."

**Key points they'd highlight:**
- Serverless architecture choices
- Security-first design (private S3, RLS, auth)
- Infrastructure as Code
- Algorithm implementation (LCS diff)

---

### Product Manager View

> "A voice transcription tool with a unique value proposition: it learns from corrections. The MVP is focused and solves a real problem. The BA feature shows product thinking beyond the core use case. Good analytics potential through the corrections table. Could expand into enterprise with team features."

**Key points they'd highlight:**
- Clear problem/solution fit
- Differentiation through learning
- Growth potential
- Feature prioritisation decisions

---

### Business Analyst View

> "The system captures user behaviour data through the corrections table, enabling insights into transcription accuracy patterns. The BA feature is particularly interesting as a requirements engineering tool. Data model supports analytics on usage patterns, correction frequency, and user engagement."

**Key points they'd highlight:**
- Data capture strategy
- Business intelligence potential
- Requirements documentation workflow
- User engagement metrics

---

### Technical Recruiter View

> "Full-stack developer with demonstrated AWS expertise (Lambda, S3, API Gateway), modern JavaScript, PostgreSQL, and AI integration experience. Shows infrastructure skills with Terraform and DevOps knowledge with GitHub Actions CI/CD. Security-conscious with multiple scanning tools. Shipped to production independently."

**Key points they'd highlight:**
- AWS services used
- Full-stack capability
- AI/ML integration
- DevOps/IaC skills
- Independent delivery

---

### Potential Client View

> "A developer who can take a concept from idea to production independently. The project shows technical depth (custom algorithms, AI integration) and practical delivery skills (working product, deployed infrastructure). The 8-day timeline demonstrates rapid execution capability."

**Key points they'd highlight:**
- End-to-end delivery
- Production quality
- Technical depth
- Fast execution

---

## 5. Recommended Terminology by Context

### Technical Interviews

| Instead of... | Say... |
|---------------|--------|
| "I built a voice app" | "I architected a serverless speech-to-text platform with adaptive personalisation" |
| "It learns from mistakes" | "The personalisation engine uses an LCS-based diff algorithm to extract corrections and apply them with word-boundary matching" |
| "Hosted on AWS" | "Serverless architecture: Lambda for compute, S3 for object storage, API Gateway for routing, all managed via Terraform" |
| "Uses Supabase" | "PostgreSQL backend with Row Level Security for multi-tenant data isolation" |
| "Has security" | "CI/CD pipeline with CodeQL SAST, Trivy dependency scanning, and Gitleaks secrets detection" |

### Non-Technical Stakeholders

| Instead of... | Say... |
|---------------|--------|
| "LCS algorithm" | "A learning system that remembers your corrections and applies them automatically" |
| "Lambda functions" | "Cloud infrastructure that scales automatically and costs almost nothing when not in use" |
| "Row Level Security" | "Each user's data is completely isolated and protected" |
| "Whisper API" | "AI-powered voice recognition from OpenAI, the makers of ChatGPT" |
| "Terraform IaC" | "Infrastructure defined in code, meaning it's reproducible and version-controlled" |

### LinkedIn / Portfolio

| Context | Recommended Phrasing |
|---------|---------------------|
| Headline | "Built AI voice platform with adaptive learning" |
| Skills | AWS Lambda, Terraform, OpenAI Whisper, PostgreSQL, GitHub Actions |
| Summary | "Serverless voice transcription platform integrating multiple AI models with a custom personalisation algorithm" |
| Project title | "My Whisper - AI Voice Transcription with Adaptive Learning" |

### Client Pitches

| Audience | Positioning |
|----------|-------------|
| Startup | "I can take your idea from concept to production in weeks, not months. Here's proof." |
| Enterprise | "I build secure, scalable systems with proper CI/CD, security scanning, and infrastructure as code." |
| Agency | "Full-stack capability with AI integration experience and fast delivery." |

---

## 6. Keyword Bank

### Technical Keywords (CV/Resume)

**Cloud & Infrastructure:**
- AWS Lambda
- AWS S3
- AWS API Gateway
- Serverless Architecture
- Terraform
- Infrastructure as Code (IaC)
- CloudWatch
- CORS Configuration

**Backend:**
- Node.js
- Express.js
- REST API Design
- PostgreSQL
- Supabase
- Row Level Security (RLS)
- JWT Authentication
- Rate Limiting

**Frontend:**
- Vanilla JavaScript
- ES2022
- HTML5
- CSS3
- Responsive Design
- Glassmorphism UI
- MediaRecorder API
- Web Share API

**AI/ML:**
- OpenAI Whisper
- GPT-4o-mini
- Speech-to-Text (STT)
- Natural Language Processing
- Prompt Engineering
- AI Integration
- LLM Applications

**DevOps & Security:**
- GitHub Actions
- CI/CD Pipeline
- CodeQL (SAST)
- Trivy (Vulnerability Scanning)
- Gitleaks (Secrets Detection)
- Dependabot
- OWASP LLM Top 10

**Algorithms:**
- LCS (Longest Common Subsequence)
- Diff Algorithm
- Phrase Matching
- Word Boundary Detection

### Domain Keywords

**Product Domain:**
- Voice Transcription
- Speech Recognition
- Personal Productivity
- Adaptive Learning
- User Personalisation
- Requirements Engineering
- Document Generation

**Business Domain:**
- SaaS Platform
- B2C Application
- Serverless Computing
- Multi-tenant Architecture
- Cost Optimisation
- Rapid Prototyping

---

## 7. Positioning Matrix

### By Audience

| Audience | Lead With | Avoid |
|----------|-----------|-------|
| Tech Recruiters | AWS, Node.js, Terraform, CI/CD | "Personal project" framing |
| Engineering Managers | Architecture decisions, security practices | Framework churn |
| CTOs | Business value, scalability, cost efficiency | Implementation details |
| Product People | User problem, differentiation, growth potential | Technical depth |
| Non-technical | "AI-powered voice notes that learn" | Any jargon |

### By Job Type

| Role | Emphasise | De-emphasise |
|------|-----------|--------------|
| Backend Engineer | Lambda, API design, PostgreSQL, auth | Frontend, UI/UX |
| Frontend Engineer | Vanilla JS, responsive design, UX | Infrastructure |
| Full-stack | End-to-end ownership, both layers | Neither |
| DevOps/SRE | Terraform, CI/CD, security scanning | Application logic |
| AI/ML Engineer | Whisper integration, GPT prompting, diff algorithm | Infrastructure |

### By Company Type

| Company | Position As... |
|---------|----------------|
| Startup | "I ship fast. Concept to production in 8 days." |
| Scale-up | "I build scalable serverless systems with proper CI/CD." |
| Enterprise | "I follow security best practices: SAST, dependency scanning, IaC." |
| Consultancy | "Full-stack capability with AI integration and independent delivery." |
| AI Company | "Experience integrating multiple AI models into production applications." |

---

## 8. Anti-Patterns to Avoid

### Things NOT to Say

| Avoid | Why | Say Instead |
|-------|-----|-------------|
| "It's a side project" | Diminishes the work | "Production application I built independently" |
| "Just vanilla JS" | Sounds outdated | "Lightweight frontend with no framework overhead" |
| "Basic CRUD" | Undersells complexity | "23-endpoint API with auth, personalisation, and AI integration" |
| "Copied from tutorials" | Not true, and bad positioning | "Architected from requirements through deployment" |
| "AI does all the work" | Oversimplifies | "AI integration with custom algorithms for personalisation" |

### Common Misconceptions to Preempt

| Misconception | Clarification |
|---------------|---------------|
| "It's just a Whisper wrapper" | "Whisper is the transcription layer. The personalisation engine, multi-tenant architecture, and BA features are custom." |
| "No framework = outdated" | "Deliberate choice for performance. No build step, sub-second load times, easier to maintain." |
| "8 days = low quality" | "Rapid prototyping to production. Proper architecture, security scanning, CI/CD from day one." |

---

*Classification generated: January 2026*
