using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;

var builder = DistributedApplication.CreateBuilder(args);

// 1. PostgreSQL Database Container + pgAdmin Web UI
var postgresPassword = builder.AddParameter("postgres-password", "allercare_demo", secret: true);
var postgres = builder.AddPostgres("allercare-postgres", password: postgresPassword, port: 5434)
    .WithDataVolume("allercare_pgdata")
    .WithPgAdmin()
    .WithLifetime(ContainerLifetime.Persistent);

var allercareDb = postgres.AddDatabase("allercare");

// 2. LiveKit WebRTC Video Telehealth Service (Dev Mode)
var livekit = builder.AddContainer("allercare-livekit", "allercare/livekit:local")
    .WithHttpEndpoint(port: 7881, targetPort: 7881, name: "livekit-http")
    .WithArgs("--dev")
    .WithEnvironment("LIVEKIT_KEYS", "devkey: allercare-demo-secret-0123456789ab")
    .WithLifetime(ContainerLifetime.Persistent);

// 3. FastAPI Backend API with Google Gemini AI Integration
var api = builder.AddDockerfile("allercare-api", "../../services/api")
    .WithHttpEndpoint(port: 8000, targetPort: 8000, name: "api")
    .WithExternalHttpEndpoints()
    .WithReference(allercareDb)
    .WithEnvironment("DATABASE_URL", ReferenceExpression.Create($"postgresql+psycopg://postgres:{postgresPassword}@allercare-postgres:5432/allercare"))
    .WithEnvironment("AUTH_SECRET", "demo-secret-change-me")
    .WithEnvironment("DEMO_MODE", "1")
    .WithEnvironment("AI_PROVIDER", "gemini")
    .WithEnvironment("AI_MODEL", "gemini-flash-latest")
    .WithEnvironment("AI_API_KEY", builder.Configuration["AI_API_KEY"] ?? "")
    .WithEnvironment("ALLOWED_ORIGINS", "http://localhost:3000")
    .WithEnvironment("DATA_DIR", "/srv/data")
    .WithLifetime(ContainerLifetime.Persistent);

// 4. Next.js 14 Web Frontend (Clinical Glassmorphism UI + Voice & OCR Vision)
var web = builder.AddNpmApp("allercare-web", "../../apps/web", "dev")
    .WithHttpEndpoint(port: 3000, isProxied: false, name: "http")
    .WithExternalHttpEndpoints()
    .WithEnvironment("API_ORIGIN", "http://localhost:8000")
    .WithEnvironment("PORT", "3000");

builder.Build().Run();
