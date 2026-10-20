import { useState, useEffect, useMemo } from 'react';
import { useCustomAuth } from './useCustomAuth';
import { Principal } from '@dfinity/principal';
import { hasUserRole } from '../lib/utils';

// Helper to handle BigInt serialization
const JSON_stringify = (data) => {
  return JSON.stringify(data, (_, value) =>
    typeof value === 'bigint' ? value.toString() + 'n' : value
  );
};

const JSON_parse = (json) => {
  return JSON.parse(json, (_, value) => {
    if (typeof value === 'string' && /^\d+n$/.test(value)) {
      return BigInt(value.slice(0, -1));
    }
    return value;
  });
};

// Mock implementation using LocalStorage
export const createMockActor = (identity) => {
  const principalId = identity.getPrincipal().toText();

  const getDb = (key, defaultVal = []) => {
    const stored = localStorage.getItem(key);
    return stored ? JSON_parse(stored) : defaultVal;
  };

  const setDb = (key, data) => {
    localStorage.setItem(key, JSON_stringify(data));
  };

  return {
    getCallerUserProfile: async () => {
      const profiles = getDb('db_profiles', {});
      return profiles[principalId] || null;
    },
    saveCallerUserProfile: async (profile) => {
      const profiles = getDb('db_profiles', {});
      profiles[principalId] = profile;
      setDb('db_profiles', profiles);

      // Also update the global users list
      // We read from the serialized source to ensure consistency
      const storedUsers = localStorage.getItem('db_users_serialized');
      let users = storedUsers ? JSON.parse(storedUsers) : [];
      
      // Deserialize IDs for manipulation
      const deserializedUsers = users.map((u) => ({
        ...u,
        id: Principal.fromText(u.id)
      }));

      const existingIndex = deserializedUsers.findIndex(u => u.id.toText() === principalId);
      
      const userEntry = {
        id: identity.getPrincipal(), // Use the actual principal object
        username: profile.username,
        firstName: profile.name.split(' ')[0],
        lastName: profile.name.split(' ').slice(1).join(' ') || '',
        role: profile.role,
        department: profile.department,
        designation: profile.designation,
        salary: profile.salary,
        avatar: profile.avatar,
        phone: profile.contact || profile.phone || '',
        gender: profile.gender || '',
        aadhaar: profile.aadhaar || '',
        referralSource: profile.referralSource || '',
        address: profile.address || '',
        age: profile.age || 0,
        dateOfBirth: profile.dateOfBirth || ''
      };

      if (existingIndex >= 0) {
        deserializedUsers[existingIndex] = userEntry;
      } else {
        deserializedUsers.push(userEntry);
      }
      
      // Serialize back
      const serializedUsers = deserializedUsers.map(u => ({
        ...u,
        id: u.id.toText(),
        salary: u.salary ? u.salary.toString() + 'n' : undefined
      }));
      localStorage.setItem('db_users_serialized', JSON.stringify(serializedUsers));
    },
    getAllUsers: async () => {
      const stored = localStorage.getItem('db_users_serialized');
      if (!stored) return [];
      const serializedUsers = JSON.parse(stored);
      return serializedUsers.map((u) => ({
        ...u,
        id: Principal.fromText(u.id),
        salary: u.salary && typeof u.salary === 'string' && u.salary.endsWith('n') ? BigInt(u.salary.slice(0, -1)) : u.salary,
        role: u.role || { freelancer: null }
      }));
    },
    getCallerProfile: async () => {
      const users = await createMockActor(identity).getAllUsers();
      return users.find(u => u.id.toText() === principalId) || null;
    },
    
    createUser: async (user) => {
      const storedUsers = localStorage.getItem('db_users_serialized');
      let users = storedUsers ? JSON.parse(storedUsers) : [];
      
      // Check if user already exists
      if (users.some((u) => u.id === user.id.toText())) {
        throw new Error("User already exists");
      }

      const serializedUser = {
        ...user,
        id: user.id.toText(),
        salary: user.salary ? user.salary.toString() + 'n' : undefined
      };
      
      users.push(serializedUser);
      localStorage.setItem('db_users_serialized', JSON.stringify(users));
    },
    updateUser: async (user) => {
      const storedUsers = localStorage.getItem('db_users_serialized');
      let users = storedUsers ? JSON.parse(storedUsers) : [];
      
      const index = users.findIndex((u) => u.id === user.id.toText());
      if (index !== -1) {
        users[index] = {
          ...user,
          id: user.id.toText(),
          salary: user.salary ? user.salary.toString() + 'n' : undefined
        };
        localStorage.setItem('db_users_serialized', JSON.stringify(users));
      }
    },
    deleteUser: async (id) => {
      const storedUsers = localStorage.getItem('db_users_serialized');
      let users = storedUsers ? JSON.parse(storedUsers) : [];
      
      users = users.filter((u) => u.id !== id.toText());
      localStorage.setItem('db_users_serialized', JSON.stringify(users));
    },
    
    getAllTasks: async () => {
        const tasks = getDb('db_tasks', []);
        return tasks.map((t) => ({
            ...t,
            assignee: Principal.fromText(t.assignee),
            supervisor: Principal.fromText(t.supervisor),
            // Handle BigInt serialization if needed, though JSON_parse usually handles it
            startDate: typeof t.startDate === 'string' && t.startDate.endsWith('n') ? BigInt(t.startDate.slice(0, -1)) : BigInt(t.startDate),
            endDate: typeof t.endDate === 'string' && t.endDate.endsWith('n') ? BigInt(t.endDate.slice(0, -1)) : BigInt(t.endDate),
        }));
    },
    createTask: async (task) => {
       const tasks = getDb('db_tasks', []);
       tasks.push({
           ...task,
           assignee: task.assignee.toText(),
           supervisor: task.supervisor.toText(),
           startDate: task.startDate.toString() + 'n',
           endDate: task.endDate.toString() + 'n'
       });
       setDb('db_tasks', tasks);
    },
    updateTask: async (task) => {
        const tasks = getDb('db_tasks', []);
        const idx = tasks.findIndex((t) => t.id === task.id);
        if (idx !== -1) {
            tasks[idx] = {
                ...task,
                assignee: task.assignee.toText(),
                supervisor: task.supervisor.toText(),
                startDate: task.startDate.toString() + 'n',
                endDate: task.endDate.toString() + 'n'
            };
            setDb('db_tasks', tasks);
        }
    },
    deleteTask: async (id) => {
        const tasks = getDb('db_tasks', []);
        setDb('db_tasks', tasks.filter((t) => t.id !== id));
    },

    getAllAttendance: async () => {
        const all = getDb('db_attendance', []);
        return all.map((a) => ({
            ...a,
            userId: Principal.fromText(a.userId)
        }));
    },
    getUserAttendance: async (userId) => {
        const all = getDb('db_attendance', []);
        return all
            .filter((a) => a.userId === userId.toText())
            .map((a) => ({
                ...a,
                userId: Principal.fromText(a.userId)
            }));
    },
    recordAttendance: async (attendance) => {
        const all = getDb('db_attendance', []);
        // Serialize Principal to text for storage
        const entry = { ...attendance, userId: attendance.userId.toText() }; 
        all.push(entry);
        setDb('db_attendance', all);
    },
    updateAttendance: async (attendance) => {
        const all = getDb('db_attendance', []);
        const idx = all.findIndex((a) => a.id === attendance.id);
        if (idx !== -1) {
            all[idx] = { ...attendance, userId: attendance.userId.toText() };
            setDb('db_attendance', all);
        }
    },

    getAllMessages: async () => {
        const all = getDb('db_messages', []);
        return all.map((m) => ({
            ...m,
            senderId: Principal.fromText(m.senderId)
        }));
    },
    sendMessage: async (msg) => {
        const all = getDb('db_messages', []);
        all.push({ ...msg, senderId: msg.senderId.toText() });
        setDb('db_messages', all);
    },

    getAllMeetingNotes: async () => getDb('db_notes', []),
    addMeetingNote: async (note) => {
        const notes = getDb('db_notes', []);
        notes.push(note);
        setDb('db_notes', notes);
    },
    updateMeetingNote: async (note) => {
        const notes = getDb('db_notes', []);
        const idx = notes.findIndex((n) => n.id === note.id);
        if (idx !== -1) {
            notes[idx] = note;
            setDb('db_notes', notes);
        }
    },
    deleteMeetingNote: async (id) => {
        const notes = getDb('db_notes', []);
        setDb('db_notes', notes.filter((n) => n.id !== id));
    },

    getUserScrumNotes: async (userId) => {
        const all = getDb('db_scrum_notes', []);
        return all
            .filter((n) => n.userId === userId.toText())
            .map((n) => ({
                ...n,
                userId: Principal.fromText(n.userId)
            }));
    },
    getAllScrumNotes: async () => {
        const all = getDb('db_scrum_notes', []);
        return all.map((n) => ({
            ...n,
            userId: Principal.fromText(n.userId)
        }));
    },
    addScrumNote: async (note) => {
        const all = getDb('db_scrum_notes', []);
        const serialized = {
            ...note,
            userId: note.userId.toText()
        };
        all.push(serialized);
        setDb('db_scrum_notes', all);
    },
    updateScrumNote: async (note) => {
        const all = getDb('db_scrum_notes', []);
        const idx = all.findIndex((n) => n.id === note.id);
        if (idx !== -1) {
            all[idx] = {
                ...note,
                userId: note.userId.toText()
            };
            setDb('db_scrum_notes', all);
        }
    },

    getTaskUpdatesForTask: async (taskId) => {
        const all = getDb('db_task_updates', []);
        return all
            .filter((u) => u.taskId === taskId)
            .map((u) => ({
                ...u,
                staffId: Principal.fromText(u.staffId)
            }));
    },
    getAllTaskUpdates: async () => {
        const all = getDb('db_task_updates', []);
        return all.map((u) => ({
            ...u,
            staffId: Principal.fromText(u.staffId)
        }));
    },
    addTaskUpdate: async (update) => {
        const all = getDb('db_task_updates', []);
        const serialized = {
            ...update,
            staffId: update.staffId.toText()
        };
        all.push(serialized);
        setDb('db_task_updates', all);
    },

    getAllHolidays: async () => getDb('db_holidays', [
        { id: '1', name: 'New Year', date: '2026-01-01' },
        { id: '2', name: 'Republic Day', date: '2026-01-26' },
    ]),
    addHoliday: async (holiday) => {
        const holidays = getDb('db_holidays', []);
        holidays.push(holiday);
        setDb('db_holidays', holidays);
    },
    updateHoliday: async (holiday) => {
        const holidays = getDb('db_holidays', []);
        const idx = holidays.findIndex((h) => h.id === holiday.id);
        if (idx !== -1) {
            holidays[idx] = holiday;
            setDb('db_holidays', holidays);
        }
    },
    deleteHoliday: async (id) => {
        const holidays = getDb('db_holidays', []);
        setDb('db_holidays', holidays.filter((h) => h.id !== id));
    },

    getAllLeaveRequests: async () => {
        const leaves = getDb('db_leaves', []);
        return leaves.map((l) => ({
            ...l,
            userId: Principal.fromText(l.userId)
        }));
    },
    getUserLeaveRequests: async (userId) => {
        const leaves = getDb('db_leaves', []);
        const idStr = typeof userId === 'string' ? userId : (userId?.toText ? userId.toText() : String(userId));
        return leaves
            .filter((l) => l.userId === idStr)
            .map((l) => ({
                ...l,
                userId: Principal.fromText(l.userId)
            }));
    },
    applyLeave: async (request) => {
        const leaves = getDb('db_leaves', []);
        const uid = (typeof request.userId === 'string' && request.userId)
            ? request.userId
            : (request.userId?.toText ? request.userId.toText() : (
                (typeof request.displayId === 'string' && request.displayId)
                    ? request.displayId
                    : (request.displayId?.toText ? request.displayId.toText() : '')
            ));
        if (!uid) throw new Error('userId is required for leave requests');
        leaves.push({
            ...request,
            userId: uid,
            displayId: request.displayId || uid
        });
        setDb('db_leaves', leaves);
    },
    updateLeaveRequest: async (id, status) => {
        const leaves = getDb('db_leaves', []);
        const idx = leaves.findIndex((l) => l.id === id);
        if (idx !== -1) {
            leaves[idx] = { ...leaves[idx], status };
            setDb('db_leaves', leaves);
            return leaves[idx];
        }
        throw new Error('Leave not found');
    },
    getAllPayments: async () => [],
    getUserPayments: async () => [],
    recordPayment: async () => {},
    updatePayment: async () => {},
    deletePayment: async () => {},
    
    getCompanyInfo: async () => ({
        name: "ReGen Tech",
        address: "123 Innovation Dr",
        contact: "contact@regen.com",
        gst: "GSTIN123456",
        taxDetails: "TAX-789",
        policies: "Standard Policy"
    }),
    saveCompanyInfo: async () => {},
    isCallerAdmin: async () => {
        const profile = await createMockActor(identity).getCallerUserProfile();
        return hasUserRole(profile, 'admin') || hasUserRole(profile, 'param') || false;
    },
  };
};

