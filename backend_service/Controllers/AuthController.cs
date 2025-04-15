using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using BackendService.Models;

[ApiController]
[Route("auth")]
public class AuthController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;

    public AuthController(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    [HttpPost("login")]
    [EndpointDescription("Forwards the login request to the authentication service and returns the response.")]
    [Tags("Authentication")]
    [ProducesResponseType(typeof(LoginResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var client = _httpClientFactory.CreateClient("AuthService");
        var response = await client.PostAsJsonAsync("login", request);

        if (response.IsSuccessStatusCode)
        {
            return Ok(await response.Content.ReadAsStringAsync());
        }
        else
        {
            return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());
        }
    }
}