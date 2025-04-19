# Due to ENV file conflict resilution, .NET Dockerfile runs as Production.
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:9.0
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8002
ENTRYPOINT ["dotnet", "backend_service.dll"]