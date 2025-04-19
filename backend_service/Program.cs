using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

var backendServicePort = builder.Configuration["BACKEND_SERVICE_PORT"] ?? "8002";
builder.WebHost.UseUrls($"http://0.0.0.0:{backendServicePort}");
Console.WriteLine($"Backend service running on port {backendServicePort}");

// Add services to the container.
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddHttpLogging(logging =>
{
    logging.LoggingFields = Microsoft.AspNetCore.HttpLogging.HttpLoggingFields.All;
    logging.RequestBodyLogLimit = 4096;
    logging.ResponseBodyLogLimit = 4096;
});

// Set up Controller services
builder.Services.AddControllers();

// Set up HTTP client for AuthService and TransactionService
// - This client will be used to communicate with the authentication service and transaction service
// - The base address is set to the service's URL
var authServiceUrl = builder.Configuration["AUTHENTICATION_SERVICE_URL"] ?? "http://localhost:8001/";
Console.WriteLine($"\n-> auth_service running on: {authServiceUrl}");
builder.Services.AddHttpClient("AuthService", client =>
{
    client.BaseAddress = new Uri(authServiceUrl);
});
var transactionServiceUrl = builder.Configuration["TRANSACTION_SERVICE_URL"] ?? "http://localhost:8000/";
Console.WriteLine($"-> transaction_service running on: {transactionServiceUrl}\n");
builder.Services.AddHttpClient("TransactionService", client =>
{
    client.BaseAddress = new Uri(transactionServiceUrl);
});

var app = builder.Build();

// Probably should not be used for production
app.MapOpenApi();
app.MapScalarApiReference("/ui");
app.UseHttpLogging();

app.UseHttpsRedirection();

app.MapGet("/", () => "Backend service is running!\n\nTo visit the Scalar UI, go to: `/ui`");
app.MapGet("/health", () => Results.Ok("Backend service is healthy!"));
app.MapControllers();

app.Run();