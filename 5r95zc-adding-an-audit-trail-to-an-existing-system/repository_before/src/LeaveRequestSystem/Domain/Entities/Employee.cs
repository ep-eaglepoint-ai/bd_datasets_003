// Domain/Entities/Employee.cs
namespace LeaveRequestSystem.Domain.Entities;

public class Employee
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public bool IsManager { get; set; }
}
