import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import { Layout } from "../components/layout/Layout";
import { supabase } from "../services/supabase";

export const AdminDashboardPage = () => {
    const navigate = useNavigate();
    const { hasRole } = useAuthContext();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalDevices: 0,
        onlineDevices: 0,
        totalUsers: 0,
        activeUsers: 0,
        totalRelays: 0,
        activeRelays: 0,
        systemUptime: 0,
        lastSync: null
    });
    const [recentActivity, setRecentActivity] = useState([]);
    const [devices, setDevices] = useState([]);
    const [users, setUsers] = useState([]);
    const [activeTab, setActiveTab] = useState('overview');

    // Check admin permissions
    useEffect(() => {
        if (!hasRole("admin")) {
            navigate('/dashboard');
        }
    }, [hasRole, navigate]);

    // Fetch dashboard data
    useEffect(() => {
        fetchDashboardData();
        fetchRecentActivity();
        
        // Set up real-time subscriptions
        const deviceSubscription = supabase
            .channel('admin-dashboard-devices')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'devices' },
                () => fetchDashboardData()
            )
            .subscribe();

        const userSubscription = supabase
            .channel('admin-dashboard-users')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'user_profiles' },
                () => fetchDashboardData()
            )
            .subscribe();

        return () => {
            deviceSubscription.unsubscribe();
            userSubscription.unsubscribe();
        };
    }, []);

    const fetchDashboardData = async () => {
        try {
            // Fetch devices
            const { data: devicesData, error: devicesError } = await supabase
                .from('devices')
                .select('*');
            
            if (devicesError) throw devicesError;

            // Fetch users
            const { data: usersData, error: usersError } = await supabase
                .from('user_profiles')
                .select('*');
            
            if (usersError) throw usersError;

            // Calculate stats
            const onlineDevices = devicesData?.filter(d => d.status === 'online').length || 0;
            const activeUsers = usersData?.filter(u => u.is_active).length || 0;
            const totalRelays = devicesData?.reduce((sum, d) => sum + (d.relay_count || 0), 0) || 0;

            setStats({
                totalDevices: devicesData?.length || 0,
                onlineDevices,
                totalUsers: usersData?.length || 0,
                activeUsers,
                totalRelays,
                activeRelays: 0, // Would need to calculate from relay states
                systemUptime: 0, // Would need to get from system
                lastSync: new Date().toISOString()
            });

            setDevices(devicesData || []);
            setUsers(usersData || []);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchRecentActivity = async () => {
        try {
            const { data, error } = await supabase
                .from('device_history')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            setRecentActivity(data || []);
        } catch (error) {
            console.error('Error fetching activity:', error);
        }
    };

    const handleDeviceControl = async (deviceId, action, value) => {
        try {
            // This would call the ESP control API
            console.log(`Control device ${deviceId}: ${action} = ${value}`);
            // TODO: Implement actual device control
        } catch (error) {
            console.error('Error controlling device:', error);
        }
    };

    const handleUserManagement = (action, userId) => {
        // TODO: Implement user management
        console.log(`User management: ${action} ${userId}`);
    };

    const handleForceSync = async () => {
        try {
            // TODO: Implement force sync
            console.log('Force sync initiated');
        } catch (error) {
            console.error('Error forcing sync:', error);
        }
    };

    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center min-h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--accent)' }}></div>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
                            Admin Dashboard
                        </h1>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                            System overview and management
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleForceSync}
                            className="px-4 py-2 rounded-lg font-medium transition-colors"
                            style={{
                                background: 'var(--accent)',
                                color: 'white'
                            }}
                        >
                            Force Sync
                        </button>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
                    {['overview', 'devices', 'users', 'logs'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className="px-4 py-2 font-medium transition-colors border-b-2 -mb-px capitalize"
                            style={{
                                color: activeTab === tab ? 'var(--accent)' : 'var(--text-2)',
                                borderColor: activeTab === tab ? 'var(--accent)' : 'transparent'
                            }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Overview Tab */}
                {activeTab === 'overview' && (
                    <div className="space-y-6">
                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="rounded-xl p-5" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>Total Devices</p>
                                        <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>
                                            {stats.totalDevices}
                                        </p>
                                    </div>
                                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
                                        <svg className="w-6 h-6" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl p-5" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>Online Devices</p>
                                        <p className="text-2xl font-bold mt-1" style={{ color: 'var(--on)' }}>
                                            {stats.onlineDevices}
                                        </p>
                                    </div>
                                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'var(--on-soft)' }}>
                                        <svg className="w-6 h-6" style={{ color: 'var(--on)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl p-5" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>Total Users</p>
                                        <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>
                                            {stats.totalUsers}
                                        </p>
                                    </div>
                                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'var(--warn-soft)' }}>
                                        <svg className="w-6 h-6" style={{ color: 'var(--warn)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl p-5" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>Total Relays</p>
                                        <p className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>
                                            {stats.totalRelays}
                                        </p>
                                    </div>
                                    <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
                                        <svg className="w-6 h-6" style={{ color: 'var(--text-2)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Recent Activity */}
                        <div className="rounded-xl p-5" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
                                Recent Activity
                            </h2>
                            <div className="space-y-3">
                                {recentActivity.length > 0 ? (
                                    recentActivity.map((activity) => (
                                        <div key={activity.id} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                                            <div className="flex items-center">
                                                <div className="w-2 h-2 rounded-full mr-3" style={{ 
                                                    backgroundColor: activity.action === 'turn_on' ? 'var(--on)' : 
                                                                       activity.action === 'turn_off' ? 'var(--off)' : 'var(--warn)' 
                                                }}></div>
                                                <div>
                                                    <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                                                        {activity.action.replace('_', ' ').toUpperCase()}
                                                    </p>
                                                    <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                                                        Device ID: {activity.device_id?.substring(0, 8)}...
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                                                {new Date(activity.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-center py-4" style={{ color: 'var(--text-2)' }}>
                                        No recent activity
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Devices Tab */}
                {activeTab === 'devices' && (
                    <div className="rounded-xl" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                                Device Management
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr style={{ background: 'var(--surface-2)' }}>
                                        <th className="text-left p-4 text-sm font-medium" style={{ color: 'var(--text)' }}>Device</th>
                                        <th className="text-left p-4 text-sm font-medium" style={{ color: 'var(--text)' }}>Status</th>
                                        <th className="text-left p-4 text-sm font-medium" style={{ color: 'var(--text)' }}>IP Address</th>
                                        <th className="text-left p-4 text-sm font-medium" style={{ color: 'var(--text)' }}>Relays</th>
                                        <th className="text-left p-4 text-sm font-medium" style={{ color: 'var(--text)' }}>Last Seen</th>
                                        <th className="text-left p-4 text-sm font-medium" style={{ color: 'var(--text)' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {devices.map((device) => (
                                        <tr key={device.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                                            <td className="p-4">
                                                <div>
                                                    <p className="font-medium" style={{ color: 'var(--text)' }}>
                                                        {device.name || 'Unknown'}
                                                    </p>
                                                    <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                                                        {device.type || 'ESP32'}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span
                                                    className="px-2 py-1 rounded-full text-xs font-medium"
                                                    style={{
                                                        background: device.status === 'online' ? 'var(--on-soft)' : 'var(--off-soft)',
                                                        color: device.status === 'online' ? 'var(--on)' : 'var(--off)'
                                                    }}
                                                >
                                                    {device.status || 'Unknown'}
                                                </span>
                                            </td>
                                            <td className="p-4" style={{ color: 'var(--text-2)' }}>
                                                {device.ip_address || 'N/A'}
                                            </td>
                                            <td className="p-4" style={{ color: 'var(--text-2)' }}>
                                                {device.relay_count || 0}
                                            </td>
                                            <td className="p-4" style={{ color: 'var(--text-2)' }}>
                                                {device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never'}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleDeviceControl(device.id, 'restart')}
                                                        className="px-3 py-1 rounded text-xs font-medium transition-colors"
                                                        style={{
                                                            background: 'var(--warn-soft)',
                                                            color: 'var(--warn)'
                                                        }}
                                                    >
                                                        Restart
                                                    </button>
                                                    <button
                                                        onClick={() => navigate(`/devices/${device.id}`)}
                                                        className="px-3 py-1 rounded text-xs font-medium transition-colors"
                                                        style={{
                                                            background: 'var(--accent-soft)',
                                                            color: 'var(--accent)'
                                                        }}
                                                    >
                                                        Details
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Users Tab */}
                {activeTab === 'users' && (
                    <div className="rounded-xl" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                                    User Management
                                </h2>
                                <button
                                    onClick={() => navigate('/admin/permissions')}
                                    className="px-4 py-2 rounded-lg font-medium transition-colors"
                                    style={{
                                        background: 'var(--accent-soft)',
                                        color: 'var(--accent)'
                                    }}
                                >
                                    Manage Permissions
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr style={{ background: 'var(--surface-2)' }}>
                                        <th className="text-left p-4 text-sm font-medium" style={{ color: 'var(--text)' }}>User</th>
                                        <th className="text-left p-4 text-sm font-medium" style={{ color: 'var(--text)' }}>Email</th>
                                        <th className="text-left p-4 text-sm font-medium" style={{ color: 'var(--text)' }}>Role</th>
                                        <th className="text-left p-4 text-sm font-medium" style={{ color: 'var(--text)' }}>Status</th>
                                        <th className="text-left p-4 text-sm font-medium" style={{ color: 'var(--text)' }}>Last Login</th>
                                        <th className="text-left p-4 text-sm font-medium" style={{ color: 'var(--text)' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => (
                                        <tr key={user.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                                            <td className="p-4">
                                                <div className="flex items-center">
                                                    <div className="w-8 h-8 rounded-full mr-3 flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
                                                        <span className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                                                            {user.display_name?.charAt(0).toUpperCase()}
                                                        </span>
                                                    </div>
                                                    <p className="font-medium" style={{ color: 'var(--text)' }}>
                                                        {user.display_name || 'Unknown'}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="p-4" style={{ color: 'var(--text-2)' }}>
                                                {user.email}
                                            </td>
                                            <td className="p-4">
                                                <span
                                                    className="px-2 py-1 rounded-full text-xs font-medium"
                                                    style={{
                                                        background: user.role === 'admin' ? 'var(--warn-soft)' : 'var(--accent-soft)',
                                                        color: user.role === 'admin' ? 'var(--warn)' : 'var(--accent)'
                                                    }}
                                                >
                                                    {user.role || 'user'}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <span
                                                    className="px-2 py-1 rounded-full text-xs font-medium"
                                                    style={{
                                                        background: user.is_active ? 'var(--on-soft)' : 'var(--off-soft)',
                                                        color: user.is_active ? 'var(--on)' : 'var(--off)'
                                                    }}
                                                >
                                                    {user.is_active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="p-4" style={{ color: 'var(--text-2)' }}>
                                                {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                                            </td>
                                            <td className="p-4">
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleUserManagement('edit', user.id)}
                                                        className="px-3 py-1 rounded text-xs font-medium transition-colors"
                                                        style={{
                                                            background: 'var(--accent-soft)',
                                                            color: 'var(--accent)'
                                                        }}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleUserManagement('toggle', user.id)}
                                                        className="px-3 py-1 rounded text-xs font-medium transition-colors"
                                                        style={{
                                                            background: user.is_active ? 'var(--off-soft)' : 'var(--on-soft)',
                                                            color: user.is_active ? 'var(--off)' : 'var(--on)'
                                                        }}
                                                    >
                                                        {user.is_active ? 'Disable' : 'Enable'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Logs Tab */}
                {activeTab === 'logs' && (
                    <div className="rounded-xl p-5" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>
                            System Logs
                        </h2>
                        <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-green-400 h-96 overflow-y-auto">
                            <div>[{new Date().toISOString()}] System initialized</div>
                            <div>[{new Date().toISOString()}] Database connected</div>
                            <div>[{new Date().toISOString()}] Real-time subscriptions active</div>
                            <div>[{new Date().toISOString()}] {stats.onlineDevices} devices online</div>
                            <div>[{new Date().toISOString()}] {stats.activeUsers} active users</div>
                            <div className="text-yellow-400">[{new Date().toISOString()}] System monitoring active</div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
};
