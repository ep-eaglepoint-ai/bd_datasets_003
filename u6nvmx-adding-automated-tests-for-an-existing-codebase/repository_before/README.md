# repository_before — Leave request validator (no tests yet)

Production code only: `LeaveRequestValidator` and `ILeaveRequestValidator` from the Code Testing prompt. **No test project.** The task is to add a test project and write the test suite without modifying this production code.

## Stack

- .NET 8
- C# (nullable enabled, implicit usings)
- Single project: LeaveRequestSystem.Application

## Structure

- LeaveRequestSystem.sln
- src/LeaveRequestSystem.Application/
  - LeaveRequestSystem.Application.csproj
  - Services/LeaveRequestValidator.cs (interface + implementation)

## Build

```bash
dotnet build
```

From repo root or `dotnet build src/LeaveRequestSystem.Application/LeaveRequestSystem.Application.csproj`.

## Task (from prompt)

Add a test project that:

- References LeaveRequestSystem.Application
- Uses xUnit (or NUnit)
- Covers all public behavior of LeaveRequestValidator: happy path, boundary values, invalid inputs (requesterId < 1, managerId < 1, requesterId == managerId, endDate < startDate, note over MaxNoteLength)
- Does not change the production code under test

Run with `dotnet test` after adding the test project.
