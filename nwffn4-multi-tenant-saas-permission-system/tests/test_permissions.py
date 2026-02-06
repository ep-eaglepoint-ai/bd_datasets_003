import sys
import os
import django

repo_path = os.environ.get('PYTHONPATH', os.path.join(os.path.dirname(__file__), '..', 'repository_after'))
if repo_path not in sys.path:
    sys.path.insert(0, repo_path)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'saas_platform.settings')
django.setup()

import pytest
from django.contrib.auth import get_user_model
from django.core.cache import cache
from accounts.models import (
    Organization, Team, Project, Task,
    OrganizationMember, ProjectMember,
    CustomRole, PermissionOverride
)
from permissions.services.permission_checker import permission_checker

# Handle both PREDEFINED_ROLES (after) and ROLE_PERMISSIONS (before)
try:
    from permissions.services.permission_checker import PREDEFINED_ROLES
except ImportError:
    from permissions.services.permission_checker import ROLE_PERMISSIONS as PREDEFINED_ROLES

try:
    from audit.models import AuditLog
    HAS_AUDIT = True
except ImportError:
    AuditLog = None
    HAS_AUDIT = False

User = get_user_model()


# PASS_TO_PASS: Basic functionality that should work in both versions
@pytest.mark.django_db
class TestPredefinedRoles:
    """Tests that predefined roles are correctly defined"""
    
    def test_exactly_four_predefined_roles(self):
        assert len(PREDEFINED_ROLES) == 4
        assert 'owner' in PREDEFINED_ROLES
        assert 'admin' in PREDEFINED_ROLES
        assert 'member' in PREDEFINED_ROLES
        assert 'viewer' in PREDEFINED_ROLES
    
    def test_owner_has_all_six_permissions(self):
        assert len(PREDEFINED_ROLES['owner']) == 6
        assert 'create' in PREDEFINED_ROLES['owner']
        assert 'read' in PREDEFINED_ROLES['owner']
        assert 'update' in PREDEFINED_ROLES['owner']
        assert 'delete' in PREDEFINED_ROLES['owner']
        assert 'manage_members' in PREDEFINED_ROLES['owner']
        assert 'manage_roles' in PREDEFINED_ROLES['owner']
    
    def test_admin_has_five_permissions_no_manage_roles(self):
        assert len(PREDEFINED_ROLES['admin']) == 5
        assert 'manage_roles' not in PREDEFINED_ROLES['admin']
        assert 'manage_members' in PREDEFINED_ROLES['admin']
    
    def test_member_has_three_permissions(self):
        assert len(PREDEFINED_ROLES['member']) == 3
        assert set(PREDEFINED_ROLES['member']) == {'create', 'read', 'update'}
    
    def test_viewer_has_only_read_permission(self):
        assert PREDEFINED_ROLES['viewer'] == ['read']


# FAIL_TO_PASS: Tests that fail in before but pass in after
@pytest.mark.django_db
class TestCachingPerformance:
    """Tests that caching works correctly - FAILS in before (no cache), PASSES in after"""
    
    def test_permission_check_uses_cache(self):
        """After first check, result should be cached"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        OrganizationMember.objects.create(organization=org, user=user, role='admin')
        
        # First check - should populate cache
        result1 = permission_checker.check_permission(user, 'team', team.id, 'read')
        assert result1 is True
        
        # Check if cache key exists - will fail in before (no _get_cache_key method)
        cache_key = permission_checker._get_cache_key(user.id, 'team', team.id, 'read')
        cached_result = cache.get(cache_key)
        
        # This will FAIL in before (no caching) and PASS in after
        assert cached_result is not None
        assert cached_result is True
    
    def test_cache_invalidation_on_membership_change(self):
        """Cache should be invalidated when membership changes"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        
        member = OrganizationMember.objects.create(organization=org, user=user, role='admin')
        
        # First check - populate cache
        result1 = permission_checker.check_permission(user, 'team', team.id, 'delete')
        assert result1 is True
        
        # Change role to viewer
        member.role = 'viewer'
        member.save()
        
        # Check again - should reflect new permissions
        result2 = permission_checker.check_permission(user, 'team', team.id, 'delete')
        
        # This will FAIL in before (stale data) and PASS in after (cache invalidated)
        assert result2 is False


