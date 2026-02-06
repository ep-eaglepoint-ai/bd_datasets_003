// Application/Services/ILeaveRequestService.cs
using LeaveRequestSystem.Application.DTOs;

namespace LeaveRequestSystem.Application.Services;

public interface ILeaveRequestService
{
    Task<LeaveRequestDto> CreateAsync(CreateLeaveRequestDto dto, int currentUserId, CancellationToken ct);
    Task<LeaveRequestDto?> ApproveAsync(int leaveRequestId, int managerId, CancellationToken ct);
    Task<LeaveRequestDto?> RejectAsync(int leaveRequestId, int managerId, string? comment, CancellationToken ct);
    Task<LeaveRequestDto?> GetByIdAsync(int id, CancellationToken ct);
}
