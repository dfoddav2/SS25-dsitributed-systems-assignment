namespace BackendService.Auth.Models
{
    using System.ComponentModel;
    using System.Text.Json.Serialization;

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum UserRole
    {
        [Description("Administrator")]
        Administrator,
        [Description("Agent")]
        Agent,
        [Description("Secretary")]
        Secretary
    }

    public class UserDetails
    {
        [Description("The user's unique identifier.")]
        public required string Id { get; set; }
        [Description("The user's username.")]
        public required string Username { get; set; }
        [Description("The user's role.")]
        public required UserRole Role { get; set; }
    }

    public class LoginRequest
    {
        [Description("The user's username.")]
        public required string Username { get; set; }
        [Description("The user's username.")]
        public required string Password { get; set; }
    }

    public class LoginResponse
    {
        [Description("The user's details.")]
        public required UserDetails User { get; set; }
        [Description("The authentication token.")]
        public required string Token { get; set; }
    }

}
