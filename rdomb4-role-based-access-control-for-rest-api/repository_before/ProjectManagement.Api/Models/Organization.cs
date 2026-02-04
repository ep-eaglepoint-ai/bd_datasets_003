namespace ProjectManagement.Api.Models;

public class Organization
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public ICollection<User> Users { get; set; } = new List<User>();
    public ICollection<Project> Projects { get; set; } = new List<Project>();
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
