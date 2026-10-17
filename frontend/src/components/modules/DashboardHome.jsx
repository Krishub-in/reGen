import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGetAllUsers, useGetUserAttendance, useGetUserLeaveRequests, useGetUserPayments, useGetAllAttendance, useGetAllTasks } from '../../hooks/useQueries';
import { useCustomAuth } from '../../hooks/useCustomAuth';
import { Users, Clock, Calendar, DollarSign, Building2, UserCheck, Briefcase, FileText, Settings, UserPlus, ListTodo } from 'lucide-react';
import { useIsMobile } from '../../hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { cn, hasUserRole, getUserRoleKey } from '@/lib/utils';
import { isTaskExpired } from '@/lib/taskUtils';

export default function DashboardHome({ userProfile, onNavigate }) {
  const { identity } = useCustomAuth();
  const currentUserId = userProfile?.userId || userProfile?.id || userProfile?.StaffId || identity?.getPrincipal() || null;
  const { data: users = [] } = useGetAllUsers();
  const { data: attendance = [] } = useGetUserAttendance(currentUserId);
  const { data: leaves = [] } = useGetUserLeaveRequests(currentUserId);
  const { data: payments = [] } = useGetUserPayments(currentUserId);
  const { data: allAttendance = [] } = useGetAllAttendance();
  const { data: allTasks = [] } = useGetAllTasks();
  
  const isMobile = useIsMobile();

  const isAdmin = hasUserRole(userProfile, 'admin');
  const isOwner = hasUserRole(userProfile, 'owner') || hasUserRole(userProfile, 'param');
  const isStaff = hasUserRole(userProfile, 'staff') || hasUserRole(userProfile, 'intern') || hasUserRole(userProfile, 'freelancer');

  // Computed Stats
  const totalOwners = users.filter(u => hasUserRole(u, 'owner')).length;
  const totalAdmins = users.filter(u => hasUserRole(u, 'admin')).length;
  const totalStaffOnly = users.filter(u => hasUserRole(u, 'staff')).length;
  const totalInterns = users.filter(u => hasUserRole(u, 'intern')).length;
  const totalFreelancers = users.filter(u => hasUserRole(u, 'freelancer')).length;
  const totalStaff = users.filter(u => hasUserRole(u, 'staff') || hasUserRole(u, 'intern') || hasUserRole(u, 'freelancer')).length;
  const totalDepartments = new Set(users.map(u => u.department).filter(Boolean)).size;
  
  const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const todayAttendance = allAttendance.filter(a => a.date === todayDate);
  const activeUsersToday = new Set(todayAttendance.map(a => a.userId?.toText ? a.userId.toText() : String(a.userId || ''))).size;

  // Owner specific stats — only employees added by owner (exclude owner themself and superadmin)
  const myCompanyEmployees = users.filter(u => {
    const rk = getUserRoleKey(u);
    return rk !== 'owner' && rk !== 'param';
  });
  // Owners see ALL company employees added by them; staff-level users see only their department
  const myDepartmentStaff = (isOwner || isAdmin)
    ? myCompanyEmployees
    : (userProfile.department 
        ? myCompanyEmployees.filter(u => u.department === userProfile.department)
        : myCompanyEmployees);
    
  const activeMyStaffToday = new Set(
    todayAttendance.filter(a => {
      const user = users.find(u => {
        const uid = u.id?.toText ? u.id.toText() : String(u.id || u.userId || '');
        const aid = a.userId?.toText ? a.userId.toText() : String(a.userId || '');
        return uid === aid;
      });
      if (!user) return false;
      const rk = getUserRoleKey(user);
      if (rk === 'param' || rk === 'owner') return false;
      return (isOwner || isAdmin) ? true : (userProfile.department ? user.department === userProfile.department : true);
    }).map(a => (a.userId?.toText ? a.userId.toText() : String(a.userId || '')))
  ).size;

  // Tick every second to ensure interval expiration updates immediately
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Staff specific stats
  const toIdText = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val.toText) return val.toText();
    return String(val);
  };

  const myIdentifiers = useMemo(() => {
    const list = [
      toIdText(userProfile?.userId),
      toIdText(userProfile?.id),
      toIdText(userProfile?.StaffId),
      toIdText(userProfile?.username),
      toIdText(userProfile?.name),
      identity?.getPrincipal()?.toText?.(),
    ].filter(Boolean);
    return new Set(list);
  }, [userProfile, identity]);

  const myPendingTasksList = useMemo(() => {
    return allTasks.filter(t => {
      const a1 = toIdText(t.assignedTo);
      const a2 = toIdText(t.assignee);
      const isAssigned = (a1 && myIdentifiers.has(a1)) || (a2 && myIdentifiers.has(a2));
      if (!isAssigned) return false;

      const statusKey = typeof t.status === 'string'
        ? t.status
        : Object.keys(t.status || {})[0] || 'todo';

      // If completed or done -> not pending
      if (statusKey === 'done' || statusKey === 'completed') return false;

      // If marked not_completed -> not pending
      if (statusKey === 'not_completed' || statusKey === 'notCompleted') return false;

      // If interval/deadline has elapsed -> not pending
      if (isTaskExpired(t)) return false;

      return true;
    });
  }, [allTasks, myIdentifiers, now]);

  const myPendingTasks = myPendingTasksList.length;

  const stats = [
    // Admin Cards
    {
      title: 'Total Owners',
      value: totalOwners,
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
      show: isAdmin,
    },
    {
      title: 'Total Staff',
      value: totalStaff,
      icon: Users,
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'bg-indigo-50 dark:bg-indigo-950',
      show: isAdmin,
    },
    {
      title: 'Admins',
      value: totalAdmins,
      icon: Settings,
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-950',
      show: isAdmin,
    },
    {
      title: 'Staff',
      value: totalStaffOnly,
      icon: Briefcase,
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'bg-cyan-50 dark:bg-cyan-950',
      show: isAdmin,
    },
    {
      title: 'Interns',
      value: totalInterns,
      icon: UserPlus,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-50 dark:bg-amber-950',
      show: isAdmin,
    },
    {
      title: 'Freelancers',
      value: totalFreelancers,
      icon: FileText,
      color: 'text-teal-600 dark:text-teal-400',
      bgColor: 'bg-teal-50 dark:bg-teal-950',
      show: isAdmin,
    },
    {
      title: 'Total Departments',
      value: totalDepartments,
      icon: Building2,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-950',
      show: isAdmin,
    },
    {
      title: 'Active Users',
      value: activeUsersToday,
      icon: UserCheck,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950',
      show: isAdmin,
    },

    // Owner Cards
    {
      title: 'Total Employees',
      value: myDepartmentStaff.length,
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
      show: isOwner,
    },
    {
      title: 'Departments',
      value: userProfile.department || '1', // "Departments Under Owner" - assuming 1 if assigned, or total if managing multiple
      icon: Building2,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-950',
      show: isOwner,
    },
    {
      title: 'Active Staff Today',
      value: activeMyStaffToday,
      icon: UserCheck,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950',
      show: isOwner,
    },

    // Staff Cards
    {
      title: 'My Department',
      value: userProfile.department || 'N/A',
      icon: Building2,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-50 dark:bg-blue-950',
      show: isStaff,
    },
    {
      title: 'My Pending Tasks',
      value: myPendingTasks,
      icon: ListTodo,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      show: isStaff || myPendingTasks > 0,
    },
    {
      title: 'My Attendance',
      value: attendance.length,
      icon: Clock,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-50 dark:bg-green-950',
      show: isStaff,
    },
    {
      title: 'Leave Requests',
      value: leaves.length,
      icon: Calendar,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-50 dark:bg-purple-950',
      show: isStaff,
    },
  ];

  // Mobile View
  if (isMobile) {
    return (
      <div className="space-y-5 pb-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight">Hello, {userProfile.name.split(' ')[0]}</h2>
              <p className="text-xs text-muted-foreground leading-snug break-words">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <div className="h-9 w-9 flex-shrink-0 rounded-full bg-muted overflow-hidden border border-border shadow-sm">
              <img src={userProfile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile.name}`} alt="Profile" className="h-full w-full object-cover" />
            </div>
          </div>
        </div>

        {/* Stats Grid for Mobile */}
        <div className="grid grid-cols-2 gap-3">
          {stats.filter(stat => stat.show).map((stat) => (
            <Card key={stat.title} className="shadow-sm">
              <CardContent className="p-3 flex flex-col items-center justify-center text-center">
                <div className={`p-2 rounded-full mb-2 ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <div className="text-xl font-semibold leading-none">{stat.value}</div>
                <p className="text-[11px] text-muted-foreground leading-tight mt-1">
                  {stat.title}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions for Mobile */}
        <Card className="shadow-sm border-none bg-accent/20">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-lg">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-2 gap-3">
              {isAdmin && (
                <>
                  <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-1 shadow-sm" onClick={() => onNavigate('users')}>
                    <UserPlus className="h-5 w-5" />
                    <span className="text-xs text-wrap">Manage Users</span>
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-1 shadow-sm" onClick={() => onNavigate('company')}>
                    <Building2 className="h-5 w-5" />
                    <span className="text-xs">Departments</span>
                  </Button>
                </>
              )}
              {isOwner && (
                <>
                  <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-1 shadow-sm" onClick={() => onNavigate('users')}>
                    <UserPlus className="h-5 w-5 text-primary" />
                    <span className="text-xs font-semibold">Add Employee</span>
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-1 shadow-sm" onClick={() => onNavigate('company')}>
                    <Building2 className="h-5 w-5" />
                    <span className="text-xs">Departments</span>
                  </Button>
                </>
              )}
              {isStaff && (
                <>
                  <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-1 shadow-sm" onClick={() => onNavigate('attendance')}>
                    <Clock className="h-5 w-5" />
                    <span className="text-xs">Attendance</span>
                  </Button>
                  <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-1 shadow-sm" onClick={() => onNavigate('schedules')}>
                    <ListTodo className="h-5 w-5" />
                    <span className="text-xs">My Tasks</span>
                  </Button>
                </>
              )}
              <Button variant="outline" className="h-20 flex flex-col items-center justify-center gap-1 shadow-sm" onClick={() => onNavigate(isStaff ? 'profile' : 'company')}>
                <Settings className="h-5 w-5" />
                <span className="text-xs">{isStaff ? 'Profile' : 'Company Info'}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Welcome back, {userProfile.name}!</h2>
        <p className="text-muted-foreground">
          {userProfile.designation || 'Employee'} • {userProfile.department || 'General'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.filter(stat => stat.show).map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Activity / Quick Actions */}
          <Card>
             <CardHeader>
               <CardTitle>Quick Actions</CardTitle>
             </CardHeader>
             <CardContent>
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                 
                 {/* Admin Actions */}
                 {isAdmin && (
                   <>
                     <Button variant="outline" className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary hover:text-primary-foreground transition-all" onClick={() => onNavigate('users')}>
                       <UserPlus className="h-6 w-6" />
                       <span>Manage Users</span>
                     </Button>
                     <Button variant="outline" className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary hover:text-primary-foreground transition-all" onClick={() => onNavigate('company')}>
                        <Building2 className="h-6 w-6" />
                        <span>Departments</span>
                     </Button>
                   </>
                 )}

                 {/* Owner Actions */}
                 {isOwner && (
                    <>
                     <Button variant="outline" className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary hover:text-primary-foreground transition-all" onClick={() => onNavigate('users')}>
                       <UserPlus className="h-6 w-6 text-primary" />
                       <span className="font-semibold">Add Employee / Staff</span>
                     </Button>
                     <Button variant="outline" className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary hover:text-primary-foreground transition-all" onClick={() => onNavigate('company')}>
                       <Building2 className="h-6 w-6" />
                       <span>Departments</span>
                     </Button>
                    </>
                 )}

                 {/* Staff Actions */}
                 {isStaff && (
                    <>
                     <Button variant="outline" className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary hover:text-primary-foreground transition-all" onClick={() => onNavigate('attendance')}>
                       <Clock className="h-6 w-6" />
                       <span>Attendance</span>
                     </Button>
                     <Button variant="outline" className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary hover:text-primary-foreground transition-all" onClick={() => onNavigate('schedules')}>
                       <ListTodo className="h-6 w-6" />
                       <span>My Tasks</span>
                     </Button>
                    </>
                 )}
                 
                 <Button
                   variant="outline"
                   className="h-24 flex flex-col items-center justify-center gap-2 hover:bg-primary hover:text-primary-foreground transition-all"
                   onClick={() => onNavigate(isStaff ? 'profile' : 'company')}
                 >
                   <Settings className="h-6 w-6" />
                   <span>{isStaff ? 'Profile' : 'Company Info'}</span>
                 </Button>
               </div>
             </CardContent>
          </Card>

          {/* Notifications / Pending Tasks */}
          {(isStaff || myPendingTasks > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Updates</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {myPendingTasks > 0 ? (
                    <div className="p-4 rounded-lg bg-card/50 border border-border space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-foreground flex items-center gap-2">
                          <ListTodo className="h-4 w-4 text-primary" />
                          <span>Pending Tasks</span>
                        </h4>
                        <Badge variant="secondary" className="text-xs font-normal">
                          {myPendingTasks} task{myPendingTasks > 1 ? 's' : ''}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        You have {myPendingTasks} assigned task{myPendingTasks > 1 ? 's' : ''} waiting to be started or worked on.
                      </p>
                      <div className="space-y-1.5 pt-1 border-t border-border">
                        {myPendingTasksList.slice(0, 4).map(task => {
                          const statusKey = typeof task.status === 'string' ? task.status : Object.keys(task.status || {})[0];
                          const isNotStarted = statusKey === 'todo';
                          return (
                            <div key={task.id} className="flex items-center justify-between text-xs py-2 px-3 rounded-md bg-muted/40 border border-border">
                              <span className="font-medium text-foreground truncate max-w-[220px]" title={task.title}>
                                • {task.title}
                              </span>
                              <Badge variant="outline" className="text-[10px] font-normal border-border text-muted-foreground">
                                {isNotStarted ? 'Not Started' : 'In Progress'}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs h-8 border-border hover:bg-accent hover:text-accent-foreground"
                        onClick={() => onNavigate('schedules')}
                      >
                        View in Schedules & Tasks
                      </Button>
                    </div>
                  ) : (
                    <div className="p-4 rounded-lg bg-card border border-border">
                       <h4 className="font-semibold text-foreground mb-1">All Caught Up!</h4>
                       <p className="text-sm text-muted-foreground">
                         You have no pending tasks.
                       </p>
                    </div>
                  )}
                  
                  {/* Mock System Update */}
                  <div className="p-4 rounded-lg bg-card border border-border">
                     <h4 className="font-semibold text-foreground mb-1">System Announcement</h4>
                     <p className="text-sm text-muted-foreground">
                       Welcome to the new dashboard! Please update your profile information.
                     </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Side Column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                 <div className="h-16 w-16 rounded-full bg-muted overflow-hidden">
                   <img src={userProfile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userProfile.name}`} alt="Profile" className="h-full w-full object-cover" />
                 </div>
                 <div>
                   <h3 className="font-bold">{userProfile.name}</h3>
                   <p className="text-sm text-muted-foreground">{userProfile.designation || 'N/A'}</p>
                 </div>
              </div>
              <div className="space-y-2 pt-2 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Department</span>
                  <span className="font-medium">{userProfile.department || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Role</span>
                  <span className="font-medium capitalize">{Object.keys(userProfile.role)[0]}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Joining Date</span>
                  <span className="font-medium">{userProfile.joiningDate ? new Date(userProfile.joiningDate).toLocaleDateString() : 'N/A'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