// HTTP implementation using MERN backend
const safePrincipal = (id) => {
    try {
        return Principal.fromText(id);
    } catch (e) {
        return { toText: () => id, toString: () => String(id), _isPrincipal: false };
    }
};

export const createHttpActor = (identity) => {
  const principalId = localStorage.getItem('current_user') || identity.getPrincipal().toText();
  const API_BASE = '/api';

  const getAuthToken = () => localStorage.getItem('auth_token');

    const toIsoDate = (value) => {
        if (!value) return undefined;
        if (typeof value === 'string') {
            if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
                const [y, m, d] = value.split('T')[0].split('-').map(Number);
                if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
                    return new Date(Date.UTC(y, m - 1, d)).toISOString();
                }
            }
            const parsed = Date.parse(value);
            if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
            return undefined;
        }
        if (typeof value === 'bigint' || typeof value === 'number') {
            return new Date(Number(value) / 1000000).toISOString();
        }
        return undefined;
    };

  const getHeaders = () => {
    const token = getAuthToken();
    const pid = localStorage.getItem('current_user') || identity.getPrincipal().toText();
    return {
      'Content-Type': 'application/json',
      'x-user-id': pid,
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  };

  const handleResponse = async (res) => {
    if (res.status === 503) {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('server-maintenance'));
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      if (err.maintenance || String(err.message || '').toLowerCase().includes('maintenance')) {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('server-maintenance'));
      }
      throw new Error(err.message || 'API Error');
    }
    return res.json();
  };
  const fetchJson = async (url, fallback = []) => {
    try {
      const res = await fetch(url, { headers: getHeaders() });
      return await handleResponse(res);
    } catch (e) {
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('maintenance') || msg.includes('failed to fetch')) {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('server-maintenance'));
      }
      if (msg.includes('abort') || msg.includes('err_aborted') || msg.includes('failed to fetch')) {
        return fallback;
      }
      throw e;
    }
  };

    const normalizeAvatar = (avatar) => {
        if (!avatar) return avatar;
        const s = String(avatar).trim();
        if (!s) return s;
        if (s.startsWith('data:') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('/uploads/')) {
            return s;
        }
        return `/uploads/${s.replace(/^\/+/, '')}`;
    };

  return {
    getCallerUserProfile: async () => {
      try {
        const res = await fetch(`${API_BASE}/users/me`, { headers: getHeaders() });
        if (res.status === 401 || res.status === 403) {
          throw new Error('Invalid session. Please login again.');
        }
        const me = await handleResponse(res);
        if (!me) return null;
        return {
          ...me,
          avatar: normalizeAvatar(me.avatar),
          role: typeof me.role === 'string' ? { [me.role]: null } : me.role,
          salary: me.salary ? BigInt(me.salary) : undefined
        };
      } catch (err) {
        const msg = String(err?.message || '').toLowerCase();
        if (msg.includes('invalid session') || msg.includes('token') || msg.includes('unauthorized') || msg.includes('access token required')) {
          throw err;
        }
        // fallback for legacy paths if not an auth error
        try {
          const users = await fetchJson(`${API_BASE}/users`, []);
          const pid = localStorage.getItem('current_user') || identity.getPrincipal().toText();
          const user = users.find((u) => u.userId === pid || u.username === pid);
          if (!user) return null;
          return {
            ...user,
            avatar: normalizeAvatar(user.avatar),
            role: typeof user.role === 'string' ? { [user.role]: null } : user.role,
            salary: user.salary ? BigInt(user.salary) : undefined
          };
        } catch {
          throw err;
        }
      }
    },
    saveCallerUserProfile: async (profile) => {
      // Resolve stored staff ID first
      const users = await handleResponse(await fetch(`${API_BASE}/users`, { headers }));
      const existing = users.find((u) => u.userId === principalId || u.username === principalId) || users.find((u) => u.username === profile.username);
      const resolvedId = existing ? existing.userId : principalId;
      const user = {
        id: resolvedId,
        username: profile.username,
        password: profile.password,
        name: profile.name,
        age: profile.age,
        dateOfBirth: profile.dateOfBirth,
        gender: profile.gender,
        aadhaar: profile.aadhaar,
        role: Object.keys(profile.role)[0] || 'freelancer', // simplistic role mapping
        email: profile.email,
        phone: profile.contact,
        department: profile.department,
        designation: profile.designation,
        salary: profile.salary ? profile.salary.toString() : undefined,
        joiningDate: profile.joiningDate,
        referralSource: profile.referralSource,
        avatar: profile.avatar,
        address: profile.address
      };
      
      // Update only; do not create new users on profile save
      const target = await fetch(`${API_BASE}/users/${resolvedId}`, { headers });
      if (target.ok) {
         return handleResponse(await fetch(`${API_BASE}/users/${resolvedId}`, {
             method: 'PUT',
             headers,
             body: JSON.stringify(user)
         }));
      } else {
         throw new Error('User not found for profile update');
      }
    },
    getAllUsers: async () => {
      const users = await fetchJson(`${API_BASE}/users`, []);
      return users.map((u) => {
        const pid = safePrincipal(u.userId || u.id);
        return {
          ...u,
                    avatar: normalizeAvatar(u.avatar),
          userId: pid,
          id: pid,
          role: typeof u.role === 'string' ? { [u.role]: null } : u.role
        };
      });
    },
    getCallerProfile: async () => {
        const users = await fetchJson(`${API_BASE}/users`, []);
        const u = users.find((u) => (u.userId === principalId || u.id === principalId) || u.username === principalId);
        if (!u) return null;
        return {
            ...u,
                        avatar: normalizeAvatar(u.avatar),
            userId: safePrincipal(u.userId || u.id),
            id: safePrincipal(u.userId || u.id),
            role: typeof u.role === 'string' ? { [u.role]: null } : u.role
        };
    },
    createUser: async (user) => {
        const payload = {
            ...user,
            userId: user.userId ? (user.userId.toText ? user.userId.toText() : String(user.userId)) : (user.id?.toText ? user.id.toText() : String(user.id)),
            role: Object.keys(user.role)[0],
            salary: user.salary ? user.salary.toString() : undefined // Serialize BigInt for new users
        };
        return handleResponse(await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        }));
    },
    updateUser: async (user) => {
        const payload = {
            ...user,
            userId: user.userId ? (user.userId.toText ? user.userId.toText() : String(user.userId)) : (user.id?.toText ? user.id.toText() : String(user.id)),
            role: Object.keys(user.role)[0],
            salary: user.salary ? user.salary.toString() : undefined // Serialize BigInt for updated users
        };
        const uid = user.userId ? (user.userId.toText ? user.userId.toText() : String(user.userId)) : (user.id?.toText ? user.id.toText() : String(user.id));
        return handleResponse(await fetch(`${API_BASE}/users/${uid}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload)
        }));
    },
    deleteUser: async (id) => {
        const uid = id?.toText ? id.toText() : String(id);
        return handleResponse(await fetch(`${API_BASE}/users/${uid}`, {
            method: 'DELETE',
            headers
        }));
    },
    
    // Tasks
    getAllTasks: async () => {
        const tasks = await fetchJson(`${API_BASE}/tasks`, []);
        return tasks.map((t) => {
            const startBig = t.startDate ? (isNaN(Date.parse(t.startDate)) ? 0n : BigInt(Date.parse(t.startDate) * 1000000)) : 0n;
            const endBig = t.endDate ? (isNaN(Date.parse(t.endDate)) ? 0n : BigInt(Date.parse(t.endDate) * 1000000)) : 0n;
            return {
                ...t,
                rawStartDate: t.startDate,
                rawEndDate: t.endDate,
                dueTime: t.dueTime || t.endTime || '',
                endTime: t.endTime || t.dueTime || '',
                assignedTo: t.assignedTo ? safePrincipal(t.assignedTo) : undefined,
                assignee: t.assignedTo ? safePrincipal(t.assignedTo) : Principal.anonymous(),
                startDate: startBig,
                endDate: endBig
            };
        });
    },
    createTask: async (task) => {
        const mapStatus = (s) => {
            if (typeof s === 'string') return s;
            const k = Object.keys(s || {})[0];
            if (k === 'inProgress') return 'in_progress';
            if (k === 'completed') return 'done';
            if (k === 'notCompleted' || k === 'not_completed') return 'not_completed';
            return k || 'todo';
        };
        const mapPriority = (p) => {
            if (typeof p === 'string') return p;
            return Object.keys(p || { medium: null })[0] || 'medium';
        };
        const startIso = toIsoDate(task.startDate || task.rawStartDate);
        const endIso = toIsoDate(task.endDate || task.rawEndDate);
        const payload = {
            ...task,
            id: task.id,
            assignedTo: typeof task.assignee === 'string' ? task.assignee : (task.assignee?.toText ? task.assignee.toText() : String(task.assignee)),
            assignorName: task.assignorName || '',
            title: task.title,
            description: task.description,
            status: mapStatus(task.status),
            priority: mapPriority(task.priority),
            durationValue: task.durationValue,
            durationUnit: task.durationUnit,
            dueTime: task.dueTime || task.endTime || '',
            endTime: task.endTime || task.dueTime || '',
            startDate: startIso,
            endDate: endIso,
            dueDate: endIso
        };
        return handleResponse(await fetch(`${API_BASE}/tasks`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        }));
    },
    updateTask: async (task) => {
         const mapStatus = (s) => {
            if (typeof s === 'string') return s;
            const k = Object.keys(s || {})[0];
            if (k === 'inProgress') return 'in_progress';
            if (k === 'completed') return 'done';
            if (k === 'notCompleted' || k === 'not_completed') return 'not_completed';
            if (k === 'paused' || k === 'blocked') return 'review';
            return k || 'todo';
         };
         const mapPriority = (p) => {
            if (typeof p === 'string') return p;
            return Object.keys(p || { medium: null })[0] || 'medium';
         };
         const startIso = toIsoDate(task.startDate || task.rawStartDate);
         const endIso = toIsoDate(task.endDate || task.rawEndDate);
         const payload = {
            ...task,
            assignedTo: typeof task.assignee === 'string' ? task.assignee : (task.assignee?.toText ? task.assignee.toText() : String(task.assignee)),
            assignorName: task.assignorName || '',
            status: mapStatus(task.status),
            priority: mapPriority(task.priority),
            durationValue: task.durationValue,
            durationUnit: task.durationUnit,
            dueTime: task.dueTime || task.endTime || '',
            endTime: task.endTime || task.dueTime || '',
            startDate: startIso,
            endDate: endIso,
            dueDate: endIso
        };
        return handleResponse(await fetch(`${API_BASE}/tasks/${task.id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload)
        }));
    },
    deleteTask: async (id) => {
        return handleResponse(await fetch(`${API_BASE}/tasks/${id}`, {
            method: 'DELETE',
            headers
        }));
    },

    // Attendance
    getAllAttendance: async () => {
        const att = await handleResponse(await fetch(`${API_BASE}/attendance`, { headers }));
        return att.map((a) => ({
            ...a,
            userId: safePrincipal(a.userId)
        }));
    },
    getUserAttendance: async (userId) => {
        const idStr = typeof userId === 'string' ? userId : (userId?.toText ? userId.toText() : String(userId));
        const att = await handleResponse(await fetch(`${API_BASE}/attendance/user/${idStr}`, { headers }));
         return att.map((a) => ({
            ...a,
            userId: safePrincipal(a.userId)
        }));
    },
    recordAttendance: async (attendance) => {
        const resolveStatus = (s) => {
            if (typeof s === 'string') return s;
            if (s && typeof s === 'object') return Object.keys(s)[0] || 'present';
            return 'present';
        };

        const payload = {
            id: attendance.id,
            userId: (typeof attendance.userId === 'string' ? attendance.userId : (attendance.userId?.toText ? attendance.userId.toText() : String(attendance.userId))),
            date: attendance.date,
            status: resolveStatus(attendance.status),
            checkIn: attendance.checkIn || (attendance.checkInTime ? new Date(Number(attendance.checkInTime) / 1000000).toISOString() : new Date().toISOString()),
            location: attendance.location || '',
            workMode: attendance.workMode || 'office',
            notes: Array.isArray(attendance.notes) ? attendance.notes.join(', ') : (attendance.notes || '')
        };
        return handleResponse(await fetch(`${API_BASE}/attendance`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        }));
    },
    updateAttendance: async (attendance) => {
        const resolveStatus = (s) => {
            if (typeof s === 'string') return s;
            if (s && typeof s === 'object') return Object.keys(s)[0] || 'present';
            return 'present';
        };

        const payload = {
            id: attendance.id,
            userId: (typeof attendance.userId === 'string' ? attendance.userId : (attendance.userId?.toText ? attendance.userId.toText() : String(attendance.userId))),
            date: attendance.date,
            status: resolveStatus(attendance.status),
            checkIn: attendance.checkIn ? attendance.checkIn : (attendance.checkInTime ? new Date(Number(attendance.checkInTime) / 1000000).toISOString() : undefined),
            checkOut: attendance.checkOut ? attendance.checkOut : (attendance.checkOutTime && attendance.checkOutTime.length > 0 ? new Date(Number(attendance.checkOutTime[0]) / 1000000).toISOString() : undefined),
            workMode: attendance.workMode || 'office',
            notes: Array.isArray(attendance.notes) ? attendance.notes.join(', ') : (attendance.notes || '')
        };
        return handleResponse(await fetch(`${API_BASE}/attendance/${attendance.id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload)
        }));
    },

    // Company
    getCompanyInfo: async () => {
        const companies = await handleResponse(await fetch(`${API_BASE}/company`, { headers }));
        return companies[0] || null;
    },
    getAllCompanies: async () => {
        return handleResponse(await fetch(`${API_BASE}/company`, { headers }));
    },
    createCompany: async (info) => {
        return handleResponse(await fetch(`${API_BASE}/company`, {
            method: 'POST',
            headers,
            body: JSON.stringify(info)
        }));
    },
    updateCompany: async (id, info) => {
        return handleResponse(await fetch(`${API_BASE}/company/${id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(info)
        }));
    },
    saveCompanyInfo: async (info) => {
        return handleResponse(await fetch(`${API_BASE}/company`, {
            method: 'POST',
            headers,
            body: JSON.stringify(info)
        }));
    },

    // Notifications
    getUserNotifications: async (userId) => {
        const idStr = typeof userId === 'string' ? userId : (userId?.toText ? userId.toText() : String(userId));
        return fetchJson(`${API_BASE}/notifications/user/${idStr}`, []);
    },
    sendNotification: async (notification) => {
        return handleResponse(await fetch(`${API_BASE}/notifications`, {
            method: 'POST',
            headers,
            body: JSON.stringify(notification)
        }));
    },
    // Stubs for others
    getAllMessages: async () => {
        return fetchJson(`${API_BASE}/messages`, []);
    },
    sendMessage: async (message) => {
        const payload = {
            messageId: message.id,
            id: message.id,
            senderId: (typeof message.senderId === 'string' ? message.senderId : (message.senderId?.toText ? message.senderId.toText() : String(message.senderId))),
            senderName: message.sender || '',
            content: typeof message.content === 'string' ? message.content : '',
            timestamp: new Date(Number(message.timestamp) / 1000000).toISOString(),
            attachments: Array.isArray(message.attachments)
              ? message.attachments.map(a => ({
                  name: a.name,
                  type: a.type,
                  size: a.size,
                  data: a.data
                }))
              : []
        };
        return handleResponse(await fetch(`${API_BASE}/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        }));
    },
    deleteMessage: async (id) => {
        return handleResponse(await fetch(`${API_BASE}/messages/${id}`, {
            method: 'DELETE',
            headers
        }));
    },
    editMessage: async (id, content) => {
        return handleResponse(await fetch(`${API_BASE}/messages/${id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ content })
        }));
    },
    getAllMeetingNotes: async () => {
        return fetchJson(`${API_BASE}/meeting-notes`, []);
    },
    addMeetingNote: async (note) => {
        const payload = {
            id: note.id,
            title: note.title,
            content: note.content,
            timestamp: new Date(Number(note.timestamp) / 1000000).toISOString()
        };
        return handleResponse(await fetch(`${API_BASE}/meeting-notes`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        }));
    },
    updateMeetingNote: async (note) => {
        const payload = {
            id: note.id,
            title: note.title,
            content: note.content,
            timestamp: new Date(Number(note.timestamp) / 1000000).toISOString()
        };
        return handleResponse(await fetch(`${API_BASE}/meeting-notes/${note.id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload)
        }));
    },
    deleteMeetingNote: async (id) => {
        return handleResponse(await fetch(`${API_BASE}/meeting-notes/${id}`, {
            method: 'DELETE',
            headers
        }));
    },
    getUserScrumNotes: async (userId) => {
        const idStr = typeof userId === 'string' ? userId : (userId?.toText ? userId.toText() : String(userId));
        return fetchJson(`${API_BASE}/scrum/user/${idStr}`, []);
    },
    getAllScrumNotes: async () => {
        return fetchJson(`${API_BASE}/scrum`, []);
    },
    addScrumNote: async (note) => {
        const payload = {
            id: note.id,
            userId: (typeof note.userId === 'string' ? note.userId : (note.userId?.toText ? note.userId.toText() : String(note.userId))),
            taskDetails: note.taskDetails,
            status: note.status,
            priority: note.priority || 'medium',
            blockerNotes: note.blockerNotes || '',
            elapsedMs: typeof note.elapsedMs === 'number' ? note.elapsedMs : (note.elapsedMs ? Number(note.elapsedMs) : undefined),
            pausedAt: note.pausedAt || undefined,
            timer: typeof note.timer === 'number' ? note.timer : (note.timer ? Number(note.timer) : (typeof note.timmer === 'number' ? note.timmer : (note.timmer ? Number(note.timmer) : undefined))),
            createdAt: (typeof note.createdAt === 'string' ? note.createdAt : new Date(Number(note.createdAt) / 1000000).toISOString()),
            updatedAt: (typeof note.updatedAt === 'string' ? note.updatedAt : new Date(Number(note.updatedAt) / 1000000).toISOString())
        };
        return handleResponse(await fetch(`${API_BASE}/scrum`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        }));
    },
    updateScrumNote: async (note) => {
        const payload = {
            id: note.id,
            userId: (typeof note.userId === 'string' ? note.userId : (note.userId?.toText ? note.userId.toText() : String(note.userId))),
            taskDetails: note.taskDetails,
            status: note.status,
            priority: note.priority || 'medium',
            blockerNotes: note.blockerNotes || '',
            elapsedMs: typeof note.elapsedMs === 'number' ? note.elapsedMs : (note.elapsedMs ? Number(note.elapsedMs) : undefined),
            pausedAt: note.pausedAt || undefined,
            timer: typeof note.timer === 'number' ? note.timer : (note.timer ? Number(note.timer) : (typeof note.timmer === 'number' ? note.timmer : (note.timmer ? Number(note.timmer) : undefined))),
            createdAt: (typeof note.createdAt === 'string' ? note.createdAt : new Date(Number(note.createdAt) / 1000000).toISOString()),
            updatedAt: (typeof note.updatedAt === 'string' ? note.updatedAt : new Date(Number(note.updatedAt) / 1000000).toISOString())
        };
        return handleResponse(await fetch(`${API_BASE}/scrum/${note.id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload)
        }));
    },
    getTaskUpdatesForTask: async () => [],
    getAllTaskUpdates: async () => [],
    addTaskUpdate: async () => {},
    getAllHolidays: async () => {
        return handleResponse(await fetch(`${API_BASE}/holidays`, { headers }));
    },
    addHoliday: async (holiday) => {
        return handleResponse(await fetch(`${API_BASE}/holidays`, {
            method: 'POST',
            headers,
            body: JSON.stringify(holiday)
        }));
    },
    updateHoliday: async (holiday) => {
        return handleResponse(await fetch(`${API_BASE}/holidays/${holiday.id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(holiday)
        }));
    },
    deleteHoliday: async (id) => {
        return handleResponse(await fetch(`${API_BASE}/holidays/${id}`, {
            method: 'DELETE',
            headers
        }));
    },
    // Leaves
    getAllLeaveRequests: async () => {
        return handleResponse(await fetch(`${API_BASE}/leaves`, { headers }));
    },
    getUserLeaveRequests: async (userId) => {
        const idStr = typeof userId === 'string' ? userId : (userId?.toText ? userId.toText() : String(userId));
        return handleResponse(await fetch(`${API_BASE}/leaves/user/${idStr}`, { headers }));
    },
    applyLeave: async (leave) => {
        const uid =
            (typeof leave.userId === 'string' && leave.userId)
                ? leave.userId
                : (leave.userId?.toText ? leave.userId.toText() : (
                    (typeof leave.displayId === 'string' && leave.displayId)
                        ? leave.displayId
                        : (leave.displayId?.toText ? leave.displayId.toText() : '')
                ));
        if (!uid) throw new Error('userId is required for leave requests');
        const payload = {
            ...leave,
            userId: uid
        };
        return handleResponse(await fetch(`${API_BASE}/leaves`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        }));
    },
    updateLeaveRequest: async (id, status) => {
        return handleResponse(await fetch(`${API_BASE}/leaves/${id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ status })
        }));
    },
    getAllPayments: async () => [],
    getUserPayments: async () => [],
    recordPayment: async () => {},
    updatePayment: async () => {},
    deletePayment: async () => {},

    isCallerAdmin: async () => {
       // Fetch user profile and check role
       const users = await handleResponse(await fetch(`${API_BASE}/users`, { headers }));
       const user = users.find((u) => u.id === principalId);
       return user?.role === 'admin';
    },

    // ─── Direct Messages (Private Chat) ─────────────────────────
    getOrCreateConversation: async (recipientId) => {
        return handleResponse(await fetch(`${API_BASE}/dm/conversations`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ recipientId })
        }));
    },
    getMyConversations: async () => {
        return fetchJson(`${API_BASE}/dm/conversations`, []);
    },
    getConversationMessages: async (conversationId, { limit, before } = {}) => {
        const params = new URLSearchParams();
        if (limit) params.set('limit', limit);
        if (before) params.set('before', before);
        const qs = params.toString();
        return fetchJson(`${API_BASE}/dm/conversations/${conversationId}/messages${qs ? '?' + qs : ''}`, []);
    },
    sendDirectMessage: async (conversationId, message) => {
        return handleResponse(await fetch(`${API_BASE}/dm/conversations/${conversationId}/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify(message)
        }));
    },
    markConversationRead: async (conversationId) => {
        return handleResponse(await fetch(`${API_BASE}/dm/conversations/${conversationId}/read`, {
            method: 'PUT',
            headers
        }));
    },
    storePublicKey: async (conversationId, publicKey) => {
        return handleResponse(await fetch(`${API_BASE}/dm/conversations/${conversationId}/keys`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ publicKey: JSON.stringify(publicKey) })
        }));
    },
    editDirectMessage: async (messageId, payload) => {
        return handleResponse(await fetch(`${API_BASE}/dm/messages/${messageId}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(payload)
        }));
    },
    deleteDirectMessage: async (messageId) => {
        return handleResponse(await fetch(`${API_BASE}/dm/messages/${messageId}`, {
            method: 'DELETE',
            headers
        }));
    },

    // ─── Notifications ──────────────────────────────────────────
    getUserNotifications: async (userId) => {
        const idStr = typeof userId === 'string' ? userId : (userId?.toText ? userId.toText() : String(userId));
        return fetchJson(`${API_BASE}/notifications/user/${idStr}`, []);
    },
    markNotificationRead: async (id) => {
        return handleResponse(await fetch(`${API_BASE}/notifications/${id}/read`, {
            method: 'PUT',
            headers
        }));
    },
    markAllNotificationsRead: async (userId) => {
        const idStr = typeof userId === 'string' ? userId : (userId?.toText ? userId.toText() : String(userId));
        return handleResponse(await fetch(`${API_BASE}/notifications/user/${idStr}/read-all`, {
            method: 'PUT',
            headers
        }));
    },
    updateNotificationAction: async (id, actionStatus) => {
        return handleResponse(await fetch(`${API_BASE}/notifications/${id}/action`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ actionStatus })
        }));
    },
    deleteNotification: async (id) => {
        return handleResponse(await fetch(`${API_BASE}/notifications/${id}`, {
            method: 'DELETE',
            headers
        }));
    }
  };
};


export const useActor = () => {
  const { identity, isAuthenticated } = useCustomAuth();

  const actor = useMemo(() => {
    if (isAuthenticated && identity) {
      try {
        return createHttpActor(identity);
      } catch (e) {
        console.error('Error creating actor', e);
        return null;
      }
    }
    return null;
  }, [identity, isAuthenticated]);

  return { actor, isFetching: false };
};
