from django.core.cache import caches
from accounts.models import Organization, Team, Project, Task, OrganizationMember, TeamMember, ProjectMember
import logging

logger = logging.getLogger(__name__)


class CacheInvalidationService:

    def __init__(self, cache=None):
        self.cache = cache or caches['default']

    def invalidate_user_resource(self, user_id, resource_type, resource_id):
        permissions = ['create', 'read', 'update', 'delete', 'manage_members', 'manage_roles']
        keys = [
            f"perm:{user_id}:{resource_type}:{resource_id}:{perm}"
            for perm in permissions
        ]
        try:
            self.cache.delete_many(keys)
            self._invalidate_descendants(user_id, resource_type, resource_id)
        except Exception as e:
            logger.error(f"Cache invalidation failed: {e}")

    def invalidate_role_users(self, custom_role):
        user_ids = set()
        
        user_ids.update(
            OrganizationMember.objects.filter(custom_role=custom_role).values_list('user_id', flat=True)
        )
        user_ids.update(
            TeamMember.objects.filter(custom_role=custom_role).values_list('user_id', flat=True)
        )
        user_ids.update(
            ProjectMember.objects.filter(custom_role=custom_role).values_list('user_id', flat=True)
        )
        
        for user_id in user_ids:
            self._invalidate_user_organization(user_id, custom_role.organization_id)

    def _invalidate_descendants(self, user_id, resource_type, resource_id):
        if resource_type == 'organization':
            self._invalidate_organization_descendants(user_id, resource_id)
        elif resource_type == 'team':
            self._invalidate_team_descendants(user_id, resource_id)
        elif resource_type == 'project':
            self._invalidate_project_descendants(user_id, resource_id)

    def _invalidate_organization_descendants(self, user_id, org_id):
        teams = Team.objects.filter(organization_id=org_id).values_list('id', flat=True)
        for team_id in teams:
            self.invalidate_user_resource(user_id, 'team', team_id)

    def _invalidate_team_descendants(self, user_id, team_id):
        projects = Project.objects.filter(team_id=team_id).values_list('id', flat=True)
        for project_id in projects:
            self.invalidate_user_resource(user_id, 'project', project_id)

    def _invalidate_project_descendants(self, user_id, project_id):
        tasks = Task.objects.filter(project_id=project_id).values_list('id', flat=True)
        for task_id in tasks:
            self.invalidate_user_resource(user_id, 'task', task_id)

    def _invalidate_user_organization(self, user_id, org_id):
        self.invalidate_user_resource(user_id, 'organization', org_id)
        self._invalidate_organization_descendants(user_id, org_id)


cache_invalidation_service = CacheInvalidationService()
