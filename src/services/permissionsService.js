import { supabase, supabaseService } from './supabase';

class PermissionsService {
    // Permission Levels
    static PERMISSIONS = {
        VIEW: 'can_view',
        CONTROL: 'can_control', 
        MANAGE_TIMERS: 'can_manage_timers',
        MANAGE_DEVICE: 'can_manage_device',
        GRANT_PERMISSIONS: 'can_grant_permissions'
    };

    // User Roles
    static ROLES = {
        GUEST: 'guest',
        USER: 'user',
        MODERATOR: 'moderator',
        ADMIN: 'admin',
        SUPER_ADMIN: 'super_admin'
    };

    // Role hierarchy - higher numbers have more permissions
    static ROLE_HIERARCHY = {
        [this.ROLES.GUEST]: 0,
        [this.ROLES.USER]: 1,
        [this.ROLES.MODERATOR]: 2,
        [this.ROLES.ADMIN]: 3,
        [this.ROLES.SUPER_ADMIN]: 4
    };

    // Default permissions for each role
    static DEFAULT_PERMISSIONS = {
        [this.ROLES.GUEST]: {
            can_view: false,
            can_control: false,
            can_manage_timers: false,
            can_manage_device: false,
            can_grant_permissions: false
        },
        [this.ROLES.USER]: {
            can_view: true,
            can_control: true,
            can_manage_timers: true,
            can_manage_device: false,
            can_grant_permissions: false
        },
        [this.ROLES.MODERATOR]: {
            can_view: true,
            can_control: true,
            can_manage_timers: true,
            can_manage_device: true,
            can_grant_permissions: false
        },
        [this.ROLES.ADMIN]: {
            can_view: true,
            can_control: true,
            can_manage_timers: true,
            can_manage_device: true,
            can_grant_permissions: true
        },
        [this.ROLES.SUPER_ADMIN]: {
            can_view: true,
            can_control: true,
            can_manage_timers: true,
            can_manage_device: true,
            can_grant_permissions: true
        }
    };

    /**
     * Check if a user has a specific role or higher
     */
    static hasRole(userRole, requiredRole) {
        const userLevel = this.ROLE_HIERARCHY[userRole] || 0;
        const requiredLevel = this.ROLE_HIERARCHY[requiredRole] || 0;
        return userLevel >= requiredLevel;
    }

    /**
     * Check if a user has a specific permission for a device
     */
    static async hasPermission(userId, deviceId, permission) {
        try {
            // Get user's role first
            const { data: userProfile } = await supabase
                .from('user_profiles')
                .select('role')
                .eq('id', userId)
                .single();

            const userRole = userProfile?.role || this.ROLES.GUEST;

            // Super admins have all permissions
            if (userRole === this.ROLES.SUPER_ADMIN) {
                return true;
            }

            // Check specific device permission
            const { data: devicePermission } = await supabase
                .from('device_permissions')
                .select(permission)
                .eq('user_id', userId)
                .eq('device_id', deviceId)
                .single();

            // If no specific permission exists, use role defaults
            if (!devicePermission) {
                const defaultPerms = this.DEFAULT_PERMISSIONS[userRole] || this.DEFAULT_PERMISSIONS[this.ROLES.GUEST];
                return defaultPerms[permission] || false;
            }

            return devicePermission[permission] || false;
        } catch (error) {
            console.error('Error checking permission:', error);
            return false;
        }
    }

    /**
     * Get all permissions for a user
     */
    static async getUserPermissions(userId) {
        try {
            const { data: userProfile } = await supabase
                .from('user_profiles')
                .select('role, is_active')
                .eq('id', userId)
                .single();

            if (!userProfile?.is_active) {
                return [];
            }

            const { data: permissions } = await supabase
                .from('device_permissions')
                .select(`
                    *,
                    devices (
                        id,
                        name,
                        location,
                        type,
                        status,
                        relay_count
                    )
                `)
                .eq('user_id', userId);

            return permissions || [];
        } catch (error) {
            console.error('Error fetching user permissions:', error);
            return [];
        }
    }

