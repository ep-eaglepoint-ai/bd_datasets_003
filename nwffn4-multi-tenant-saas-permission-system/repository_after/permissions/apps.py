from django.apps import AppConfig


class PermissionsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'permissions'

    def ready(self):
        from django.db.models.signals import post_save, post_delete
        from .signals import (
            invalidate_membership_cache,
            invalidate_override_cache,
            invalidate_custom_role_cache
        )
        from accounts.models import (
            OrganizationMember, TeamMember, ProjectMember,
            PermissionOverride, CustomRole
        )
        
        for model in [OrganizationMember, TeamMember, ProjectMember]:
            post_save.connect(invalidate_membership_cache, sender=model)
            post_delete.connect(invalidate_membership_cache, sender=model)
        
        post_save.connect(invalidate_override_cache, sender=PermissionOverride)
        post_delete.connect(invalidate_override_cache, sender=PermissionOverride)
        
        post_save.connect(invalidate_custom_role_cache, sender=CustomRole)
        post_delete.connect(invalidate_custom_role_cache, sender=CustomRole)
