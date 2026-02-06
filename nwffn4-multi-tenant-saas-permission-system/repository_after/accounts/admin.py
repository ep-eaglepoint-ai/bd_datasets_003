from django.contrib import admin
from accounts.models import (
    User, Organization, Team, Project, Task,
    OrganizationMember, TeamMember, ProjectMember,
    CustomRole, PermissionOverride
)

admin.site.register(User)
admin.site.register(Organization)
admin.site.register(Team)
admin.site.register(Project)
admin.site.register(Task)
admin.site.register(OrganizationMember)
admin.site.register(TeamMember)
admin.site.register(ProjectMember)
admin.site.register(CustomRole)
admin.site.register(PermissionOverride)
