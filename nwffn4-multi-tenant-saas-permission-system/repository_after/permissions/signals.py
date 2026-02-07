from permissions.services.cache_invalidation import cache_invalidation_service

from accounts.models import OrganizationMember, TeamMember, ProjectMember, TaskMember
import logging

logger = logging.getLogger(__name__)


def invalidate_membership_cache(sender, instance, **kwargs):
    try:
        if isinstance(instance, OrganizationMember):
            resource_type = 'organization'
            resource_id = instance.organization_id
        elif isinstance(instance, TeamMember):
            resource_type = 'team'
            resource_id = instance.team_id
        elif isinstance(instance, ProjectMember):
            resource_type = 'project'
            resource_id = instance.project_id
        elif isinstance(instance, TaskMember):
            resource_type = 'task'
            resource_id = instance.task_id
        else:
            return
        
        cache_invalidation_service.invalidate_user_resource(
            instance.user_id, resource_type, resource_id
        )
    except Exception as e:
        logger.error(f"Failed to invalidate membership cache: {e}")


def invalidate_override_cache(sender, instance, **kwargs):
    try:
        cache_invalidation_service.invalidate_user_resource(
            instance.user_id, instance.resource_type, instance.resource_id, instance.permission
        )
    except Exception as e:
        logger.error(f"Failed to invalidate override cache: {e}")


def invalidate_custom_role_cache(sender, instance, **kwargs):
    try:
        cache_invalidation_service.invalidate_role_users(instance)
    except Exception as e:
        logger.error(f"Failed to invalidate custom role cache: {e}")
