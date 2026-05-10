-- Insert test data
INSERT INTO public.user_profiles (id, email, display_name, role) VALUES
('00000000-0000-0000-0000-000000000001', 'test@example.com', 'Test User', 'user'),
('00000000-0000-0000-0000-000000000002', 'admin@example.com', 'Admin User', 'admin');

-- Insert test devices
INSERT INTO public.devices (id, name, type, ip_address, state) VALUES
('10000000-0000-0000-0000-000000000001', 'Test Relay 1', 'esp32', '192.168.1.100', '{"relay1": "off", "relay2": "on"}'),
('10000000-0000-0000-0000-000000000002', 'Test Relay 2', 'esp32', '192.168.1.101', '{"relay1": "on", "relay2": "off"}');

-- Insert test permissions
INSERT INTO public.device_permissions (user_id, device_id, can_control, can_view, can_manage_timers) VALUES
('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', true, true, true),
('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', true, true, true),
('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', true, true, true);
