from accounts.models import (
    Organization, Team, Project, Task,
    OrganizationMember, TeamMember, ProjectMember,
    PermissionOverride
)
from audit.services import audit_service
from django.core.cache import caches
import logging

logger = logging.getLogger(__name__)

PREDEFINED_ROLES = {
    'owner': ['create', 'read', 'update', 'delete', 'manage_members', 'manage_roles'],
    'admin': ['create', 'read', 'update', 'delete', 'manage_members'],
    'member': ['create', 'read', 'update'],
    'viewer': ['read'],
}


class PermissionChecker:

    def __init__(self, cache=None, audit_svc=None):
        self.cache = cache or caches['default']
        self.audit_service = audit_svc or audit_service

    def check_permission(self, user, resource_type, resource_id, permission):
        cache_key = self._get_cache_key(user.id, resource_type, resource_id, permission)
        
        try:
            cached_result = self.cache.get(cache_key)
            if cached_result is not None:
                self.audit_service.log_permission_check(
                    user, resource_type, resource_id, permission, cached_result, cached=True
                )
                return cached_result
        except Exception as e:
            logger.warning(f"Cache read failed: {e}")

        result = self._compute_permission(user, resource_type, resource_id, permission)
        
        try:
            self.cache.set(cache_key, result, 300)
        except Exception as e:
            logger.warning(f"Cache write failed: {e}")

        self.audit_service.log_permission_check(
            user, resource_type, resource_id, permission, result, cached=False
        )
        
        return result

    def bulk_check_permissions(self, user, resource_type, resource_ids, permission):
        cache_keys = {rid: self._get_cache_key(user.id, resource_type, rid, permission) for rid in resource_ids}
        results = {}
        uncached_ids = []

        try:
            cached_results = self.cache.get_many(cache_keys.values())
            key_to_id = {v: k for k, v in cache_keys.items()}
            
            for cache_key, result in cached_results.items():
                rid = key_to_id[cache_key]
                results[rid] = result
            
            uncached_ids = [rid for rid in resource_ids if rid not in results]
        except Exception as e:
            logger.warning(f"Bulk cache read failed: {e}")
            uncached_ids = resource_ids

        if uncached_ids:
            # Bulk compute permissions for all uncached resources
            bulk_results = self._bulk_compute_permissions(user, resource_type, uncached_ids, permission)
            results.update(bulk_results)

            try:
                cache_data = {cache_keys[rid]: results[rid] for rid in uncached_ids}
                self.cache.set_many(cache_data, 300)
            except Exception as e:
                logger.warning(f"Bulk cache write failed: {e}")

        audit_entries = [
            {
                'user': user,
                'resource_type': resource_type,
                'resource_id': rid,
                'permission': permission,
                'result': results[rid],
                'cached': rid not in uncached_ids
            }
            for rid in resource_ids
        ]
        self.audit_service.bulk_log_permission_checks(audit_entries)

        return results

    def _bulk_compute_permissions(self, user, resource_type, resource_ids, permission):
        """Compute permissions for multiple resources efficiently"""
        results = {}
        
        if not user.current_organization:
            return {rid: False for rid in resource_ids}

        try:
            # Bulk validate tenant isolation
            valid_ids = self._bulk_validate_tenant_isolation(user, resource_type, resource_ids)
            
            # Initialize all as False
            for rid in resource_ids:
                results[rid] = False
            
            # Check overrides in bulk
            overrides = PermissionOverride.objects.filter(
                user=user,
                resource_type=resource_type,
                resource_id__in=valid_ids,
                permission=permission
            ).values_list('resource_id', 'is_granted')
            override_map = dict(overrides)
            
            # Get org membership once for inherited permissions
            org_member = OrganizationMember.objects.filter(
                organization=user.current_organization,
                user=user
            ).select_related('custom_role').first()
            
            org_permissions = org_member.get_permissions() if org_member else []
            
            # Get explicit memberships in bulk
            if resource_type == 'organization':
                memberships = OrganizationMember.objects.filter(
                    organization_id__in=valid_ids,
                    user=user
                ).select_related('custom_role')
                membership_map = {m.organization_id: m for m in memberships}
            elif resource_type == 'team':
                memberships = TeamMember.objects.filter(
                    team_id__in=valid_ids,
                    user=user
                ).select_related('custom_role')
                membership_map = {m.team_id: m for m in memberships}
            elif resource_type == 'project':
                memberships = ProjectMember.objects.filter(
                    project_id__in=valid_ids,
                    user=user
                ).select_related('custom_role')
                membership_map = {m.project_id: m for m in memberships}
            else:
                membership_map = {}
            
            # Compute results
            for rid in valid_ids:
                # Check override first
                if rid in override_map:
                    results[rid] = override_map[rid]
                    continue
                
                # Check explicit membership
                if rid in membership_map:
                    membership = membership_map[rid]
                    results[rid] = permission in membership.get_permissions()
                    continue
                
                # For resources without explicit membership, use org permissions
                if resource_type in ['team', 'project', 'task']:
                    results[rid] = permission in org_permissions
            
            return results
            
        except Exception as e:
            logger.error(f"Bulk permission check failed: {e}")
            return {rid: False for rid in resource_ids}

    def _bulk_validate_tenant_isolation(self, user, resource_type, resource_ids):
        """Validate tenant isolation for multiple resources in a single query"""
        if not user.current_organization:
            return set()

        try:
            if resource_type == 'organization':
                valid = Organization.objects.filter(id__in=resource_ids).values_list('id', flat=True)
            elif resource_type == 'team':
                valid = Team.objects.filter(
                    id__in=resource_ids,
                    organization=user.current_organization
                ).values_list('id', flat=True)
            elif resource_type == 'project':
                valid = Project.objects.filter(
                    id__in=resource_ids,
                    team__organization=user.current_organization
                ).values_list('id', flat=True)
            elif resource_type == 'task':
                valid = Task.objects.filter(
                    id__in=resource_ids,
                    project__team__organization=user.current_organization
                ).values_list('id', flat=True)
            else:
                return set()
            
            return set(valid)
        except Exception:
            return set()

    def _compute_permission(self, user, resource_type, resource_id, permission):
        try:
            if not self._validate_tenant_isolation(user, resource_type, resource_id):
                return False

            override_result = self._check_override(user, resource_type, resource_id, permission)
            if override_result is not None:
                return override_result

            explicit_result = self._check_explicit_membership(user, resource_type, resource_id, permission)
            if explicit_result is not None:
                return explicit_result

            return self._check_inherited_permission(user, resource_type, resource_id, permission)
        except Exception as e:
            logger.error(f"Permission check failed: {e}")
            return False

    def _validate_tenant_isolation(self, user, resource_type, resource_id):
        if not user.current_organization:
            return False

        try:
            if resource_type == 'organization':
                return Organization.objects.filter(id=resource_id).exists()
            elif resource_type == 'team':
                return Team.objects.filter(id=resource_id, organization=user.current_organization).exists()
            elif resource_type == 'project':
                return Project.objects.filter(id=resource_id, team__organization=user.current_organization).exists()
            elif resource_type == 'task':
                return Task.objects.filter(id=resource_id, project__team__organization=user.current_organization).exists()
        except Exception:
            return False
        
        return False

    def _check_override(self, user, resource_type, resource_id, permission):
        try:
            override = PermissionOverride.objects.get(
                user=user,
                resource_type=resource_type,
                resource_id=resource_id,
                permission=permission
            )
            return override.is_granted
        except PermissionOverride.DoesNotExist:
            return None

    def _check_explicit_membership(self, user, resource_type, resource_id, permission):
        try:
            if resource_type == 'organization':
                membership = OrganizationMember.objects.get(organization_id=resource_id, user=user)
                return permission in membership.get_permissions()
            elif resource_type == 'team':
                membership = TeamMember.objects.get(team_id=resource_id, user=user)
                return permission in membership.get_permissions()
            elif resource_type == 'project':
                membership = ProjectMember.objects.get(project_id=resource_id, user=user)
                return permission in membership.get_permissions()
        except (OrganizationMember.DoesNotExist, TeamMember.DoesNotExist, ProjectMember.DoesNotExist):
            return None

        return None

    def _check_inherited_permission(self, user, resource_type, resource_id, permission):
        try:
            if resource_type == 'task':
                task = Task.objects.select_related('project__team__organization').get(id=resource_id)
                explicit = self._check_explicit_membership(user, 'project', task.project_id, permission)
                if explicit is not None:
                    return explicit
                return self._check_inherited_permission(user, 'project', task.project_id, permission)
            
            elif resource_type == 'project':
                project = Project.objects.select_related('team__organization').get(id=resource_id)
                explicit = self._check_explicit_membership(user, 'team', project.team_id, permission)
                if explicit is not None:
                    return explicit
                return self._check_inherited_permission(user, 'team', project.team_id, permission)
            
            elif resource_type == 'team':
                team = Team.objects.select_related('organization').get(id=resource_id)
                explicit = self._check_explicit_membership(user, 'organization', team.organization_id, permission)
                if explicit is not None:
                    return explicit
                return False
            
            elif resource_type == 'organization':
                return False
        except (Task.DoesNotExist, Project.DoesNotExist, Team.DoesNotExist):
            return False

        return False

    def _get_cache_key(self, user_id, resource_type, resource_id, permission):
        return f"perm:{user_id}:{resource_type}:{resource_id}:{permission}"


permission_checker = PermissionChecker()
