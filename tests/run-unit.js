/**
 * Chạy toàn bộ unit test trong tests/unit/
 * Dùng: npm run test:unit
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { run } = require('./harness');

const unitDir = path.join(__dirname, 'unit');
const files = fs.readdirSync(unitDir).filter(f => f.endsWith('.test.js')).sort();

console.log('\n\x1b[1mUNIT TEST — Luật chơi OTTv2\x1b[0m');

files.forEach(f => require(path.join(unitDir, f)));

run().then(ok => process.exit(ok ? 0 : 1));
