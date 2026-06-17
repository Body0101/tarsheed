import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import { Layout } from "../components/layout/Layout";
import { PermissionsService } from "../services/permissionsService";
import { supabase } from "../services/supabase";

export const PermissionsPage = () => {
    const navigate = useNavigate();
    const { user, hasRole } = useAuthContext();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('matrix');
    const [matrix, setMatrix] = useState({ users: [], devices: [], permissions: [] });
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [bulkMode, setBulkMode] = useState(false);
    const [selectedItems, setSelectedItems] = useState({ users: [], devices: [] });

    // Check admin permissions
    useEffect(() => {
        if (!hasRole("admin")) {
            navigate('/dashboard');
        }
    }, [hasRole, navigate]);

    // Load permission matrix
    useEffect(() => {
        loadPermissionMatrix();
    }, []);

    const loadPermissionMatrix = async () => {
        try {
            setLoading(true);
            const data = await PermissionsService.getPermissionMatrix();
            setMatrix(data);
        } catch (error) {
            console.error('Error loading permission matrix:', error);
        } finally {
            setLoading(false);
        }
    };

    const getPermission = (userId, deviceId, permission) => {
        const perm = matrix.permissions.find(
            p => p.user_id === userId && p.device_id === deviceId
        );
        return perm?.[permission] || false;
    };

    const handlePermissionToggle = async (userId, deviceId, permission) => {
        try {
            const currentPermission = getPermission(userId, deviceId, permission);
            const newPermissions = {
                can_view: permission === 'can_view' ? !currentPermission : getPermission(userId, deviceId, 'can_view'),
                can_control: permission === 'can_control' ? !currentPermission : getPermission(userId, deviceId, 'can_control'),
                can_manage_timers: permission === 'can_manage_timers' ? !currentPermission : getPermission(userId, deviceId, 'can_manage_timers'),
                can_manage_device: permission === 'can_manage_device' ? !currentPermission : getPermission(userId, deviceId, 'can_manage_device')
            };

            await PermissionsService.grantPermissions(userId, deviceId, newPermissions, user.id);
            await loadPermissionMatrix(); // Refresh matrix
        } catch (error) {
            console.error('Error updating permission:', error);
        }
    };

    const handleBulkPermissionUpdate = async (action) => {
        try {
            const updates = [];
            
            for (const userId of selectedItems.users) {
                for (const deviceId of selectedItems.devices) {
                    if (action === 'grant') {
                        updates.push({
                            userId,
                            deviceId,
                            action: 'grant',
                            permissions: {
                                can_view: true,
                                can_control: true,
                                can_manage_timers: true,
                                can_manage_device: false
                            }
                        });
                    } else {
                        updates.push({
                            userId,
                            deviceId,
                            action: 'revoke',
                            permissions: {}
                        });
                    }
                }
            }

            await PermissionsService.bulkUpdatePermissions(updates, user.id);
            await loadPermissionMatrix();
            setBulkMode(false);
            setSelectedItems({ users: [], devices: [] });
        } catch (error) {
            console.error('Error in bulk update:', error);
        }
    };

    const handleUserRoleChange = async (userId, newRole) => {
        try {
            await PermissionsService.updateUserRole(userId, newRole, user.id);
            await loadPermissionMatrix();
        } catch (error) {
            console.error('Error updating user role:', error);
        }
    };

    const toggleUserSelection = (userId) => {
        if (bulkMode) {
            setSelectedItems(prev => ({
                ...prev,
                users: prev.users.includes(userId)
                    ? prev.users.filter(id => id !== userId)
                    : [...prev.users, userId]
            }));
        }
    };

    const toggleDeviceSelection = (deviceId) => {
        if (bulkMode) {
            setSelectedItems(prev => ({
                ...prev,
                devices: prev.devices.includes(deviceId)
                    ? prev.devices.filter(id => id !== deviceId)
                    : [...prev.devices, deviceId]
            }));
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
                            Permissions Management
                        </h1>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                            Manage user access and device permissions
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setBulkMode(!bulkMode)}
                            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                                bulkMode ? 'bg-red-500 text-white' : ''
                            }`}
                            style={{
                                background: bulkMode ? 'var(--off)' : 'var(--accent-soft)',
                                color: bulkMode ? 'white' : 'var(--accent)'
                            }}
                        >
                            {bulkMode ? 'Exit Bulk Mode' : 'Bulk Edit'}
                        </button>
                    </div>
                </div>

                {/* Bulk Mode Actions */}
                {bulkMode && (
                    <div className="rounded-xl p-4" style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium" style={{ color: 'var(--warn)' }}>
                                    Bulk Edit Mode Active
                                </p>
                                <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                                    Selected: {selectedItems.users.length} users, {selectedItems.devices.length} devices
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleBulkPermissionUpdate('grant')}
                                    disabled={selectedItems.users.length === 0 || selectedItems.devices.length === 0}
                                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                    style={{
                                        background: 'var(--on)',
                                        color: 'white'
                                    }}
                                >
                                    Grant Access
                                </button>
                                <button
                                    onClick={() => handleBulkPermissionUpdate('revoke')}
                                    disabled={selectedItems.users.length === 0 || selectedItems.devices.length === 0}
                                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                    style={{
                                        background: 'var(--off)',
                                        color: 'white'
                                    }}
                                >
                                    Revoke Access
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab Navigation */}
                <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
                    {['matrix', 'users', 'devices'].map((tab) => (
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

                {/* Matrix View */}
                {activeTab === 'matrix' && (
                    <div className="space-y-4">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr style={{ background: 'var(--surface-2)' }}>
                                        <th className="text-left p-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
                                            User
                                        </th>
                                        {matrix.devices.map(device => (
                                            <th key={device.id} className="text-center p-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
                                                <div>
                                                    <div>{device.name}</div>
                                                    <div className="text-xs" style={{ color: 'var(--text-2)' }}>
                                                        {device.location}
                                                    </div>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {matrix.users.map(user => (
                                        <tr key={user.id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                                            <td className="p-3">
                                                <div className="flex items-center">
                                                    {bulkMode && (
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedItems.users.includes(user.id)}
                                                            onChange={() => toggleUserSelection(user.id)}
                                                            className="mr-3"
                                                        />
                                                    )}
                                                    <div>
                                                        <div className="font-medium" style={{ color: 'var(--text)' }}>
                                                            {user.display_name}
                                                        </div>
                                                        <div className="text-xs" style={{ color: 'var(--text-2)' }}>
                                                            {user.email}
                                                        </div>
                                                        <select
                                                            value={user.role}
                                                            onChange={(e) => handleUserRoleChange(user.id, e.target.value)}
                                                            className="text-xs mt-1 px-2 py-1 rounded border"
                                                            style={{
                                                                background: 'var(--surface)',
                                                                borderColor: 'var(--border)',
                                                                color: 'var(--text)'
                                                            }}
                                                        >
                                                            <option value="guest">Guest</option>
                                                            <option value="user">User</option>
                                                            <option value="moderator">Moderator</option>
                                                            <option value="admin">Admin</option>
                                                            <option value="super_admin">Super Admin</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </td>
                                            {matrix.devices.map(device => (
                                                <td key={device.id} className="p-3">
                                                    <div className="flex justify-center gap-1">
                                                        {['can_view', 'can_control', 'can_manage_timers'].map(permission => (
                                                            <button
                                                                key={permission}
                                                                onClick={() => handlePermissionToggle(user.id, device.id, permission)}
                                                                disabled={bulkMode}
                                                                className="w-8 h-8 rounded text-xs font-medium transition-colors disabled:opacity-50"
                                                                style={{
                                                                    background: getPermission(user.id, device.id, permission)
                                                                        ? 'var(--on)'
                                                                        : 'var(--off-soft)',
                                                                    color: getPermission(user.id, device.id, permission)
                                                                        ? 'white'
                                                                        : 'var(--text-2)'
                                                                }}
                                                                title={permission.replace('_', ' ')}
                                                            >
                                                                {permission.charAt(4).toUpperCase()}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Users View */}
                {activeTab === 'users' && (
                    <div className="space-y-4">
                        {matrix.users.map(user => (
                            <div key={user.id} className="rounded-xl p-5" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center">
                                        {bulkMode && (
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.users.includes(user.id)}
                                                onChange={() => toggleUserSelection(user.id)}
                                                className="mr-4"
                                            />
                                        )}
                                        <div>
                                            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>
                                                {user.display_name}
                                            </h3>
                                            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                                                {user.email}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span
                                            className="px-3 py-1 rounded-full text-sm font-medium"
                                            style={{
                                                background: user.role === 'admin' || user.role === 'super_admin' 
                                                    ? 'var(--warn-soft)' 
                                                    : 'var(--accent-soft)',
                                                color: user.role === 'admin' || user.role === 'super_admin'
                                                    ? 'var(--warn)'
                                                    : 'var(--accent)'
                                            }}
                                        >
                                            {user.role.replace('_', ' ').toUpperCase()}
                                        </span>
                                        <select
                                            value={user.role}
                                            onChange={(e) => handleUserRoleChange(user.id, e.target.value)}
                                            className="px-3 py-2 rounded-lg border text-sm"
                                            style={{
                                                background: 'var(--surface-2)',
                                                borderColor: 'var(--border)',
                                                color: 'var(--text)'
                                            }}
                                        >
                                            <option value="guest">Guest</option>
                                            <option value="user">User</option>
                                            <option value="moderator">Moderator</option>
                                            <option value="admin">Admin</option>
                                            <option value="super_admin">Super Admin</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {matrix.devices.map(device => {
                                        const permissions = {
                                            view: getPermission(user.id, device.id, 'can_view'),
                                            control: getPermission(user.id, device.id, 'can_control'),
                                            timers: getPermission(user.id, device.id, 'can_manage_timers')
                                        };
                                        return (
                                            <div key={device.id} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                                                <div>
                                                    <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>
                                                        {device.name}
                                                    </p>
                                                    <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                                                        {device.location}
                                                    </p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handlePermissionToggle(user.id, device.id, 'can_view')}
                                                        disabled={bulkMode}
                                                        className={`w-6 h-6 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                                                            permissions.view ? 'bg-green-500 text-white' : 'bg-gray-200'
                                                        }`}
                                                        title="View"
                                                    >
                                                        V
                                                    </button>
                                                    <button
                                                        onClick={() => handlePermissionToggle(user.id, device.id, 'can_control')}
                                                        disabled={bulkMode}
                                                        className={`w-6 h-6 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                                                            permissions.control ? 'bg-blue-500 text-white' : 'bg-gray-200'
                                                        }`}
                                                        title="Control"
                                                    >
                                                        C
                                                    </button>
                                                    <button
                                                        onClick={() => handlePermissionToggle(user.id, device.id, 'can_manage_timers')}
                                                        disabled={bulkMode}
                                                        className={`w-6 h-6 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                                                            permissions.timers ? 'bg-purple-500 text-white' : 'bg-gray-200'
                                                        }`}
                                                        title="Timers"
                                                    >
                                                        T
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Devices View */}
                {activeTab === 'devices' && (
                    <div className="space-y-4">
                        {matrix.devices.map(device => (
                            <div key={device.id} className="rounded-xl p-5" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center">
                                        {bulkMode && (
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.devices.includes(device.id)}
                                                onChange={() => toggleDeviceSelection(device.id)}
                                                className="mr-4"
                                            />
                                        )}
                                        <div>
                                            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>
                                                {device.name}
                                            </h3>
                                            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                                                {device.location} • {device.type}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {matrix.users.map(user => {
                                        const permissions = {
                                            view: getPermission(user.id, device.id, 'can_view'),
                                            control: getPermission(user.id, device.id, 'can_control'),
                                            timers: getPermission(user.id, device.id, 'can_manage_timers')
                                        };
                                        return (
                                            <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                                                <div>
                                                    <p className="font-medium text-sm" style={{ color: 'var(--text)' }}>
                                                        {user.display_name}
                                                    </p>
                                                    <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                                                        {user.email}
                                                    </p>
                                                </div>
                                                <div className="flex gap-1">
                                                    <button
                                                        onClick={() => handlePermissionToggle(user.id, device.id, 'can_view')}
                                                        disabled={bulkMode}
                                                        className={`w-6 h-6 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                                                            permissions.view ? 'bg-green-500 text-white' : 'bg-gray-200'
                                                        }`}
                                                        title="View"
                                                    >
                                                        V
                                                    </button>
                                                    <button
                                                        onClick={() => handlePermissionToggle(user.id, device.id, 'can_control')}
                                                        disabled={bulkMode}
                                                        className={`w-6 h-6 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                                                            permissions.control ? 'bg-blue-500 text-white' : 'bg-gray-200'
                                                        }`}
                                                        title="Control"
                                                    >
                                                        C
                                                    </button>
                                                    <button
                                                        onClick={() => handlePermissionToggle(user.id, device.id, 'can_manage_timers')}
                                                        disabled={bulkMode}
                                                        className={`w-6 h-6 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                                                            permissions.timers ? 'bg-purple-500 text-white' : 'bg-gray-200'
                                                        }`}
                                                        title="Timers"
                                                    >
                                                        T
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Legend */}
                <div className="rounded-xl p-4" style={{ background: 'var(--surface-2)' }}>
                    <h4 className="font-medium mb-3" style={{ color: 'var(--text)' }}>Permission Legend</h4>
                    <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-green-500 text-white flex items-center justify-center text-xs font-medium">V</div>
                            <span style={{ color: 'var(--text-2)' }}>View Access</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-blue-500 text-white flex items-center justify-center text-xs font-medium">C</div>
                            <span style={{ color: 'var(--text-2)' }}>Control Access</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded bg-purple-500 text-white flex items-center justify-center text-xs font-medium">T</div>
                            <span style={{ color: 'var(--text-2)' }}>Timer Management</span>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};
