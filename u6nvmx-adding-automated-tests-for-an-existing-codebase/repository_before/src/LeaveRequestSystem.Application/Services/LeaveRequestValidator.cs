namespace LeaveRequestSystem.Application.Services;

public interface ILeaveRequestValidator
{
    (bool IsValid, IReadOnlyList<string> Errors) Validate(
        DateOnly startDate,
        DateOnly endDate,
        string? note,
        int requesterId,
        int managerId);
}

public class LeaveRequestValidator : ILeaveRequestValidator
{
    public const int MaxNoteLength = 500;
    public const int MinRequesterId = 1;
    public const int MinManagerId = 1;

    public (bool IsValid, IReadOnlyList<string> Errors) Validate(
        DateOnly startDate,
        DateOnly endDate,
        string? note,
        int requesterId,
        int managerId)
    {
        var errors = new List<string>();

        if (requesterId < MinRequesterId)
            errors.Add("RequesterId must be at least 1.");

        if (managerId < MinManagerId)
            errors.Add("ManagerId must be at least 1.");

        if (requesterId == managerId)
            errors.Add("Requester and manager must be different.");

        if (endDate < startDate)
            errors.Add("End date must be on or after start date.");

        if (note != null && note.Length > MaxNoteLength)
            errors.Add($"Note must not exceed {MaxNoteLength} characters.");

        return (errors.Count == 0, errors);
    }
}
