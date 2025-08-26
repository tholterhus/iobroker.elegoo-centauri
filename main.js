'use strict';

const utils = require('@iobroker/adapter-core');
const MonitoringService = require('./lib/monitoring');
const ControlHandler = require('./lib/control');

class ElegooCentauri extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: 'elegoo-centauri',
        });
        
        // CRITICAL FIX: Initialize monitoring service properly
        this.monitoringService = null;
        
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Called when adapter is ready
     */
    async onReady() {
        this.log.info('Starting Elegoo Centauri adapter');
        
        // Validate configuration
        if (!this.config.printerIp) {
            this.log.error('Printer IP address not configured. Please check adapter settings.');
            return;
        }

        // Set default values if not configured
        this.config.printerIp = this.config.printerIp || '192.168.178.34';
        this.config.pollInterval = parseInt(this.config.pollInterval) || 10;
        this.config.reconnectInterval = parseInt(this.config.reconnectInterval) || 60;
        this.config.websocketPort = parseInt(this.config.websocketPort) || 3030; // Not used in SDCP but kept for compatibility
        this.config.cameraPort = parseInt(this.config.cameraPort) || 8080;

        this.log.info(`Configuration: IP=${this.config.printerIp}, Poll=${this.config.pollInterval}s, Reconnect=${this.config.reconnectInterval}s`);

        try {
            // Create all necessary objects
            await this.createObjects();
            
            // CRITICAL FIX: Initialize and start monitoring service
            this.monitoringService = new MonitoringService(this);
            await this.monitoringService.start();
            
            this.log.info('Elegoo Centauri adapter started successfully');
            
        } catch (error) {
            this.log.error(`Failed to start adapter: ${error.message}`);
        }
    }

    /**
     * Handle state changes from ioBroker
     */
    async onStateChange(id, state) {
        if (!state || state.ack) {
            return; // Ignore acknowledged state changes
        }

        const idNoNamespace = id.replace(this.namespace + '.', '');
        this.log.debug(`State change: ${idNoNamespace} = ${state.val}`);

        try {
            // CRITICAL FIX: Route commands through monitoring service
            if (this.monitoringService) {
                switch (idNoNamespace) {
                    case 'controls.pause':
                        if (state.val) {
                            this.log.info('Pausing print via state change');
                            this.monitoringService.pausePrint();
                            // Acknowledge the command
                            await this.setState('controls.pause', false, true);
                        }
                        break;
                        
                    case 'controls.resume':
                        if (state.val) {
                            this.log.info('Resuming print via state change');
                            this.monitoringService.resumePrint();
                            await this.setState('controls.resume', false, true);
                        }
                        break;
                        
                    case 'controls.cancel':
                        if (state.val) {
                            this.log.info('Canceling print via state change');
                            this.monitoringService.cancelPrint();
                            await this.setState('controls.cancel', false, true);
                        }
                        break;
                        
                    case 'controls.light':
                        this.log.info(`Setting chamber light: ${state.val ? 'ON' : 'OFF'}`);
                        this.monitoringService.toggleLight(!!state.val);
                        await this.setState('controls.light', !!state.val, true);
                        break;
                        
                    case 'controls.refresh':
                        if (state.val) {
                            this.log.info('Manual status refresh requested');
                            this.monitoringService.requestStatus();
                            await this.setState('controls.refresh', false, true);
                        }
                        break;
                        
                    default:
                        // Unknown control, just acknowledge
                        await this.setState(id, state.val, true);
                        break;
                }
            } else {
                this.log.warn('Monitoring service not available for state change');
            }
            
        } catch (error) {
            this.log.error(`Error handling state change: ${error.message}`);
        }
    }

    /**
     * Clean shutdown
     */
    async onUnload(callback) {
        try {
            this.log.info('Shutting down Elegoo Centauri adapter');
            
            // CRITICAL FIX: Properly stop monitoring service
            if (this.monitoringService) {
                await this.monitoringService.stop();
                this.monitoringService = null;
            }
            
            // Update connection status
            await this.setState('info.connection', false, true);
            
            this.log.info('Adapter shutdown complete');
            callback();
            
        } catch (error) {
            this.log.error(`Error during shutdown: ${error.message}`);
            callback();
        }
    }

    /**
     * Create all necessary ioBroker objects
     */
    async createObjects() {
        this.log.info('Creating ioBroker objects');
        
        // CRITICAL FIX: Ensure all required objects exist
        
        // Info channel
        await this.setObjectNotExistsAsync('info', {
            type: 'channel',
            common: { name: 'Information' },
            native: {}
        });
        
        await this.setObjectNotExistsAsync('info.connection', {
            type: 'state',
            common: {
                name: 'Connected to Printer',
                type: 'boolean',
                role: 'indicator.connected',
                read: true,
                write: false,
                def: false
            },
            native: {}
        });
        
        await this.setObjectNotExistsAsync('info.lastUpdate', {
            type: 'state',
            common: {
                name: 'Last Status Update',
                type: 'string',
                role: 'value.datetime',
                read: true,
                write: false
            },
            native: {}
        });

        // Temperature channels - CRITICAL FIX: Create all temperature objects
        await this.setObjectNotExistsAsync('temperatures', {
            type: 'channel',
            common: { name: 'Temperatures' },
            native: {}
        });
        
        const tempSensors = [
            { id: 'nozzle', name: 'Nozzle' },
            { id: 'bed', name: 'Heated Bed' },
            { id: 'chamber', name: 'Chamber' }
        ];
        
        for (const sensor of tempSensors) {
            await this.setObjectNotExistsAsync(`temperatures.${sensor.id}`, {
                type: 'channel',
                common: { name: sensor.name },
                native: {}
            });
            
            await this.setObjectNotExistsAsync(`temperatures.${sensor.id}.actual`, {
                type: 'state',
                common: {
                    name: `${sensor.name} Temperature`,
                    type: 'number',
                    role: 'value.temperature',
                    unit: '°C',
                    read: true,
                    write: false,
                    def: 0
                },
                native: {}
            });
            
            await this.setObjectNotExistsAsync(`temperatures.${sensor.id}.target`, {
                type: 'state',
                common: {
                    name: `${sensor.name} Target Temperature`,
                    type: 'number',
                    role: 'level.temperature',
                    unit: '°C',
                    read: true,
                    write: false,
                    def: 0
                },
                native: {}
            });
        }

        // Print information - CRITICAL FIX: Create all print-related objects
        await this.setObjectNotExistsAsync('print', {
            type: 'channel',
            common: { name: 'Print Information' },
            native: {}
        });
        
        const printObjects = [
            { id: 'status', name: 'Print Status', type: 'string', role: 'text', def: 'Unknown' },
            { id: 'statusCode', name: 'Status Code', type: 'number', role: 'value', def: 0 },
            { id: 'progress', name: 'Progress', type: 'number', role: 'value', unit: '%', def: 0 },
            { id: 'filename', name: 'Filename', type: 'string', role: 'text', def: '' },
            { id: 'currentLayer', name: 'Current Layer', type: 'number', role: 'value', def: 0 },
            { id: 'totalLayers', name: 'Total Layers', type: 'number', role: 'value', def: 0 },
            { id: 'speedPercentage', name: 'Print Speed', type: 'number', role: 'value', unit: '%', def: 100 },
            { id: 'totalTime', name: 'Total Time', type: 'string', role: 'text', def: '00:00:00' },
            { id: 'elapsedTime', name: 'Elapsed Time', type: 'string', role: 'text', def: '00:00:00' },
            { id: 'remainingTime', name: 'Remaining Time', type: 'string', role: 'text', def: '00:00:00' }
        ];
        
        for (const obj of printObjects) {
            await this.setObjectNotExistsAsync(`print.${obj.id}`, {
                type: 'state',
                common: {
                    name: obj.name,
                    type: obj.type,
                    role: obj.role,
                    unit: obj.unit,
                    read: true,
                    write: false,
                    def: obj.def
                },
                native: {}
            });
        }

        // Control buttons - CRITICAL FIX: Create control objects
        await this.setObjectNotExistsAsync('controls', {
            type: 'channel',
            common: { name: 'Printer Controls' },
            native: {}
        });
        
        const controls = [
            { id: 'pause', name: 'Pause Print' },
            { id: 'resume', name: 'Resume Print' },
            { id: 'cancel', name: 'Cancel Print' },
            { id: 'light', name: 'Chamber Light' },
            { id: 'refresh', name: 'Refresh Status' }
        ];
        
        for (const control of controls) {
            const isLight = control.id === 'light';
            await this.setObjectNotExistsAsync(`controls.${control.id}`, {
                type: 'state',
                common: {
                    name: control.name,
                    type: 'boolean',
                    role: isLight ? 'switch' : 'button',
                    read: isLight,
                    write: true,
                    def: false
                },
                native: {}
            });
        }

        // Fan speeds
        await this.setObjectNotExistsAsync('fans', {
            type: 'channel',
            common: { name: 'Fan Speeds' },
            native: {}
        });
        
        const fans = ['model', 'auxiliary', 'chamber'];
        for (const fan of fans) {
            await this.setObjectNotExistsAsync(`fans.${fan}`, {
                type: 'state',
                common: {
                    name: `${fan.charAt(0).toUpperCase() + fan.slice(1)} Fan`,
                    type: 'number',
                    role: 'value',
                    unit: '%',
                    read: true,
                    write: false,
                    def: 0
                },
                native: {}
            });
        }

        // Position information
        await this.setObjectNotExistsAsync('position', {
            type: 'channel',
            common: { name: 'Position' },
            native: {}
        });
        
        const positions = ['x', 'y', 'z', 'zOffset'];
        for (const pos of positions) {
            await this.setObjectNotExistsAsync(`position.${pos}`, {
                type: 'state',
                common: {
                    name: pos === 'zOffset' ? 'Z-Offset' : `${pos.toUpperCase()} Position`,
                    type: 'number',
                    role: 'value',
                    unit: 'mm',
                    read: true,
                    write: false,
                    def: 0
                },
                native: {}
            });
        }

        // Lighting controls
        await this.setObjectNotExistsAsync('lights', {
            type: 'channel',
            common: { name: 'Lighting' },
            native: {}
        });
        
        await this.setObjectNotExistsAsync('lights.chamber', {
            type: 'state',
            common: {
                name: 'Chamber Light Status',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                def: false
            },
            native: {}
        });
        
        await this.setObjectNotExistsAsync('lights.rgb', {
            type: 'channel',
            common: { name: 'RGB Lighting' },
            native: {}
        });
        
        const rgbColors = ['r', 'g', 'b'];
        for (const color of rgbColors) {
            await this.setObjectNotExistsAsync(`lights.rgb.${color}`, {
                type: 'state',
                common: {
                    name: `RGB ${color.toUpperCase()}`,
                    type: 'number',
                    role: 'level.color.rgb',
                    min: 0,
                    max: 255,
                    read: true,
                    write: false,
                    def: 0
                },
                native: {}
            });
        }
        
        this.log.info('All ioBroker objects created successfully');
    }
}


if (require.main === module) {
    // @ts-ignore
    const { adapter } = require('@iobroker/adapter-core');
    new ElegooCentauri(adapter);
}
