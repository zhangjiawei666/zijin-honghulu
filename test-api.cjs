const { spawn } = require('child_process');
const proc = spawn(process.execPath, ['dist-server/server.cjs'], {
  env: { ...process.env, STOCK_MONITOR_DATA_DIR: process.cwd() + '/data', PORT: '3459' },
  stdio: ['pipe', 'pipe', 'pipe']
});
let out = '';
proc.stdout.on('data', d => {
  out += d.toString();
  process.stdout.write(d);
});
proc.stderr.on('data', d => process.stderr.write(d));
// Wait for server to be ready (3 seconds), then fetch
setTimeout(() => {
  console.log('\n--- FETCHING ---');
  fetch('http://localhost:3459/api/sector-effect?limit=400')
    .then(r => r.json())
    .then(j => {
      console.log('mode:', j.mode, 'rows:', j.rows?.length);
      console.log('stats:', JSON.stringify(j.stats));
      const dayTypes = {};
      (j.rows || []).forEach(r => { dayTypes[r.dayType] = (dayTypes[r.dayType] || 0) + 1; });
      console.log('dayTypes:', JSON.stringify(dayTypes));
      const today = (j.rows || []).find(r => r.isToday);
      console.log('today:', today ? today.date + ':' + today.dayType : 'NONE');
      if (j.rows && j.rows[0]) console.log('row0.cells:', j.rows[0].cells?.length, '| sectors:', j.rows[0].sectors?.length);
      // Check for any row with cells
      const tradingRow = (j.rows || []).find(r => r.dayType === 'trading');
      if (tradingRow) console.log('sample trading:', tradingRow.date, 'cells:', tradingRow.cells?.slice(0,3).map(c => c ? c.name+c.count : null));
      proc.kill();
      process.exit(0);
    })
    .catch(e => { console.error('FETCH_ERR', e.message); proc.kill(); process.exit(1); });
}, 4000);
setTimeout(() => { console.log('\nHARD TIMEOUT'); proc.kill(); process.exit(1); }, 12000);
