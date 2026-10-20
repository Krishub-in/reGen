import Attendance from '../models/Attendance.js';
import mongoose from 'mongoose';
import { resolveCompanyId } from '../utils/resolveCompanyId.js';
import { emitToCompany, emitToUser, getIO } from '../socket.js';

export const recordAttendance = async (req, res) => {
  try {
    const body = { ...req.body };
    if (!body.id) body.id = new mongoose.Types.ObjectId().toString();
    const validStatuses = ['present', 'absent', 'late', 'half_day'];
    if (body.status && typeof body.status === 'object') {
      body.status = Object.keys(body.status)[0];
    }
    if (!validStatuses.includes(body.status)) {
      body.status = 'present';
    }
    body.companyId = await resolveCompanyId(req, body);
    const attendance = new Attendance(body);
    await attendance.save();

    emitToCompany('attendance:change', attendance.companyId, { action: 'create', id: attendance.id, attendance });
    if (attendance.userId) {
      emitToUser(attendance.userId, 'attendance:change', { action: 'create', id: attendance.id, attendance });
    }
    const io = getIO();
    if (io) {
      io.emit('attendance:change', { action: 'create', id: attendance.id, companyId: attendance.companyId, userId: attendance.userId });
    }

    res.status(201).json(attendance);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllAttendance = async (req, res) => {
  try {
    const filter = req.companyId ? { companyId: req.companyId } : {};
    const attendance = await Attendance.find(filter);
    res.status(200).json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserAttendance = async (req, res) => {
  try {
    const filter = { userId: req.params.userId };
    if (req.companyId) filter.companyId = req.companyId;
    const attendance = await Attendance.find(filter);
    res.status(200).json(attendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateAttendance = async (req, res) => {
  try {
    const id = req.body.id || req.params.id;
    const filter = mongoose.isValidObjectId(id) ? { $or: [{ id }, { _id: id }] } : { id };
    if (req.companyId) filter.companyId = req.companyId;
    const updateData = { ...req.body };
    const validStatuses = ['present', 'absent', 'late', 'half_day'];
    if (updateData.status) {
      if (typeof updateData.status === 'object') {
        updateData.status = Object.keys(updateData.status)[0];
      }
      if (!validStatuses.includes(updateData.status)) {
        delete updateData.status;
      }
    }
    const attendance = await Attendance.findOneAndUpdate(filter, updateData, { new: true });
    if (!attendance) return res.status(404).json({ message: 'Attendance not found' });

    emitToCompany('attendance:change', attendance.companyId, { action: 'update', id: attendance.id, attendance });
    if (attendance.userId) {
      emitToUser(attendance.userId, 'attendance:change', { action: 'update', id: attendance.id, attendance });
    }
    const io = getIO();
    if (io) {
      io.emit('attendance:change', { action: 'update', id: attendance.id, companyId: attendance.companyId, userId: attendance.userId });
    }

    res.status(200).json(attendance);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
