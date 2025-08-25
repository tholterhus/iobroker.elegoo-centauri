'use strict';

class ControlHandler {
    constructor(adapter) {
        this.adapter = adapter;
        this.ws = null;
        this.getWsClient = null;
    }

    setWsClientGetter(getter) {
        this.getWsClient = getter;
    }

    handleCommand(command, value) {
        let commandObject = null;
        switch (command) {
            case 'targetNozzleTemp':
                commandObject = { command: 'SET_TEMP', data: { type: 'nozzle', value: value } };
                break;
            case 'targetBedTemp':
                commandObject = { command: 'SET_TEMP', data: { type: 'bed', value: value } };
                break;
            case 'command':
                if (includes(value.toUpperCase())) {
                    commandObject = { command: 'CONTROL_PRINT', data: { action: value.toLowerCase() } };
                }
                break;
            // Implement other commands here
        }

        if (commandObject) {
            this._sendCommand(commandObject);
        }
    }

    _sendCommand(commandObject) {
        if (!this.getWsClient) {
            this.adapter.log.error('WebSocket client getter not set.');
            return;
        }

        const ws = this.getWsClient();
        if (ws && ws.readyState === 1 /* OPEN */) {
            ws.send(JSON.stringify(commandObject));
            this.adapter.log.debug(`Sent command: ${JSON.stringify(commandObject)}`);
        } else {
            this.adapter.log.error('Cannot send command: WebSocket is not open.');
        }
    }
}

module.exports = ControlHandler;
