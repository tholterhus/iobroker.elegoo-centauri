'use strict';

const utils = require('@iobroker/adapter-core');
const MonitoringHandler = require('./lib/monitoring');
const ControlHandler = require('./lib/control');

class ElegooCentauri extends utils.Adapter {
    constructor(options) {
        super({...options, name: 'elegoo-centauri' });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        // Create all necessary objects in the ioBroker object tree
        await this.createObjectTree();

        // Initialize monitoring and control handlers
        this.monitoring = new MonitoringHandler(this);
        this.control = new ControlHandler(this);

        // Pass the WebSocket client getter to the control handler for robust access
        this.control.setWsClientGetter(() => this.monitoring.getWebSocketClient());

        // Connect to the printer
        this.monitoring.connect();

        // Subscribe to changes in control states
        this.subscribeStates('control.*');
    }

    onUnload(callback) {
        try {
            this.monitoring.disconnect();
            this.log.info('Cleaned up everything...');
            callback();
        } catch (e) {
            callback();
        }
    }

    onStateChange(id, state) {
        if (state &&!state.ack) {
            // Delegate command to the ControlHandler
            const command = id.split('.').pop();
            this.control.handleCommand(command, state.val);
        }
    }

    /**
     * Creates the entire object tree for the adapter.
     * This function is called once on adapter startup.
     */
    async createObjectTree() {
        // Channel: info
        await this.setObjectNotExistsAsync('info', { type: 'channel', common: { name: 'Information' } });
        await this.setObjectNotExistsAsync('info.connection', { type: 'state', common: { name: 'Connection', type: 'boolean', role: 'indicator.connected', read: true, write: false, def: false } });
        await this.setObjectNotExistsAsync('info.ip', { type: 'state', common: { name: 'IP Address', type: 'string', role: 'info.ip', read: true, write: false, def: '' } });
        await this.setObjectNotExistsAsync('info.firmwareVersion', { type: 'state', common: { name: 'Firmware Version', type: 'string', role: 'info.firmware', read: true, write: false, def: '' } });

        // Channel: status
        await this.setObjectNotExistsAsync('status', { type: 'channel', common: { name: 'Status' } });
        await this.setObjectNotExistsAsync('status.printStatus', { type: 'state', common: { name: 'Print Status', type: 'string', role: 'text', read: true, write: false, def: '' } });
        await this.setObjectNotExistsAsync('status.printStatusCode', { type: 'state', common: { name: 'Print Status Code', type: 'number', role: 'value', read: true, write: false, def: 0 } });
        await this.setObjectNotExistsAsync('status.printProgress', { type: 'state', common: { name: 'Print Progress', type: 'number', role: 'value.progress', read: true, write: false, def: 0, unit: '%' } });
        await this.setObjectNotExistsAsync('status.currentLayer', { type: 'state', common: { name: 'Current Layer', type: 'number', role: 'value', read: true, write: false, def: 0 } });
        await this.setObjectNotExistsAsync('status.totalLayers', { type: 'state', common: { name: 'Total Layers', type: 'number', role: 'value', read: true, write: false, def: 0 } });
        await this.setObjectNotExistsAsync('status.elapsedPrintTime', { type: 'state', common: { name: 'Elapsed Print Time (s)', type: 'number', role: 'value.interval', read: true, write: false, def: 0, unit: 's' } });
        await this.setObjectNotExistsAsync('status.elapsedPrintTime_hhmmss', { type: 'state', common: { name: 'Elapsed Print Time', type: 'string', role: 'text', read: true, write: false, def: '00:00:00' } });
        await this.setObjectNotExistsAsync('status.remainingPrintTime', { type: 'state', common: { name: 'Remaining Print Time (s)', type: 'number', role: 'value.interval', read: true, write: false, def: 0, unit: 's' } });
        await this.setObjectNotExistsAsync('status.remainingPrintTime_hhmmss', { type: 'state', common: { name: 'Remaining Print Time', type: 'string', role: 'text', read: true, write: false, def: '00:00:00' } });

        // Channel: temperatures
        await this.setObjectNotExistsAsync('temperatures', { type: 'channel', common: { name: 'Temperatures' } });
        await this.setObjectNotExistsAsync('temperatures.nozzle', { type: 'state', common: { name: 'Nozzle Temperature', type: 'number', role: 'value.temperature', read: true, write: false, def: 0, unit: '°C' } });
        await this.setObjectNotExistsAsync('temperatures.nozzleTarget', { type: 'state', common: { name: 'Target Nozzle Temperature', type: 'number', role: 'value.temperature', read: true, write: false, def: 0, unit: '°C' } });
        await this.setObjectNotExistsAsync('temperatures.bed', { type: 'state', common: { name: 'Bed Temperature', type: 'number', role: 'value.temperature', read: true, write: false, def: 0, unit: '°C' } });
        await this.setObjectNotExistsAsync('temperatures.bedTarget', { type: 'state', common: { name: 'Target Bed Temperature', type: 'number', role: 'value.temperature', read: true, write: false, def: 0, unit: '°C' } });
        await this.setObjectNotExistsAsync('temperatures.enclosure', { type: 'state', common: { name: 'Enclosure Temperature', type: 'number', role: 'value.temperature', read: true, write: false, def: 0, unit: '°C' } });

        // Channel: fans
        await this.setObjectNotExistsAsync('fans', { type: 'channel', common: { name: 'Fans' } });
        await this.setObjectNotExistsAsync('fans.model', { type: 'state', common: { name: 'Model Fan Speed', type: 'number', role: 'value.speed', read: true, write: false, def: 0, unit: '%' } });
        await this.setObjectNotExistsAsync('fans.auxiliary', { type: 'state', common: { name: 'Auxiliary Fan Speed', type: 'number', role: 'value.speed', read: true, write: false, def: 0, unit: '%' } });
        await this.setObjectNotExistsAsync('fans.enclosure', { type: 'state', common: { name: 'Enclosure Fan Speed', type: 'number', role: 'value.speed', read: true, write: false, def: 0, unit: '%' } });

        // Channel: control
        await this.setObjectNotExistsAsync('control', { type: 'channel', common: { name: 'Control' } });
        await this.setObjectNotExistsAsync('control.targetNozzleTemp', { type: 'state', common: { name: 'Set Target Nozzle Temp', type: 'number', role: 'level.temperature', read: true, write: true, def: 0, unit: '°C' } });
        await this.setObjectNotExistsAsync('control.targetBedTemp', { type: 'state', common: { name: 'Set Target Bed Temp', type: 'number', role: 'level.temperature', read: true, write: true, def: 0, unit: '°C' } });
        await this.setObjectNotExistsAsync('control.printSpeed', { type: 'state', common: { name: 'Set Print Speed', type: 'number', role: 'level.speed', read: true, write: true, def: 100, unit: '%' } });
        await this.setObjectNotExistsAsync('control.chamberLight', { type: 'state', common: { name: 'Chamber Light', type: 'boolean', role: 'switch.light', read: true, write: true, def: false } });
        await this.setObjectNotExistsAsync('control.fanSpeedModel', { type: 'state', common: { name: 'Set Model Fan Speed', type: 'number', role: 'level.speed', read: true, write: true, def: 0, unit: '%' } });
        await this.setObjectNotExistsAsync('control.fanSpeedAuxiliary', { type: 'state', common: { name: 'Set Auxiliary Fan Speed', type: 'number', role: 'level.speed', read: true, write: true, def: 0, unit: '%' } });
        await this.setObjectNotExistsAsync('control.fanSpeedEnclosure', { type: 'state', common: { name: 'Set Enclosure Fan Speed', type: 'number', role: 'level.speed', read: true, write: true, def: 0, unit: '%' } });
        await this.setObjectNotExistsAsync('control.command', { type: 'state', common: { name: 'Send Command', type: 'string', role: 'text', read: true, write: true, def: '' } });

        // Channel: camera
        await this.setObjectNotExistsAsync('camera', { type: 'channel', common: { name: 'Camera' } });
        await this.setObjectNotExistsAsync('camera.streamUrl', { type: 'state', common: { name: 'Camera Stream URL', type: 'string', role: 'url.video', read: true, write: false, def: '' } });
    }
}

if (require.main === module) {
    // @ts-ignore
    const { adapter } = require('@iobroker/adapter-core');
    new ElegooCentauri(adapter);
}
