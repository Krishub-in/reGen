import ScrumNote from '../models/ScrumNote.js';
import { resolveCompanyId } from '../utils/resolveCompanyId.js';
import { emitToCompany } from '../socket.js';

export const addScrumNote = async (req, res) => {
  try {
    const payload = { ...req.body };
    payload.companyId = await resolveCompanyId(req, payload);
    if (payload.timer === undefined) payload.timer = 0;
    if (payload.elapsedMs === undefined) payload.elapsedMs = 0;

    // Exclusivity: If starting a task in_progress, pause any other running scrum notes and tasks for this user
    if (payload.status === 'in_progress' && payload.userId) {
      const otherScrumFilter = {
        userId: payload.userId,
        status: 'in_progress'
      };
      if (payload.companyId) otherScrumFilter.companyId = payload.companyId;
      await ScrumNote.updateMany(otherScrumFilter, { status: 'paused', pausedAt: new Date().toISOString() });

      try {
        const { default: Task } = await import('../models/Task.js');
        const taskPauseFilter = {
          $or: [{ assignedTo: payload.userId }, { assignee: payload.userId }],
          status: 'in_progress'
        };
        if (payload.companyId) taskPauseFilter.companyId = payload.companyId;
        await Task.updateMany(taskPauseFilter, { status: 'paused' });
      } catch (e) {}
    }

    const note = new ScrumNote(payload);
    await note.save();
    emitToCompany('scrum:change', note.companyId, { action: 'create', id: note.id });
    res.status(201).json(note);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateScrumNote = async (req, res) => {
  try {
    const id = req.params.id;
    const findFilter = { id };
    if (req.companyId) findFilter.companyId = req.companyId;
    const prev = await ScrumNote.findOne(findFilter);
    if (!prev) return res.status(404).json({ message: 'Scrum note not found' });
    const payload = { ...req.body };
    if (payload.timer === undefined) payload.timer = typeof prev.timer === 'number' ? prev.timer : 0;
    if (payload.elapsedMs === undefined) payload.elapsedMs = typeof prev.elapsedMs === 'number' ? prev.elapsedMs : 0;

    // Exclusivity: If updating/resuming to in_progress, pause any other running scrum notes and tasks for this user
    if (payload.status === 'in_progress') {
      const otherFilter = {
        id: { $ne: prev.id },
        userId: prev.userId,
        status: 'in_progress'
      };
      if (req.companyId) otherFilter.companyId = req.companyId;
      await ScrumNote.updateMany(otherFilter, { status: 'paused', pausedAt: new Date().toISOString() });

      try {
        const { default: Task } = await import('../models/Task.js');
        const taskPauseFilter = {
          id: { $ne: prev.id },
          $or: [{ assignedTo: prev.userId }, { assignee: prev.userId }],
          status: 'in_progress'
        };
        if (req.companyId) taskPauseFilter.companyId = req.companyId;
        await Task.updateMany(taskPauseFilter, { status: 'paused' });
      } catch (e) {}
    }
    const note = await ScrumNote.findOneAndUpdate(findFilter, payload, { new: true });
    if (!note) return res.status(404).json({ message: 'Scrum note not found' });
    emitToCompany('scrum:change', note.companyId, { action: 'update', id: note.id });
    res.status(200).json(note);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllScrumNotes = async (req, res) => {
  try {
    const filter = req.companyId ? { companyId: req.companyId } : {};
    const notes = await ScrumNote.find(filter).sort({ createdAt: -1 });
    res.status(200).json(notes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserScrumNotes = async (req, res) => {
  try {
    const filter = { userId: req.params.userId };
    if (req.companyId) filter.companyId = req.companyId;
    const notes = await ScrumNote.find(filter).sort({ createdAt: -1 });
    res.status(200).json(notes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
