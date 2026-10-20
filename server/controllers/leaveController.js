import Leave from '../models/Leave.js';
import mongoose from 'mongoose';
import { resolveCompanyId } from '../utils/resolveCompanyId.js';

export const createLeave = async (req, res) => {
  try {
    const body = { ...req.body };
    if (!body.id) body.id = new mongoose.Types.ObjectId().toString();
    if (!body.createdAt) body.createdAt = new Date().toISOString();
    if (!body.status) body.status = 'pending';
    body.companyId = await resolveCompanyId(req, body);
    const leave = new Leave(body);
    await leave.save();
    res.status(201).json(leave);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllLeaves = async (req, res) => {
  try {
    const filter = req.companyId ? { companyId: req.companyId } : {};
    const leaves = await Leave.find(filter);
    res.status(200).json(leaves);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUserLeaves = async (req, res) => {
  try {
    const filter = { userId: req.params.userId };
    if (req.companyId) filter.companyId = req.companyId;
    const leaves = await Leave.find(filter);
    res.status(200).json(leaves);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateLeaveStatus = async (req, res) => {
  try {
    const id = req.params.id;
    const filter = mongoose.isValidObjectId(id) ? { $or: [{ id }, { _id: id }] } : { id };
    if (req.companyId) filter.companyId = req.companyId;
    const leave = await Leave.findOneAndUpdate(filter, { status: req.body.status }, { new: true });
    if (!leave) return res.status(404).json({ message: 'Leave not found' });
    res.status(200).json(leave);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
