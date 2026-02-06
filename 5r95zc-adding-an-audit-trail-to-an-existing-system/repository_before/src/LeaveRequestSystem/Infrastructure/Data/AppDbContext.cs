// Data/AppDbContext.cs
using Microsoft.EntityFrameworkCore;
using LeaveRequestSystem.Domain.Entities;

namespace LeaveRequestSystem.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Employee> Employees { get; set; } = null!;
    public DbSet<LeaveRequest> LeaveRequests { get; set; } = null!;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<LeaveRequest>()
            .HasOne(lr => lr.Requester)
            .WithMany()
            .HasForeignKey(lr => lr.RequesterId)
            .OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<LeaveRequest>()
            .HasOne(lr => lr.Manager)
            .WithMany()
            .HasForeignKey(lr => lr.ManagerId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
