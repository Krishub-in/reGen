import Project from '../models/Project.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { safeRandomUUID } from '../utils/safeRandomUUID.js';

/**
 * Controller: Get all projects for current company
 */
export const getProjects = async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) return res.status(400).json({ message: 'Company context required' });

    const projects = await Project.find({ companyId }).sort({ createdAt: -1 }).lean();

    // Enrich each project with task counts
    const projectIds = projects.map(p => p.id);
    const tasks = await Task.find({
      companyId,
      projectId: { $in: projectIds }
    }).lean();

    const taskMap = new Map();
    tasks.forEach(t => {
      const pId = t.projectId;
      if (!taskMap.has(pId)) {
        taskMap.set(pId, { total: 0, completed: 0, inProgress: 0 });
      }
      const entry = taskMap.get(pId);
      entry.total += 1;
      const status = typeof t.status === 'string' ? t.status : Object.keys(t.status || {})[0];
      if (status === 'done' || status === 'completed') entry.completed += 1;
      else if (status === 'in_progress') entry.inProgress += 1;
    });

    const enriched = projects.map(p => ({
      ...p,
      taskMetrics: taskMap.get(p.id) || { total: 0, completed: 0, inProgress: 0 }
    }));

    res.status(200).json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Controller: Create Project
 */
export const createProject = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { name, description, assignedEmployees = [], priority = 'medium', startDate, dueDate } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Project name is required' });
    }

    if (!companyId) {
      return res.status(400).json({ message: 'Company context required' });
    }

    const projectId = safeRandomUUID();
    const creator = req.user?.name || req.user?.username || 'Company Admin';

    const project = new Project({
      id: projectId,
      companyId,
      name: name.trim(),
      description: description ? description.trim() : '',
      assignedEmployees,
      priority,
      startDate: startDate || '',
      dueDate: dueDate || '',
      createdBy: creator
    });

    await project.save();

    // Send notifications to all assigned employees
    for (const emp of assignedEmployees) {
      const uId = emp.userId;
      if (!uId) continue;

      await Notification.create({
        id: safeRandomUUID(),
        companyId,
        userId: uId,
        title: `Added to Project: ${project.name}`,
        message: `You have been assigned as a team member on project "${project.name}".`,
        type: 'general',
        senderName: creator,
        createdAt: new Date().toISOString(),
        metadata: { projectId: project.id, projectName: project.name }
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`company:${companyId}`).emit('project:created', project);
    }

    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Controller: Update Project
 */
export const updateProject = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { id } = req.params;
    const updates = { ...req.body };

    const project = await Project.findOneAndUpdate(
      { id, companyId },
      updates,
      { new: true }
    );

    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Update projectName on all existing tasks if name changed
    if (updates.name) {
      await Task.updateMany(
        { projectId: id, companyId },
        { $set: { projectName: updates.name.trim() } }
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`company:${companyId}`).emit('project:updated', project);
    }

    res.status(200).json(project);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Controller: Delete Project
 */
export const deleteProject = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    const project = await Project.findOneAndDelete({ id, companyId });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    // Unlink tasks
    await Task.updateMany(
      { projectId: id, companyId },
      { $unset: { projectId: 1, projectName: 1 }, $set: { isProjectTask: false } }
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`company:${companyId}`).emit('project:deleted', { id });
    }

    res.status(200).json({ message: 'Project deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Controller: Create Task(s) inside a Project
 * Supports assigning to an individual project member OR assigning to ALL employees in the project!
 */
export const createProjectTask = async (req, res) => {
  try {
    const companyId = req.companyId;
    const { id } = req.params; // projectId
    const {
      title,
      description,
      priority = 'medium',
      durationValue,
      durationUnit = 'days',
      startDate,
      endDate,
      dueTime,
      assignToAll = false,
      assignedTo // userId if individual
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Task title is required' });
    }

    const project = await Project.findOne({ id, companyId });
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const assignor = req.user?.name || req.user?.username || 'Project Lead';
    const durVal = parseFloat(durationValue);
    const validDuration = !isNaN(durVal) && durVal > 0 ? durVal : undefined;

    // Determine target assignees
    let targetAssignees = [];
    if (assignToAll) {
      if (!project.assignedEmployees || project.assignedEmployees.length === 0) {
        return res.status(400).json({ message: 'Project has no assigned team members to assign task to' });
      }
      targetAssignees = project.assignedEmployees.map(e => ({
        userId: e.userId,
        name: e.name || e.username || e.userId
      }));
    } else {
      if (!assignedTo) {
        return res.status(400).json({ message: 'Please select an employee for this project task' });
      }
      const member = (project.assignedEmployees || []).find(e => e.userId === assignedTo);
      targetAssignees = [{
        userId: assignedTo,
        name: member?.name || member?.username || assignedTo
      }];
    }

    const createdTasks = [];
    const io = req.app.get('io');

    for (const assignee of targetAssignees) {
      const taskId = safeRandomUUID();
      const newTask = new Task({
        id: taskId,
        companyId,
        title: title.trim(),
        description: description ? description.trim() : '',
        assignedTo: assignee.userId,
        assignorName: assignor,
        priority,
        durationValue: validDuration,
        durationUnit,
        startDate: startDate || new Date().toISOString().split('T')[0],
        endDate: endDate || '',
        dueTime: dueTime || '',
        endTime: dueTime || '',
        status: 'todo',
        projectId: project.id,
        projectName: project.name,
        isProjectTask: true
      });

      await newTask.save();
      createdTasks.push(newTask);

      // Send project_task notification to employee
      await Notification.create({
        id: safeRandomUUID(),
        companyId,
        userId: assignee.userId,
        title: `Project Task: ${title.trim()}`,
        message: `You have been assigned "${title.trim()}" in project "${project.name}".`,
        type: 'project_task',
        senderName: assignor,
        createdAt: new Date().toISOString(),
        metadata: {
          taskId,
          projectId: project.id,
          projectName: project.name,
          title: title.trim(),
          dueDate: endDate || ''
        }
      });

      if (io) {
        io.to(`company:${companyId}`).emit('task:created', newTask);
      }
    }

    res.status(201).json({
      message: `Created ${createdTasks.length} task(s) under project "${project.name}"`,
      tasks: createdTasks
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
