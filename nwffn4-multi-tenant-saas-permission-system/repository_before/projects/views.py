from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.models import Project, Team
from permissions.services.permission_checker import permission_checker


class ProjectViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        team_id = request.query_params.get('team_id')

        if team_id:
            projects = Project.objects.filter(team_id=team_id)
        else:
            projects = Project.objects.all()

        accessible_projects = []
        for project in projects:
            if permission_checker.check_permission(request.user, 'project', project.id, 'read'):
                accessible_projects.append(project)

        data = [{'id': p.id, 'name': p.name, 'slug': p.slug} for p in accessible_projects]
        return Response(data)

    def create(self, request):
        team_id = request.data.get('team_id')
        name = request.data.get('name')
        slug = request.data.get('slug')

        if not all([team_id, name, slug]):
            return Response({'error': 'Missing required fields'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            team = Team.objects.get(id=team_id)
        except Team.DoesNotExist:
            return Response({'error': 'Team not found'}, status=status.HTTP_404_NOT_FOUND)

        if not permission_checker.check_permission(request.user, 'team', team_id, 'create'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        project = Project.objects.create(team=team, name=name, slug=slug)
        return Response({'id': project.id}, status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        try:
            project = Project.objects.get(pk=pk)
        except Project.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        if not permission_checker.check_permission(request.user, 'project', project.id, 'read'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        return Response({'id': project.id, 'name': project.name, 'slug': project.slug})

    def update(self, request, pk=None):
        try:
            project = Project.objects.get(pk=pk)
        except Project.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        if not permission_checker.check_permission(request.user, 'project', project.id, 'update'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        project.name = request.data.get('name', project.name)
        project.slug = request.data.get('slug', project.slug)
        project.save()

        return Response({'id': project.id, 'name': project.name, 'slug': project.slug})

    def destroy(self, request, pk=None):
        try:
            project = Project.objects.get(pk=pk)
        except Project.DoesNotExist:
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        if not permission_checker.check_permission(request.user, 'project', project.id, 'delete'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
