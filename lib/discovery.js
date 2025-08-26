const dgram = require('dgram');

function discoverPrinters(callback) {
    const client = dgram.createSocket('udp4');
    const message = Buffer.from('M99999');
    const discoveredPrinters =;

    client.on('message', (msg, rinfo) => {
        try {
            const response = JSON.parse(msg.toString());
            // Assumption: The response contains an IP address or can be derived from rinfo.
            const printerInfo = {
                ip: rinfo.address,
                data: response
            };
            if (!discoveredPrinters.some(p => p.ip === printerInfo.ip)) {
                discoveredPrinters.push(printerInfo);
            }
        } catch (e) {
            // Ignore invalid responses
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

    // Wait a short time for responses
    setTimeout(() => {
        client.close();
        callback(null, discoveredPrinters);
    }, 2000);
}
