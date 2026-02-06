// API/Controllers/LeaveRequestsController.cs
using Microsoft.AspNetCore.Mvc;
using LeaveRequestSystem.Application.Services;
using LeaveRequestSystem.Application.DTOs;

namespace LeaveRequestSystem.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LeaveRequestsController : ControllerBase
{
    private readonly ILeaveRequestService _service;

    public LeaveRequestsController(ILeaveRequestService service) => _service = service;

    [HttpPost]
    [ProducesResponseType(typeof(LeaveRequestDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromBody] CreateLeaveRequestDto dto, CancellationToken ct)
    {
        var userId = GetCurrentUserId();
        var result = await _service.CreateAsync(dto, userId, ct);
        return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
    }

    [HttpPatch("{id}/approve")]
    [ProducesResponseType(typeof(LeaveRequestDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Approve(int id, CancellationToken ct)
    {
        var managerId = GetCurrentUserId();
        var result = await _service.ApproveAsync(id, managerId, ct);
        return result == null ? NotFound() : Ok(result);
    }

    [HttpPatch("{id}/reject")]
    [ProducesResponseType(typeof(LeaveRequestDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Reject(int id, [FromBody] RejectLeaveRequestDto? body, CancellationToken ct)
    {
        var managerId = GetCurrentUserId();
        var result = await _service.RejectAsync(id, managerId, body?.Comment, ct);
        return result == null ? NotFound() : Ok(result);
    }

    [HttpGet("{id}")]
    [ProducesResponseType(typeof(LeaveRequestDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetById(int id, CancellationToken ct)
    {
        var result = await _service.GetByIdAsync(id, ct);
        return result == null ? NotFound() : Ok(result);
    }

    private int GetCurrentUserId() => int.Parse(Request.Headers["X-User-Id"].FirstOrDefault() ?? "0");
}
