using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProjectManagement.Api.Data;
using ProjectManagement.Api.DTOs;

namespace ProjectManagement.Api.Controllers;

[ApiController]
[Route("api/projects/{projectId}/[controller]")]
public class TasksController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public TasksController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<TaskDto>>> GetTasks(Guid projectId)
    {
        var tasks = await _context.Tasks
            .Where(t => t.ProjectId == projectId)
            .Include(t => t.Assignee)
            .ToListAsync();

        return Ok(tasks.Select(t => new TaskDto
        {
            Id = t.Id,
            Title = t.Title,
            Description = t.Description,
            Status = t.Status.ToString(),
            AssigneeName = t.Assignee?.Name
        }));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<TaskDto>> GetTask(Guid projectId, Guid id)
    {
        var task = await _context.Tasks
            .Include(t => t.Assignee)
            .FirstOrDefaultAsync(t => t.ProjectId == projectId && t.Id == id);

        if (task == null)
            return NotFound();

        return Ok(new TaskDto
        {
            Id = task.Id,
            Title = task.Title,
            Description = task.Description,
            Status = task.Status.ToString(),
            AssigneeName = task.Assignee?.Name
        });
    }

    [HttpPost]
    public async Task<ActionResult<TaskDto>> CreateTask(Guid projectId, CreateTaskDto dto)
    {
        var task = new Models.Task
        {
            Id = Guid.NewGuid(),
            Title = dto.Title,
            Description = dto.Description,
            ProjectId = projectId,
            AssigneeId = dto.AssigneeId
        };

        _context.Tasks.Add(task);
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetTask), new { projectId, id = task.Id }, new TaskDto
        {
            Id = task.Id,
            Title = task.Title,
            Description = task.Description,
            Status = task.Status.ToString()
        });
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateTask(Guid projectId, Guid id, UpdateTaskDto dto)
    {
        var task = await _context.Tasks.FirstOrDefaultAsync(t => t.ProjectId == projectId && t.Id == id);
        if (task == null)
            return NotFound();

        task.Title = dto.Title;
        task.Description = dto.Description;
        task.Status = dto.Status;
        task.AssigneeId = dto.AssigneeId;
        task.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteTask(Guid projectId, Guid id)
    {
        var task = await _context.Tasks.FirstOrDefaultAsync(t => t.ProjectId == projectId && t.Id == id);
        if (task == null)
            return NotFound();

        _context.Tasks.Remove(task);
        await _context.SaveChangesAsync();
        return NoContent();
    }
}