@pytest.mark.django_db
class TestTenantIsolation:
    """Tests that tenant isolation prevents cross-organization access - FAILS in before, PASSES in after"""
    
    def test_cannot_access_different_organization_resources(self):
        """User should not access resources from different organization"""
        org1 = Organization.objects.create(name='Org 1', slug='org1')
        org2 = Organization.objects.create(name='Org 2', slug='org2')
        
        team1 = Team.objects.create(organization=org1, name='Team 1', slug='team1')
        team2 = Team.objects.create(organization=org2, name='Team 2', slug='team2')
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org1
        user.save()
        
        # User is owner of org1
        OrganizationMember.objects.create(organization=org1, user=user, role='owner')
        
        # Try to access team2 from org2
        result = permission_checker.check_permission(user, 'team', team2.id, 'read')
        
        # This will FAIL in before (no tenant isolation) and PASS in after
        assert result is False
    
    def test_project_list_filtered_by_current_organization(self):
        """Project list should only show projects from current organization"""
        from projects.views import ProjectViewSet
        from rest_framework.test import APIRequestFactory
        
        org1 = Organization.objects.create(name='Org 1', slug='org1')
        org2 = Organization.objects.create(name='Org 2', slug='org2')
        
        team1 = Team.objects.create(organization=org1, name='Team 1', slug='team1')
        team2 = Team.objects.create(organization=org2, name='Team 2', slug='team2')
        
        project1 = Project.objects.create(team=team1, name='Project 1', slug='project-1')
        project2 = Project.objects.create(team=team2, name='Project 2', slug='project-2')
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org1
        user.save()
        
        OrganizationMember.objects.create(organization=org1, user=user, role='admin')
        
        factory = APIRequestFactory()
        request = factory.get('/projects/')
        request.user = user
        
        view = ProjectViewSet.as_view({'get': 'list'})
        response = view(request)
        
        project_ids = [p['id'] for p in response.data]
        
        # This will FAIL in before (shows all projects) and PASS in after (filtered)
        assert project1.id in project_ids
        assert project2.id not in project_ids


