// Domain/Entities/LeaveRequest.cs
namespace LeaveRequestSystem.Domain.Entities;

public enum LeaveRequestStatus { Pending, Approved, Rejected }

public class LeaveRequest
{
    public int Id { get; set; }
    public int RequesterId { get; set; }
    public int ManagerId { get; set; }
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public LeaveRequestStatus Status { get; set; } = LeaveRequestStatus.Pending;
    public string? Note { get; set; }
    public string? ManagerComment { get; set; }
    public DateTimeOffset SubmittedAt { get; set; }

    public Employee Requester { get; set; } = null!;
    public Employee Manager { get; set; } = null!;
}
