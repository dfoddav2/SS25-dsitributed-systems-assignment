using Microsoft.AspNetCore.Mvc;
using System.Net.Http;
using System.Net.Http.Json;
using BackendService.Transaction.Models;

[ApiController]
[Route("transaction")]
public class TransactionController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;

    public TransactionController(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    [HttpGet("get-all")]
    [EndpointDescription("Fetches all transactions from the transaction service.")]
    [Tags("Transactions")]
    [ProducesResponseType(typeof(List<Transaction>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(TransactionErrorResponse), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(TransactionErrorResponse), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(TransactionErrorResponse), StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> GetTransactions()
    {
        var client = _httpClientFactory.CreateClient("TransactionService");
        // Forward the Authorization header if present
        if (Request.Headers.TryGetValue("Authorization", out var authHeader))
        {
            client.DefaultRequestHeaders.Remove("Authorization");
            client.DefaultRequestHeaders.Add("Authorization", authHeader.ToString());
        }

        var response = await client.GetAsync("transactions");

        if (response.IsSuccessStatusCode)
        {
            var transactions = await response.Content.ReadFromJsonAsync<List<Transaction>>();
            return Ok(transactions);
        }
        else
        {
            return StatusCode((int)response.StatusCode, await response.Content.ReadAsStringAsync());
        }
    }

    [HttpPost("create")]
    [EndpointDescription("Creates a new transaction with the provided data and returns the created transaction.")]
    [Tags("Transactions")]
    [ProducesResponseType(typeof(Transaction), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ZodErrorResponse), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(TransactionErrorResponse), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(TransactionErrorResponse), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(TransactionErrorResponse), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(TransactionErrorResponse), StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> CreateTransaction([FromBody] TransactionCreate transaction)
    {
        var client = _httpClientFactory.CreateClient("TransactionService");
        // Forward the Authorization header if present
        if (Request.Headers.TryGetValue("Authorization", out var authHeader))
        {
            client.DefaultRequestHeaders.Remove("Authorization");
            client.DefaultRequestHeaders.Add("Authorization", authHeader.ToString());
        }

        var transactionDict = new Dictionary<string, object>
        {
            ["customer_id"] = transaction.CustomerId,
            ["vendor_id"] = transaction.VendorId,
            ["timestamp"] = transaction.Timestamp.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'"),
            ["status"] = transaction.Status.ToString().ToLowerInvariant(),
            ["amount"] = transaction.Amount
        };
        var response = await client.PostAsJsonAsync("transactions", transactionDict);

        if (response.IsSuccessStatusCode)
        {
            var createdTransaction = await response.Content.ReadFromJsonAsync<Transaction>();
            return Ok(createdTransaction);
        }
        else
        {
            var raw = await response.Content.ReadAsStringAsync();

            // Try Zod error first
            if (raw.Contains("\"success\":false") && raw.Contains("\"error\""))
            {
                try
                {
                    var zodError = System.Text.Json.JsonSerializer.Deserialize<ZodErrorResponse>(raw);
                    return BadRequest(zodError);
                }
                catch
                {
                    // fallback to raw error
                    return BadRequest(new { message = "Validation failed", details = raw });
                }
            }

            // Try TransactionErrorResponse
            try
            {
                var errorResponse = System.Text.Json.JsonSerializer.Deserialize<TransactionErrorResponse>(raw);
                return StatusCode((int)response.StatusCode, errorResponse);
            }
            catch
            {
                // fallback to raw error
                return StatusCode((int)response.StatusCode, new { message = "Unknown error", details = raw });
            }
        }
    }
}