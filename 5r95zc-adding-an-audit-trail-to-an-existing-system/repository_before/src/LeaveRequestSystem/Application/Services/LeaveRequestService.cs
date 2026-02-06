// Application/Services/LeaveRequestService.cs
using LeaveRequestSystem.Domain.Entities;
using LeaveRequestSystem.Infrastructure.Data;
using LeaveRequestSystem.Application.DTOs;
using Microsoft.EntityFrameworkCore;

namespace LeaveRequestSystem.Application.Services;

public class LeaveRequestService : ILeaveRequestService
{
    private readonly AppDbContext _db;

    public LeaveRequestService(AppDbContext db) => _db = db;

    public async Task<LeaveRequestDto> CreateAsync(CreateLeaveRequestDto dto, int currentUserId, CancellationToken ct)
    {
        var manager = await _db.Employees.FirstOrDefaultAsync(e => e.IsManager, ct)
            ?? throw new InvalidOperationException("No manager found");
        if (dto.EndDate < dto.StartDate)
            throw new ArgumentException("End date must be on or after start date");

        var request = new LeaveRequest
        {
            RequesterId = currentUserId,
            ManagerId = manager.Id,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            Note = dto.Note,
            SubmittedAt = DateTimeOffset.UtcNow
        };
        _db.LeaveRequests.Add(request);
        await _db.SaveChangesAsync(ct);
        return MapToDto(request);
    }

    public async Task<LeaveRequestDto?> ApproveAsync(int leaveRequestId, int managerId, CancellationToken ct)
    {
        var request = await _db.LeaveRequests
            .Include(lr => lr.Requester)
            .FirstOrDefaultAsync(lr => lr.Id == leaveRequestId, ct);
        if (request == null || request.ManagerId != managerId || request.Status != LeaveRequestStatus.Pending)
            return null;
        request.Status = LeaveRequestStatus.Approved;
        await _db.SaveChangesAsync(ct);
        return MapToDto(request);
    }

    public async Task<LeaveRequestDto?> RejectAsync(int leaveRequestId, int managerId, string? comment, CancellationToken ct)
    {
        var request = await _db.LeaveRequests
            .Include(lr => lr.Requester)
            .FirstOrDefaultAsync(lr => lr.Id == leaveRequestId, ct);
        if (request == null || request.ManagerId != managerId || request.Status != LeaveRequestStatus.Pending)
            return null;
        request.Status = LeaveRequestStatus.Rejected;
        request.ManagerComment = comment;
        await _db.SaveChangesAsync(ct);
        return MapToDto(request);
    }

    public async Task<LeaveRequestDto?> GetByIdAsync(int id, CancellationToken ct)
    {
        var request = await _db.LeaveRequests.FindAsync(new object[] { id }, ct);
        return request == null ? null : MapToDto(request);
    }

    private static LeaveRequestDto MapToDto(LeaveRequest lr) => new(
        lr.Id,
        lr.RequesterId,
        lr.ManagerId,
        lr.StartDate,
        lr.EndDate,
        lr.Status,
        lr.Note,
        lr.ManagerComment,
        lr.SubmittedAt
    );
}