    /**
     * Grant permissions to a user for a device
     */
    static async grantPermissions(userId, deviceId, permissions, grantedBy) {
        try {
            // Check if granter has permission to grant
            const canGrant = await this.hasPermission(grantedBy, deviceId, this.PERMISSIONS.GRANT_PERMISSIONS);
            if (!canGrant) {
                throw new Error('Insufficient permissions to grant access');
            }

            const { data, error } = await supabase
                .from('device_permissions')
                .upsert({
                    user_id: userId,
                    device_id: deviceId,
                    can_view: permissions.can_view ?? true,
                    can_control: permissions.can_control ?? false,
                    can_manage_timers: permissions.can_manage_timers ?? false,
                    can_manage_device: permissions.can_manage_device ?? false,
                    can_grant_permissions: permissions.can_grant_permissions ?? false,
                    granted_by: grantedBy,
                    granted_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) throw error;

            // Log the permission grant
            await supabaseService.logDeviceAction(
                deviceId,
                grantedBy,
                'permission_granted',
                null,
                { user_id: userId, permissions: permissions },
                'system'
            );

            return data;
        } catch (error) {
            console.error('Error granting permissions:', error);
            throw error;
        }
    }

    /**
     * Revoke permissions from a user for a device
     */
    static async revokePermissions(userId, deviceId, revokedBy) {
        try {
            // Check if revoker has permission to revoke
            const canRevoke = await this.hasPermission(revokedBy, deviceId, this.PERMISSIONS.GRANT_PERMISSIONS);
            if (!canRevoke) {
                throw new Error('Insufficient permissions to revoke access');
            }

            // Get current permissions for logging
            const { data: currentPerms } = await supabase
                .from('device_permissions')
                .select('*')
                .eq('user_id', userId)
                .eq('device_id', deviceId)
                .single();

            const { error } = await supabase
                .from('device_permissions')
                .delete()
                .eq('user_id', userId)
                .eq('device_id', deviceId);

            if (error) throw error;

            // Log the permission revocation
            await supabaseService.logDeviceAction(
                deviceId,
                revokedBy,
                'permission_revoked',
                currentPerms,
                { user_id: userId },
                'system'
            );

            return true;
        } catch (error) {
            console.error('Error revoking permissions:', error);
            throw error;
        }
    }

    /**
     * Update user role
     */
    static async updateUserRole(userId, newRole, updatedBy) {
        try {
            // Check if updater can change roles
            const { data: updaterProfile } = await supabase
                .from('user_profiles')
                .select('role')
                .eq('id', updatedBy)
                .single();

            const updaterRole = updaterProfile?.role || this.ROLES.GUEST;

            // Only super admins can change roles
            if (!this.hasRole(updaterRole, this.ROLES.SUPER_ADMIN)) {
                throw new Error('Insufficient permissions to change user roles');
            }

            // Can't change super admin role except by another super admin
            if (newRole === this.ROLES.SUPER_ADMIN && updaterRole !== this.ROLES.SUPER_ADMIN) {
                throw new Error('Only super admins can grant super admin role');
            }

            const { data, error } = await supabase
                .from('user_profiles')
                .update({
                    role: newRole,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)
                .select()
                .single();

            if (error) throw error;

            // Log the role change
            await supabase.from('system_logs').insert({
                action: 'role_changed',
                user_id: updatedBy,
                target_user_id: userId,
                details: { new_role: newRole },
                created_at: new Date().toISOString()
            });

            return data;
        } catch (error) {
            console.error('Error updating user role:', error);
            throw error;
        }
    }

    /**
     * Get all users with their roles and permissions
     */
    static async getAllUsersWithPermissions() {
        try {
            const { data: users } = await supabase
                .from('user_profiles')
                .select(`
                    id,
                    email,
                    display_name,
                    role,
                    is_active,
                    created_at,
                    last_login
                `)
                .order('created_at', { ascending: false });

            // Get permissions for each user
            const usersWithPermissions = await Promise.all(
                (users || []).map(async (user) => {
                    const permissions = await this.getUserPermissions(user.id);
                    return {
                        ...user,
                        permissions,
                        deviceCount: permissions.length
                    };
                })
            );

            return usersWithPermissions;
        } catch (error) {
            console.error('Error fetching users with permissions:', error);
            return [];
        }
    }

    /**
     * Get permission matrix for admin view
     */
    static async getPermissionMatrix() {
        try {
            const { data: users } = await supabase
                .from('user_profiles')
                .select('id, display_name, email, role, is_active')
                .eq('is_active', true)
                .order('display_name');

            const { data: devices } = await supabase
                .from('devices')
                .select('id, name, location, type')
                .eq('is_active', true)
                .order('name');

            const { data: permissions } = await supabase
                .from('device_permissions')
                .select('*');

            // Create matrix
            const matrix = {
                users: users || [],
                devices: devices || [],
                permissions: permissions || []
            };

            return matrix;
        } catch (error) {
            console.error('Error creating permission matrix:', error);
            return { users: [], devices: [], permissions: [] };
        }
    }

    /**
     * Bulk update permissions for multiple users/devices
     */
    static async bulkUpdatePermissions(updates, updatedBy) {
        try {
            const results = [];

            for (const update of updates) {
                try {
                    if (update.action === 'grant') {
                        const result = await this.grantPermissions(
                            update.userId,
                            update.deviceId,
                            update.permissions,
                            updatedBy
                        );
                        results.push({ success: true, ...result });
                    } else if (update.action === 'revoke') {
                        const result = await this.revokePermissions(
                            update.userId,
                            update.deviceId,
                            updatedBy
                        );
                        results.push({ success: true, revoked: true });
                    }
                } catch (error) {
                    results.push({ 
                        success: false, 
                        userId: update.userId, 
                        deviceId: update.deviceId,
                        error: error.message 
                    });
                }
            }

            return results;
        } catch (error) {
            console.error('Error in bulk permission update:', error);
            throw error;
        }
    }

    /**
     * Check if user can access a specific device based on permissions
     */
    static async canAccessDevice(userId, deviceId, accessType = 'view') {
        const permissionMap = {
            'view': this.PERMISSIONS.VIEW,
            'control': this.PERMISSIONS.CONTROL,
            'timers': this.PERMISSIONS.MANAGE_TIMERS,
            'manage': this.PERMISSIONS.MANAGE_DEVICE,
            'grant': this.PERMISSIONS.GRANT_PERMISSIONS
        };

        const permission = permissionMap[accessType];
        if (!permission) {
            throw new Error(`Invalid access type: ${accessType}`);
        }

        return await this.hasPermission(userId, deviceId, permission);
    }

    /**
     * Get accessible devices for a user
     */
    static async getAccessibleDevices(userId, accessType = 'view') {
        try {
            const { data: userProfile } = await supabase
                .from('user_profiles')
                .select('role')
                .eq('id', userId)
                .single();

            const userRole = userProfile?.role || this.ROLES.GUEST;

            // Super admins can access all devices
            if (userRole === this.ROLES.SUPER_ADMIN) {
                const { data: devices } = await supabase
                    .from('devices')
                    .select('*')
                    .eq('is_active', true);
                return devices || [];
            }

            const permission = this.PERMISSIONS[accessType.toUpperCase()] || this.PERMISSIONS.VIEW;

            const { data: permissions } = await supabase
                .from('device_permissions')
                .select('device_id')
                .eq('user_id', userId)
                .eq(permission, true);

            const deviceIds = permissions?.map(p => p.device_id) || [];
            
            if (deviceIds.length === 0) {
                return [];
            }

            const { data: devices } = await supabase
                .from('devices')
                .select('*')
                .in('id', deviceIds)
                .eq('is_active', true);

            return devices || [];
        } catch (error) {
            console.error('Error fetching accessible devices:', error);
            return [];
        }
    }
}

export { PermissionsService };
