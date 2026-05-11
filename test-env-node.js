import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test if .env file exists and can be read
const envPath = path.join(__dirname, '.env');

console.log('Testing .env file...');
console.log('Path:', envPath);

try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    console.log('.env file content:');
    console.log(envContent);
} catch (error) {
    console.error('Error reading .env file:', error.message);
}

// Test vite.config.js environment variable handling
const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
console.log('Package.json version:', packageJson.version);
