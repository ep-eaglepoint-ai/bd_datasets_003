from django.core.cache import caches
from accounts.models import Team, Project, Task, OrganizationMember, TeamMember, ProjectMember
import logging

logger = logging.getLogger(__name__)


class CacheInvalidationService:

    def __init__(self, cache=None):
        self.cache = cache or caches['default']

    def invalidate_user_resource(self, user_id, resource_type, resource_id, permission=None):
        if permission:
            key = f"perm:{user_id}:{resource_type}:{resource_id}:{permission}"
            try:
                self.cache.delete(key)
                # For specific permission updates, we also need to consider if this
                # affects descendants (e.g. revoking 'read' on a project should revoke 'read' on tasks)
                # For simplicity/safety, we still run descendant invalidation which is broad
                self._invalidate_descendants(user_id, resource_type, resource_id)
            except Exception as e:
                logger.error(f"Cache invalidation failed: {e}")
            return

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
        user_ids.update(
            TaskMember.objects.filter(custom_role=custom_role).values_list('user_id', flat=True)
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
        """
        Bulk invalidate all descendant resources of an organization (teams, projects, tasks)
        for the given user, avoiding recursive per-child cache invalidation.
        """
        permissions = ['create', 'read', 'update', 'delete', 'manage_members', 'manage_roles']
        
        # Collect all team IDs for this organization
        team_ids = list(
            Team.objects.filter(organization_id=org_id).values_list('id', flat=True)
        )
        
        # Collect all project IDs for those teams
        if team_ids:
            project_ids = list(
                Project.objects.filter(team_id__in=team_ids).values_list('id', flat=True)
            )
        else:
            project_ids = []
        
        # Collect all task IDs for those projects
        if project_ids:
            task_ids = list(
                Task.objects.filter(project_id__in=project_ids).values_list('id', flat=True)
            )
        else:
            task_ids = []
        
        keys = []
        # Build cache keys for teams
        for team_id in team_ids:
            for perm in permissions:
                keys.append(f"perm:{user_id}:team:{team_id}:{perm}")
        
        # Build cache keys for projects
        for project_id in project_ids:
            for perm in permissions:
                keys.append(f"perm:{user_id}:project:{project_id}:{perm}")
        
        # Build cache keys for tasks
        for task_id in task_ids:
            for perm in permissions:
                keys.append(f"perm:{user_id}:task:{task_id}:{perm}")
        
        if keys:
            self.cache.delete_many(keys)

    def _invalidate_team_descendants(self, user_id, team_id):
        """
        Bulk invalidate all descendant resources of a team (projects, tasks)
        for the given user.
        """
        permissions = ['create', 'read', 'update', 'delete', 'manage_members', 'manage_roles']
        
        # Collect all project IDs for this team
        project_ids = list(
            Project.objects.filter(team_id=team_id).values_list('id', flat=True)
        )
        
        # Collect all task IDs for those projects
        if project_ids:
            task_ids = list(
                Task.objects.filter(project_id__in=project_ids).values_list('id', flat=True)
            )
        else:
            task_ids = []
        
        keys = []
        # Build cache keys for projects
        for project_id in project_ids:
            for perm in permissions:
                keys.append(f"perm:{user_id}:project:{project_id}:{perm}")
        
        # Build cache keys for tasks
        for task_id in task_ids:
            for perm in permissions:
                keys.append(f"perm:{user_id}:task:{task_id}:{perm}")
        
        if keys:
            self.cache.delete_many(keys)

    def _invalidate_project_descendants(self, user_id, project_id):
        """
        Bulk invalidate all descendant resources of a project (tasks)
        for the given user.
        """
        permissions = ['create', 'read', 'update', 'delete', 'manage_members', 'manage_roles']
        
        # Collect all task IDs for this project
        task_ids = list(
            Task.objects.filter(project_id=project_id).values_list('id', flat=True)
        )
        
        keys = []
        for task_id in task_ids:
            for perm in permissions:
                keys.append(f"perm:{user_id}:task:{task_id}:{perm}")
        
        if keys:
            self.cache.delete_many(keys)

    def _invalidate_user_organization(self, user_id, org_id):
        self.invalidate_user_resource(user_id, 'organization', org_id)
        self._invalidate_organization_descendants(user_id, org_id)


cache_invalidation_service = CacheInvalidationService()
