const express = require('express');
const app = express();

app.use(express.json());

let projects = [];
let tasks = [];
let nextProjectId = 1;
let nextTaskId = 1;

const VALID_STATUSES = ['todo', 'in-progress', 'review', 'done'];
const VALID_TRANSITIONS = {
    'todo': ['in-progress'],
    'in-progress': ['review', 'todo'],
    'review': ['done', 'in-progress'],
    'done': ['in-progress']
};

const TEAM_MEMBERS = ['alice', 'bob', 'charlie', 'diana'];

app.get('/projects', (req, res) => {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;

    const paginatedProjects = projects.slice(offset, offset + limit);
    res.json({
        data: paginatedProjects,
        total: projects.length,
        limit,
        offset
    });
});

app.post('/projects', (req, res) => {
    const { name, description, organization } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Project name is required' });
    }

    const org = organization || 'default';
    const existingProject = projects.find(p => p.name === name && p.organization === org);
    if (existingProject) {
        return res.status(409).json({ error: 'Project with this name already exists in the organization' });
    }

    const project = {
        id: nextProjectId++,
        name,
        description: description || '',
        organization: org,
        createdAt: new Date().toISOString()
    };

    projects.push(project);
    res.status(201).json(project);
});

app.get('/projects/:id', (req, res) => {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid project ID format' });
    }

    const project = projects.find(p => p.id === id);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    const taskCount = tasks.filter(t => t.projectId === id).length;
    res.json({ ...project, taskCount });
});

app.delete('/projects/:id', (req, res) => {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid project ID format' });
    }

    const projectIndex = projects.findIndex(p => p.id === id);
    if (projectIndex === -1) {
        return res.status(404).json({ error: 'Project not found' });
    }

    projects.splice(projectIndex, 1);
    tasks = tasks.filter(t => t.projectId !== id);

    res.status(204).send();
});

app.post('/projects/:projectId/tasks', (req, res) => {
    const projectId = parseInt(req.params.projectId);
    const { title, description, priority } = req.body;

    if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID format' });
    }

    const project = projects.find(p => p.id === projectId);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    if (!title) {
        return res.status(400).json({ error: 'Task title is required' });
    }

    const task = {
        id: nextTaskId++,
        projectId,
        title,
        description: description || '',
        priority: priority || 'medium',
        status: 'todo',
        assignee: null,
        statusHistory: [{ status: 'todo', timestamp: new Date().toISOString() }],
        createdAt: new Date().toISOString()
    };

    tasks.push(task);
    res.status(201).json(task);
});

app.get('/projects/:projectId/tasks', (req, res) => {
    const projectId = parseInt(req.params.projectId);
    const { status, assignee } = req.query;

    if (isNaN(projectId)) {
        return res.status(400).json({ error: 'Invalid project ID format' });
    }

    const project = projects.find(p => p.id === projectId);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    let projectTasks = tasks.filter(t => t.projectId === projectId);

    if (status) {
        projectTasks = projectTasks.filter(t => t.status === status);
    }

    if (assignee) {
        projectTasks = projectTasks.filter(t => t.assignee === assignee);
    }

    res.json(projectTasks);
});

app.get('/tasks/:id', (req, res) => {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const task = tasks.find(t => t.id === id);
    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
});

app.put('/tasks/:id/status', (req, res) => {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const task = tasks.find(t => t.id === id);
    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }

    if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
            error: 'Invalid status',
            validStatuses: VALID_STATUSES
        });
    }

    const allowedTransitions = VALID_TRANSITIONS[task.status];
    if (!allowedTransitions.includes(status)) {
        return res.status(400).json({
            error: `Cannot transition from '${task.status}' to '${status}'`,
            allowedTransitions
        });
    }

    task.status = status;
    task.statusHistory.push({ status, timestamp: new Date().toISOString() });
    task.updatedAt = new Date().toISOString();

    res.json(task);
});

app.put('/tasks/:id/assign', (req, res) => {
    const id = parseInt(req.params.id);
    const { assignee } = req.body;

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid task ID format' });
    }

    const task = tasks.find(t => t.id === id);
    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }

    if (assignee === null || assignee === '') {
        task.assignee = null;
        task.updatedAt = new Date().toISOString();
        return res.json(task);
    }

    if (!TEAM_MEMBERS.includes(assignee)) {
        return res.status(400).json({
            error: 'Invalid team member',
            validMembers: TEAM_MEMBERS
        });
    }

    task.assignee = assignee;
    task.updatedAt = new Date().toISOString();
    res.json(task);
});

app.get('/projects/:id/progress', (req, res) => {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid project ID format' });
    }

    const project = projects.find(p => p.id === id);
    if (!project) {
        return res.status(404).json({ error: 'Project not found' });
    }

    const projectTasks = tasks.filter(t => t.projectId === id);

    const statusCounts = {
        'todo': 0,
        'in-progress': 0,
        'review': 0,
        'done': 0
    };

    projectTasks.forEach(t => {
        statusCounts[t.status]++;
    });

    const totalTasks = projectTasks.length;
    const completedTasks = statusCounts['done'];
    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    res.json({
        projectId: id,
        totalTasks,
        statusCounts,
        completionPercentage
    });
});

const resetData = () => {
    projects = [];
    tasks = [];
    nextProjectId = 1;
    nextTaskId = 1;
};

module.exports = { app, resetData, VALID_STATUSES, VALID_TRANSITIONS, TEAM_MEMBERS };
