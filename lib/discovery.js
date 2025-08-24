const dgram = require('dgram');

function discoverPrinters(callback) {
    const client = dgram.createSocket('udp4');
    const message = Buffer.from('M99999');
    const discoveredPrinters =;

    client.on('message', (msg, rinfo) => {
        try {
            const response = JSON.parse(msg.toString());
            // Annahme: Die Antwort enthält eine IP-Adresse oder kann von rinfo abgeleitet werden.
            const printerInfo = {
                ip: rinfo.address,
                data: response
            };
            if (!discoveredPrinters.some(p => p.ip === printerInfo.ip)) {
                discoveredPrinters.push(printerInfo);
            }
        } catch (e) {
            // Ignoriere ungültige Antworten
        }
    });

    client.bind(() => {
        client.setBroadcast(true);
        client.send(message, 3000, '255.255.255.255', (err) => {
            if (err) {
                client.close();
                callback(err, null);
            }
        });
    });

    // Warte eine kurze Zeit auf Antworten
    setTimeout(() => {
        client.close();
        callback(null, discoveredPrinters);
    }, 2000);
}
