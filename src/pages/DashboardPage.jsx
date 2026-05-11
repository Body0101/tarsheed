import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import { Layout } from "../components/layout/Layout";
import { supabase } from "../services/supabase";

export const DashboardPage = () => {
    const navigate = useNavigate();
    const { user, hasRole } = useAuthContext();
    const [loading, setLoading] = useState(true);
    const [userDevices, setUserDevices] = useState([]);
    const [deviceStates, setDeviceStates] = useState({});
    const [timers, setTimers] = useState({});

    // Fetch user's authorized devices
    useEffect(() => {
        fetchUserDevices();
        
        // Set up real-time subscriptions for device states
        const subscription = supabase
            .channel('user-dashboard-devices')
            .on('postgres_changes', 
                { event: '*', schema: 'public', table: 'devices' },
                (payload) => {
                    if (payload.eventType === 'UPDATE') {
                        setDeviceStates(prev => ({
                            ...prev,
                            [payload.new.id]: payload.new.state || {}
                        }));
                    }
                }
            )
            .subscribe();

        return () => subscription.unsubscribe();
    }, [user?.id]);

    const fetchUserDevices = async () => {
        try {
            setLoading(true);
            
            // Get devices that user has permission for
            const { data: permissions, error: permissionsError } = await supabase
                .from('device_permissions')
                .select('device_id, can_control, can_view, can_manage_timers')
                .eq('user_id', user?.id)
                .eq('can_view', true);

            if (permissionsError) throw permissionsError;

            // Get device details
            const deviceIds = permissions?.map(p => p.device_id) || [];
            if (deviceIds.length === 0) {
                setUserDevices([]);
                setLoading(false);
                return;
            }

            const { data: devices, error: devicesError } = await supabase
                .from('devices')
                .select('*')
                .in('id', deviceIds)
                .eq('is_active', true);

            if (devicesError) throw devicesError;

            // Combine devices with permissions
            const devicesWithPermissions = devices?.map(device => {
                const permission = permissions?.find(p => p.device_id === device.id);
                return {
                    ...device,
                    permissions: permission || {}
                };
            }) || [];

            setUserDevices(devicesWithPermissions);

            // Initialize device states
            const initialStates = {};
            devicesWithPermissions.forEach(device => {
                initialStates[device.id] = device.state || {};
            });
            setDeviceStates(initialStates);

        } catch (error) {
            console.error('Error fetching user devices:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRelayToggle = async (deviceId, relayIndex) => {
        try {
            const device = userDevices.find(d => d.id === deviceId);
            if (!device?.permissions?.can_control) {
                console.error('No permission to control this device');
                return;
            }

            const currentState = deviceStates[deviceId] || {};
            const relayKey = `relay${relayIndex + 1}`;
            const currentRelayState = currentState[relayKey] || 'off';
            const newState = currentRelayState === 'off' ? 'on' : 'off';

            // Update local state immediately for responsive UI
            setDeviceStates(prev => ({
                ...prev,
                [deviceId]: {
                    ...prev[deviceId],
                    [relayKey]: newState
                }
            }));

            // Send control command to device (this would call your ESP API)
            console.log(`Control device ${deviceId}, relay ${relayIndex}: ${newState}`);
            // TODO: Implement actual device control via API

            // Log the action
            await supabase.from('device_history').insert({
                device_id: deviceId,
                user_id: user?.id,
                action: newState === 'on' ? 'turn_on' : 'turn_off',
                previous_state: { [relayKey]: currentRelayState },
                new_state: { [relayKey]: newState },
                source: 'manual'
            });

        } catch (error) {
            console.error('Error controlling relay:', error);
            // Revert state on error
            setDeviceStates(prev => ({
                ...prev,
                [deviceId]: {
                    ...prev[deviceId],
                    [relayKey]: currentRelayState
                }
            }));
        }
    };

    const handleSetTimer = async (deviceId, relayIndex, durationMinutes) => {
        try {
            const device = userDevices.find(d => d.id === deviceId);
            if (!device?.permissions?.can_manage_timers) {
                console.error('No permission to manage timers for this device');
                return;
            }

            // Set timer state
            const endTime = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
            setTimers(prev => ({
                ...prev,
                [`${deviceId}-${relayIndex}`]: {
                    duration: durationMinutes,
                    endTime: endTime,
                    active: true
                }
            }));

            // Send timer command to device
            console.log(`Set timer for device ${deviceId}, relay ${relayIndex}: ${durationMinutes} minutes`);
            // TODO: Implement actual timer setting via API

            // Log the action
            await supabase.from('device_history').insert({
                device_id: deviceId,
                user_id: user?.id,
                action: 'timer_set',
                new_state: { 
                    relay: relayIndex + 1, 
                    duration: durationMinutes,
                    end_time: endTime
                },
                source: 'manual'
            });

        } catch (error) {
            console.error('Error setting timer:', error);
        }
    };

    const handleCancelTimer = async (deviceId, relayIndex) => {
        try {
            const device = userDevices.find(d => d.id === deviceId);
            if (!device?.permissions?.can_manage_timers) {
                console.error('No permission to manage timers for this device');
                return;
            }

            // Clear timer state
            setTimers(prev => {
                const newTimers = { ...prev };
                delete newTimers[`${deviceId}-${relayIndex}`];
                return newTimers;
            });

            // Send cancel timer command to device
            console.log(`Cancel timer for device ${deviceId}, relay ${relayIndex}`);
            // TODO: Implement actual timer cancellation via API

            // Log the action
            await supabase.from('device_history').insert({
                device_id: deviceId,
                user_id: user?.id,
                action: 'timer_cancelled',
                new_state: { relay: relayIndex + 1 },
                source: 'manual'
            });

        } catch (error) {
            console.error('Error cancelling timer:', error);
        }
    };

    const getRemainingTime = (deviceId, relayIndex) => {
        const timer = timers[`${deviceId}-${relayIndex}`];
        if (!timer || !timer.active) return null;
        
        const now = new Date();
        const endTime = new Date(timer.endTime);
        const remaining = Math.max(0, endTime - now);
        
        if (remaining === 0) {
            // Timer expired
            setTimers(prev => {
                const newTimers = { ...prev };
                delete newTimers[`${deviceId}-${relayIndex}`];
                return newTimers;
            });
            return null;
        }
        
        return Math.floor(remaining / 1000 / 60); // Return minutes
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
                            My Dashboard
                        </h1>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                            Control your authorized devices
                        </p>
                    </div>
                    {hasRole('admin') && (
                        <button
                            onClick={() => navigate('/admin')}
                            className="px-4 py-2 rounded-lg font-medium transition-colors"
                            style={{
                                background: 'var(--accent-soft)',
                                color: 'var(--accent)'
                            }}
                        >
                            Admin Panel
                        </button>
                    )}
                </div>

                {/* Welcome Message */}
                <div className="rounded-xl p-5" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                    <div className="flex items-center">
                        <div className="w-12 h-12 rounded-full mr-4 flex items-center justify-center" style={{ background: 'var(--accent-soft)' }}>
                            <span className="text-lg font-medium" style={{ color: 'var(--accent)' }}>
                                {user?.user_metadata?.display_name?.charAt(0).toUpperCase() || 'U'}
                            </span>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                                Welcome back, {user?.user_metadata?.display_name || 'User'}!
                            </h2>
                            <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                                You have access to {userDevices.length} device{userDevices.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Device Grid */}
                {userDevices.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {userDevices.map((device) => (
                            <div key={device.id} className="rounded-xl p-5" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-md)' }}>
                                {/* Device Header */}
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="font-semibold" style={{ color: 'var(--text)' }}>
                                            {device.name || 'Unknown Device'}
                                        </h3>
                                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                                            {device.location || 'No Location'}
                                        </p>
                                    </div>
                                    <div className="flex items-center">
                                        <div
                                            className="w-2 h-2 rounded-full mr-2"
                                            style={{ backgroundColor: device.status === 'online' ? 'var(--on)' : 'var(--off)' }}
                                        ></div>
                                        <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                                            {device.status || 'Unknown'}
                                        </span>
                                    </div>
                                </div>

                                {/* Relay Controls */}
                                <div className="space-y-3">
                                    {Array.from({ length: device.relay_count || 2 }, (_, i) => {
                                        const relayKey = `relay${i + 1}`;
                                        const relayState = deviceStates[device.id]?.[relayKey] || 'off';
                                        const timer = getRemainingTime(device.id, i);
                                        const canControl = device.permissions?.can_control;
                                        const canManageTimers = device.permissions?.can_manage_timers;

                                        return (
                                            <div key={i} className="border rounded-lg p-3" style={{ borderColor: 'var(--border)' }}>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                                                        Relay {i + 1}
                                                    </span>
                                                    <button
                                                        onClick={() => canControl && handleRelayToggle(device.id, i)}
                                                        disabled={!canControl || device.status !== 'online'}
                                                        className="w-12 h-6 rounded-full transition-colors relative disabled:opacity-50"
                                                        style={{
                                                            background: relayState === 'on' ? 'var(--on)' : 'var(--off-soft)'
                                                        }}
                                                    >
                                                        <div
                                                            className="absolute top-1 w-4 h-4 bg-white rounded-full transition-transform"
                                                            style={{
                                                                transform: relayState === 'on' ? 'translateX(24px)' : 'translateX(4px)',
                                                                left: '0'
                                                            }}
                                                        ></div>
                                                    </button>
                                                </div>

                                                {timer && canManageTimers && (
                                                    <div className="text-xs p-2 rounded" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
                                                        Timer: {timer}m remaining
                                                        <button
                                                            onClick={() => handleCancelTimer(device.id, i)}
                                                            className="ml-2 underline"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                )}

                                                {!timer && canManageTimers && (
                                                    <div className="flex gap-1">
                                                        {[15, 30, 60].map(minutes => (
                                                            <button
                                                                key={minutes}
                                                                onClick={() => handleSetTimer(device.id, i, minutes)}
                                                                disabled={device.status !== 'online'}
                                                                className="flex-1 px-2 py-1 text-xs rounded transition-colors disabled:opacity-50"
                                                                style={{
                                                                    background: 'var(--surface-2)',
                                                                    color: 'var(--text-2)'
                                                                }}
                                                            >
                                                                {minutes}m
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Device Footer */}
                                <div className="mt-4 pt-4 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text-2)' }}>
                                    IP: {device.ip_address || 'N/A'} | Firmware: {device.firmware_version || 'Unknown'}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: 'var(--surface-2)' }}>
                            <svg className="w-8 h-8" style={{ color: 'var(--muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text)' }}>
                            No devices available
                        </h3>
                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                            You don't have access to any devices yet. Contact your administrator for permissions.
                        </p>
                    </div>
                )}
            </div>
        </Layout>
    );
};
