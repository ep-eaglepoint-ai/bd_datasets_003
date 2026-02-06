// Application/DTOs (abbreviated)
using LeaveRequestSystem.Domain.Entities;

namespace LeaveRequestSystem.Application.DTOs;

public record CreateLeaveRequestDto(DateOnly StartDate, DateOnly EndDate, string? Note);
public record LeaveRequestDto(int Id, int RequesterId, int ManagerId, DateOnly StartDate, DateOnly EndDate, LeaveRequestStatus Status, string? Note, string? ManagerComment, DateTimeOffset SubmittedAt);
public record RejectLeaveRequestDto(string? Comment);
