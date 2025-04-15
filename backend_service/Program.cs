using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

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

// Set up HTTP client for AuthService
// - This client will be used to communicate with the authentication service
// - The base address is set to the authentication service's URL
builder.Services.AddHttpClient("AuthService", client =>
{
    client.BaseAddress = new Uri("http://localhost:8001/");
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    // Add OpenAPI documentation and Scalar UI
    app.MapOpenApi();
    app.MapScalarApiReference("/ui");
    app.UseHttpLogging();
}

app.UseHttpsRedirection();

app.MapControllers();

app.Run();