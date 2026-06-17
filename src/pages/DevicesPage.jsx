import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import { Layout } from "../components/layout/Layout";
import { supabase, subscribeToDeviceUpdates } from "../services/supabase";

export const DevicesPage = () => {
    const navigate = useNavigate();
    const { hasRole } = useAuthContext();
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState("all");

    // Check if user has permission to view devices
    useEffect(() => {
        if (!hasRole("user")) {
            navigate('/dashboard');
        }
    }, [hasRole, navigate]);

    // Fetch devices from Supabase
    useEffect(() => {
        fetchDevices();
        
        // Set up real-time subscription
        const subscription = subscribeToDeviceUpdates('*', (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                setDevices(prev => {
                    const existingIndex = prev.findIndex(d => d.id === payload.new.id);
                    if (existingIndex >= 0) {
                        const updated = [...prev];
                        updated[existingIndex] = payload.new;
                        return updated;
                    } else {
                        return [...prev, payload.new];
                    }
                });
            } else if (payload.eventType === 'DELETE') {
                setDevices(prev => prev.filter(d => d.id !== payload.old.id));
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const fetchDevices = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('devices')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setDevices(data || []);
        } catch (error) {
            console.error('Error fetching devices:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        if (!status) return 'var(--dot-offline)';
        return status === 'online' ? 'var(--dot-online)' : 'var(--dot-offline)';
    };

    const getStatusText = (status) => {
        if (!status) return 'Unknown';
        return status === 'online' ? 'Online' : 'Offline';
    };

    const getModeColor = (mode) => {
        return mode === 'online' ? 'var(--on)' : 'var(--warn)';
    };

    const filteredDevices = devices.filter(device => {
        const matchesSearch = device.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           device.ip_address?.includes(searchTerm) ||
                           device.location?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'all' || device.is_active === (filterStatus === 'active');
        return matchesSearch && matchesStatus;
    });

    const handleDeviceClick = (device) => {
        // Navigate to device details page (to be implemented)
        navigate(`/devices/${device.id}`);
    };

    const handleRefresh = () => {
        fetchDevices();
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
                            ESP Devices
                        </h1>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
                            Monitor and manage all connected ESP devices
                        </p>
                    </div>
                    <button
                        onClick={handleRefresh}
                        className="px-4 py-2 rounded-lg font-medium transition-colors"
                        style={{
                            background: 'var(--surface-2)',
                            color: 'var(--text)',
                            border: '1px solid var(--border)'
                        }}
                    >
                        <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refresh
                    </button>
                </div>

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                        <input
                            type="text"
                            placeholder="Search devices by name, IP, or location..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2"
                            style={{
                                background: 'var(--surface)',
                                borderColor: 'var(--border)',
                                color: 'var(--text)',
                                focusRingColor: 'var(--accent-ring)'
                            }}
                        />
                    </div>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-4 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2"
                        style={{
                            background: 'var(--surface)',
                            borderColor: 'var(--border)',
                            color: 'var(--text)',
                            focusRingColor: 'var(--accent-ring)'
                        }}
                    >
                        <option value="all">All Devices</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>

                {/* Device Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredDevices.map((device) => (
                        <div
                            key={device.id}
                            onClick={() => handleDeviceClick(device)}
                            className="rounded-xl p-5 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{
                                background: 'var(--surface)',
                                boxShadow: 'var(--shadow-md)',
                                border: '1px solid var(--border)'
                            }}
                        >
                            {/* Device Header */}
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center">
                                    <div
                                        className="w-3 h-3 rounded-full mr-2"
                                        style={{ backgroundColor: getStatusColor(device.status) }}
                                    ></div>
                                    <div>
                                        <h3 className="font-semibold" style={{ color: 'var(--text)' }}>
                                            {device.name || 'Unknown Device'}
                                        </h3>
                                        <p className="text-xs" style={{ color: 'var(--text-2)' }}>
                                            {device.type || 'ESP32'}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span
                                        className="px-2 py-1 rounded-full text-xs font-medium"
                                        style={{
                                            background: getModeColor(device.mode) + '20',
                                            color: getModeColor(device.mode)
                                        }}
                                    >
                                        {device.mode || 'Unknown'}
                                    </span>
                                </div>
                            </div>

                            {/* Device Info */}
                            <div className="space-y-2">
                                <div className="flex items-center text-sm" style={{ color: 'var(--text-2)' }}>
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                                    </svg>
                                    {device.ip_address || 'N/A'}
                                </div>
                                
                                <div className="flex items-center text-sm" style={{ color: 'var(--text-2)' }}>
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    {device.location || 'No Location'}
                                </div>

                                <div className="flex items-center text-sm" style={{ color: 'var(--text-2)' }}>
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                    </svg>
                                    {device.relay_count || 0} Relays
                                </div>

                                <div className="flex items-center text-sm" style={{ color: 'var(--text-2)' }}>
                                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Last seen: {device.last_seen ? 
                                        new Date(device.last_seen).toLocaleString() : 
                                        'Never'
                                    }
                                </div>
                            </div>

                            {/* Device Footer */}
                            <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs" style={{ color: 'var(--text-2)' }}>
                                        Firmware: {device.firmware_version || 'Unknown'}
                                    </span>
                                    <span
                                        className="px-2 py-1 rounded text-xs font-medium"
                                        style={{
                                            background: device.is_active ? 'var(--on-soft)' : 'var(--off-soft)',
                                            color: device.is_active ? 'var(--on)' : 'var(--off)'
                                        }}
                                    >
                                        {getStatusText(device.status)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Empty State */}
                {filteredDevices.length === 0 && !loading && (
                    <div className="text-center py-12">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: 'var(--surface-2)' }}>
                            <svg className="w-8 h-8" style={{ color: 'var(--muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text)' }}>
                            No devices found
                        </h3>
                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                            {searchTerm || filterStatus !== 'all' 
                                ? 'Try adjusting your search or filters'
                                : 'No ESP devices are currently connected to the system'
                            }
                        </p>
                    </div>
                )}
            </div>
        </Layout>
    );
};