@pytest.mark.django_db
class TestBulkPermissionChecks:
    """Tests bulk permission checking - FAILS in before (N+1 queries), PASSES in after"""
    
    def test_bulk_check_returns_all_results(self):
        """Bulk check should return results for all resource IDs"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        
        projects = [
            Project.objects.create(team=team, name=f'Project {i}', slug=f'project-{i}')
            for i in range(10)
        ]
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        
        OrganizationMember.objects.create(organization=org, user=user, role='admin')
        
        project_ids = [p.id for p in projects]
        # This will FAIL in before (no bulk method) and PASS in after
        results = permission_checker.bulk_check_permissions(user, 'project', project_ids, 'read')
        
        assert len(results) == 10
        assert all(results[pid] is True for pid in project_ids)
    
    def test_bulk_check_optimized_queries(self):
        """Bulk check should use optimized queries, not N+1"""
        from django.test.utils import override_settings
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        
        projects = [
            Project.objects.create(team=team, name=f'Project {i}', slug=f'project-{i}')
            for i in range(50)
        ]
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        
        OrganizationMember.objects.create(organization=org, user=user, role='admin')
        
        project_ids = [p.id for p in projects]
        
        with CaptureQueriesContext(connection) as context:
            # This will FAIL in before (no bulk method) and PASS in after
            results = permission_checker.bulk_check_permissions(user, 'project', project_ids, 'read')
        
        # This will FAIL in before (50+ queries) and PASS in after (<10 queries)
        assert len(context.captured_queries) < 10


@pytest.mark.django_db
class TestAuditLogging:
    """Tests that all permission checks are logged - FAILS in before, PASSES in after"""
    
    def test_permission_check_creates_audit_log(self):
        """Every permission check should create an audit log entry"""
        if not HAS_AUDIT:
            pytest.fail("AuditLog not available - feature not implemented")
        
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        
        OrganizationMember.objects.create(organization=org, user=user, role='admin')
        
        initial_count = AuditLog.objects.count()
        
        permission_checker.check_permission(user, 'team', team.id, 'read')
        
        # This will FAIL in before (no audit logging) and PASS in after
        assert AuditLog.objects.count() == initial_count + 1
        
        log = AuditLog.objects.latest('timestamp')
        assert log.user == user
        assert log.resource_type == 'team'
        assert log.resource_id == team.id
        assert log.permission == 'read'
        assert log.granted is True
    
    def test_denied_permission_also_logged(self):
        """Denied permissions should also be logged"""
        if not HAS_AUDIT:
            pytest.fail("AuditLog not available - feature not implemented")
        
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        
        OrganizationMember.objects.create(organization=org, user=user, role='viewer')
        
        permission_checker.check_permission(user, 'team', team.id, 'delete')
        
        log = AuditLog.objects.latest('timestamp')
        
        # This will FAIL in before (no audit logging) and PASS in after
        assert log.granted is False


@pytest.mark.django_db
class TestHierarchicalInheritance:
    """Tests hierarchical permission inheritance - PASS in both"""
    
    def test_task_inherits_from_organization(self):
        """Task should inherit permissions from organization level"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        project = Project.objects.create(team=team, name='Project', slug='project')
        task = Task.objects.create(project=project, name='Task')
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        
        OrganizationMember.objects.create(organization=org, user=user, role='admin')
        
        result = permission_checker.check_permission(user, 'task', task.id, 'read')
        assert result is True
    
    def test_explicit_child_membership_overrides_parent(self):
        """Explicit membership at child level should override parent"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        project = Project.objects.create(team=team, name='Project', slug='project')
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        
        # User is admin at org level
        OrganizationMember.objects.create(organization=org, user=user, role='admin')
        
        # But viewer at project level (explicit override)
        ProjectMember.objects.create(project=project, user=user, role='viewer')
        
        # Should only have read permission (viewer), not update (admin)
        assert permission_checker.check_permission(user, 'project', project.id, 'read') is True
        assert permission_checker.check_permission(user, 'project', project.id, 'update') is False


@pytest.mark.django_db
class TestPermissionOverrides:
    """Tests permission overrides - FAIL in before, PASS in after"""
    
    def test_grant_override_allows_access(self):
        """Grant override should allow access regardless of role"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        project = Project.objects.create(team=team, name='Project', slug='project')
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        
        # User is viewer (only read permission)
        OrganizationMember.objects.create(organization=org, user=user, role='viewer')
        
        # Grant delete permission via override
        PermissionOverride.objects.create(
            user=user,
            resource_type='project',
            resource_id=project.id,
            permission='delete',
            is_granted=True
        )
        
        result = permission_checker.check_permission(user, 'project', project.id, 'delete')
        
        # This will FAIL in before (no override support) and PASS in after
        assert result is True
    
    def test_deny_override_blocks_access(self):
        """Deny override should block access regardless of role"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        project = Project.objects.create(team=team, name='Project', slug='project')
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        
        # User is owner (all permissions)
        OrganizationMember.objects.create(organization=org, user=user, role='owner')
        
        # Deny delete permission via override
        PermissionOverride.objects.create(
            user=user,
            resource_type='project',
            resource_id=project.id,
            permission='delete',
            is_granted=False
        )
        
        result = permission_checker.check_permission(user, 'project', project.id, 'delete')
        
        # This will FAIL in before (no override support) and PASS in after
        assert result is False


@pytest.mark.django_db
class TestCustomRoles:
    """Tests custom roles with validation - FAIL in before, PASS in after"""
    
    def test_custom_role_permissions_subset_of_base_role(self):
        """Custom role permissions must be subset of base role"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        
        # Create custom role based on admin (5 permissions)
        role = CustomRole(
            organization=org,
            name='Limited Admin',
            base_role='admin',
            permissions=['read', 'update']  # Subset of admin permissions
        )
        role.save()
        
        # This will FAIL in before (no validation) and PASS in after
        assert role.permissions == ['read', 'update']
    
    def test_custom_role_exceeding_base_role_fails(self):
        """Custom role with permissions exceeding base role should fail"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        
        # Try to create custom role with permissions exceeding viewer
        role = CustomRole(
            organization=org,
            name='Super Viewer',
            base_role='viewer',  # Only has 'read'
            permissions=['read', 'create', 'update']  # Exceeds viewer permissions
        )
        
        # This will FAIL in before (no validation) and PASS in after (raises error)
        with pytest.raises(Exception):
            role.save()


@pytest.mark.django_db
class TestAdversarialScenarios:
    """Adversarial tests to catch edge cases and security issues"""
    
    def test_no_organization_membership_denies_all_access(self):
        """User with no organization membership should have no access"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        
        # No membership created
        
        result = permission_checker.check_permission(user, 'team', team.id, 'read')
        assert result is False
    
    def test_user_without_current_organization_denied(self):
        """User without current_organization should be denied"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        
        user = User.objects.create_user(username='testuser', password='pass')
        # No current_organization set
        
        OrganizationMember.objects.create(organization=org, user=user, role='owner')
        
        result = permission_checker.check_permission(user, 'team', team.id, 'read')
        assert result is False
    
    def test_nonexistent_resource_returns_false(self):
        """Permission check on non-existent resource should return False"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        
        OrganizationMember.objects.create(organization=org, user=user, role='owner')
        
        result = permission_checker.check_permission(user, 'team', 99999, 'read')
        assert result is False
    
    def test_permission_override_takes_precedence_over_role(self):
        """Permission override should take precedence over role-based permissions"""
        org = Organization.objects.create(name='Test Org', slug='test-org')
        team = Team.objects.create(organization=org, name='Team', slug='team')
        
        user = User.objects.create_user(username='testuser', password='pass')
        user.current_organization = org
        user.save()
        
        OrganizationMember.objects.create(organization=org, user=user, role='owner')
        
        # Deny read permission (owner normally has it)
        PermissionOverride.objects.create(
            user=user,
            resource_type='team',
            resource_id=team.id,
            permission='read',
            is_granted=False
        )
        
        result = permission_checker.check_permission(user, 'team', team.id, 'read')
        assert result is False
