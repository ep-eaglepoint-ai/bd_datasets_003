from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.models import Project, Team
from permissions.services.permission_checker import permission_checker


class ProjectViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self, request):
        if not hasattr(request.user, 'current_organization') or not request.user.current_organization:
            return Project.objects.none()
        
        return Project.objects.filter(
            team__organization=request.user.current_organization
        ).select_related('team', 'team__organization')

    def list(self, request):
        queryset = self.get_queryset(request)
        project_ids = list(queryset.values_list('id', flat=True))
        
        if not project_ids:
            return Response([])
        
        permissions = permission_checker.bulk_check_permissions(
            request.user, 'project', project_ids, 'read'
        )
        
        allowed_ids = [pid for pid, allowed in permissions.items() if allowed]
        queryset = queryset.filter(id__in=allowed_ids)
        
        data = [{'id': p.id, 'name': p.name, 'slug': p.slug} for p in queryset]
        return Response(data)

    def create(self, request):
        team_id = request.data.get('team_id')
        name = request.data.get('name')
        slug = request.data.get('slug')

        if not all([team_id, name, slug]):
            return Response({'error': 'Missing required fields'}, status=status.HTTP_400_BAD_REQUEST)

        if not hasattr(request.user, 'current_organization') or not request.user.current_organization:
            return Response({'error': 'No organization context'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            team = Team.objects.get(id=team_id, organization=request.user.current_organization)
        except Team.DoesNotExist:
            return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)

        if not permission_checker.check_permission(request.user, 'team', team_id, 'create'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        project = Project.objects.create(team=team, name=name, slug=slug)
        return Response({'id': project.id, 'name': project.name, 'slug': project.slug}, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        if not hasattr(request.user, 'current_organization') or not request.user.current_organization:
            return Response({'error': 'No organization context'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            project = Project.objects.select_related('team__organization').get(
                pk=pk, team__organization=request.user.current_organization
            )
        except Project.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        if not permission_checker.check_permission(request.user, 'project', project.id, 'read'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        return Response({'id': project.id, 'name': project.name, 'slug': project.slug})

    def update(self, request, pk=None):
        if not hasattr(request.user, 'current_organization') or not request.user.current_organization:
            return Response({'error': 'No organization context'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            project = Project.objects.select_related('team__organization').get(
                pk=pk, team__organization=request.user.current_organization
            )
        except Project.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        if not permission_checker.check_permission(request.user, 'project', project.id, 'update'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        project.name = request.data.get('name', project.name)
        project.slug = request.data.get('slug', project.slug)
        project.save()

        return Response({'id': project.id, 'name': project.name, 'slug': project.slug})

    def destroy(self, request, pk=None):
        if not hasattr(request.user, 'current_organization') or not request.user.current_organization:
            return Response({'error': 'No organization context'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            project = Project.objects.select_related('team__organization').get(
                pk=pk, team__organization=request.user.current_organization
            )
        except Project.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        if not permission_checker.check_permission(request.user, 'project', project.id, 'delete'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
