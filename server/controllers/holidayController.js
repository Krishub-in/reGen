import Holiday from '../models/Holiday.js';
import { resolveCompanyId } from '../utils/resolveCompanyId.js';
import { emitToCompany } from '../socket.js';

export const addHoliday = async (req, res) => {
  try {
    const body = { ...req.body };
    body.companyId = await resolveCompanyId(req, body);
    const h = new Holiday(body);
    await h.save();
    emitToCompany('payroll:change', h.companyId, { action: 'holiday_added', date: h.date });
    res.status(201).json(h);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateHoliday = async (req, res) => {
  try {
    const id = req.params.id || req.body.id;
    const filter = { id };
    if (req.companyId) filter.companyId = req.companyId;
    const h = await Holiday.findOneAndUpdate(filter, req.body, { new: true });
    if (!h) return res.status(404).json({ message: 'Holiday not found' });
    emitToCompany('payroll:change', h.companyId, { action: 'holiday_updated', date: h.date });
    res.status(200).json(h);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteHoliday = async (req, res) => {
  try {
    const id = req.params.id;
    const filter = { id };
    if (req.companyId) filter.companyId = req.companyId;
    const h = await Holiday.findOneAndDelete(filter);
    if (!h) return res.status(404).json({ message: 'Holiday not found' });
    emitToCompany('payroll:change', h.companyId, { action: 'holiday_deleted', date: h.date });
    res.status(200).json({ message: 'Holiday deleted' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getAllHolidays = async (req, res) => {
  try {
    const isSuperAdminView = req.headers['x-portal-view'] === 'superadmin' || req.query.portalView === 'superadmin';
    const isEmsView = req.headers['x-portal-view'] === 'ems' || req.query.portalView === 'ems';
    const isSuperAdmin = req.user?.role === 'param' || req.user?.role === 'admin' || isSuperAdminView;
    const filter = (isSuperAdmin && !isEmsView) ? {} : (req.companyId ? { companyId: req.companyId } : {});
    const holidays = await Holiday.find(filter).sort({ date: 1 });
    res.status(200).json(holidays);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const seedSundays = async (req, res) => {
  try {
    const name = req.body.name || 'Sunday';
    const startDate = req.body.startDate ? String(req.body.startDate) : null;
    const endDate = req.body.endDate ? String(req.body.endDate) : null;
    const year = Number(req.body.year) || new Date().getFullYear();
    const start = startDate ? new Date(`${startDate}T00:00:00.000Z`) : new Date(`${year}-01-01T00:00:00.000Z`);
    const end = endDate ? new Date(`${endDate}T23:59:59.999Z`) : new Date(`${year}-12-31T23:59:59.999Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid startDate/endDate' });
    }

    const ops = [];
    const companyId = req.companyId || null;
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      if (d.getUTCDay() === 0) {
        const dateStr = d.toISOString().slice(0, 10);
        const idSuffix = companyId ? `-${companyId}` : '';
        const id = `holiday-sunday-${dateStr}${idSuffix}`;
        const doc = { id, name, date: dateStr };
        if (companyId) doc.companyId = companyId;
        ops.push({
          updateOne: {
            filter: { id },
            update: { $set: doc },
            upsert: true
          }
        });
      }
    }
    if (ops.length > 0) {
      await Holiday.bulkWrite(ops);
    }
    res.status(200).json({ message: 'Seeded Sundays', startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), count: ops.length });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
