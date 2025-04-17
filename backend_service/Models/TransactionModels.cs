using System.Runtime.Serialization;
using System.Text.Json.Serialization;

namespace BackendService.Transaction.Models
{
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum TransactionStatus
    {
        [EnumMember(Value = "submitted")]
        Submitted,
        [EnumMember(Value = "accepted")]
        Accepted,
        [EnumMember(Value = "rejected")]
        Rejected
    }


    public class TransactionBase
    {
        [JsonPropertyName("customer_id")]
        public int CustomerId { get; set; }

        [JsonPropertyName("vendor_id")]
        public int VendorId { get; set; }
        public DateTimeOffset Timestamp { get; set; }

        [JsonPropertyName("status")]
        public TransactionStatus Status { get; set; }
        public decimal Amount { get; set; }
    }

    public class Transaction : TransactionBase
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
    }

    public class TransactionCreate : TransactionBase
    {
    }

    public class TransactionErrorResponse
    {
        [JsonPropertyName("message")]
        public string Message { get; set; }
    }

    public class ZodIssue
    {
        [JsonPropertyName("code")]
        public string Code { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; }

        [JsonPropertyName("path")]
        public List<string> Path { get; set; }

        // Optional fields
        [JsonPropertyName("validation")]
        public string Validation { get; set; }

        [JsonPropertyName("received")]
        public string Received { get; set; }

        [JsonPropertyName("options")]
        public List<string> Options { get; set; }
    }

    public class ZodError
    {
        [JsonPropertyName("issues")]
        public List<ZodIssue> Issues { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }
    }

    public class ZodErrorResponse
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("error")]
        public ZodError Error { get; set; }
    }

}