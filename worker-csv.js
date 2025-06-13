// worker-csv.js
// Receives data, generates CSV, and posts back result
self.onmessage = function(e) {
    const data = e.data;
    if (!data || !data.length) {
        self.postMessage('');
        return;
    }
    const keys = Object.keys(data[0]);
    const csvRows = [keys.join(',')];
    for (const row of data) {
        csvRows.push(keys.map(k => '"' + String(row[k]).replace(/"/g, '""') + '"').join(','));
    }
    self.postMessage(csvRows.join('\n'));
};
