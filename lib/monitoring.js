'use strict';

const WebSocket = require('ws');
const { STATUS_CODES } = require('./messages');

/**
 * Formats a duration in seconds into a hh:mm:ss string.
 * @param {number} seconds - The total seconds.
 * @returns {string} The formatted time string.
 */
function formatSeconds(seconds) {
    if (isNaN(seconds) |

| seconds < 0) return '00:00:00';
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

class MonitoringHandler {
    constructor(adapter) {
        this.adapter = adapter;
        this.ws = null;
        this.pollTimer = null;
        this.reconnectTimer = null;
    }

    connect() {
        const url = `ws://${this.adapter.config.printerIp}:${this.adapter.config.wsPort}/websocket`;
        this.adapter.log.info(`Connecting to printer at ${url}`);
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            this.adapter.log.info('Connected to printer.');
            this.adapter.setState('info.connection', true, true);
            this.startPolling();
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        });

        this.ws.on('message', (data) => {
            this._handleMessage(data);
        });

        this.ws.on('close', () => {
            this.adapter.log.warn('Connection closed.');
            this.adapter.setState('info.connection', false, true);
            this.stopPolling();
            this._scheduleReconnect();
        });

        this.ws.on('error', (err) => {
            this.adapter.log.error(`WebSocket error: ${err.message}`);
            // 'close' will be called automatically afterwards
        });
    }

    disconnect() {
        if (this.pollTimer) clearTimeout(this.pollTimer);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
        }
    }
    
    startPolling() {
        this.stopPolling(); // Ensure only one timer is running
        const poll = () => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Hypothetical command to get status
                this.ws.send(JSON.stringify({ command: 'GET_STATUS' }));
            }
            this.pollTimer = setTimeout(poll, this.adapter.config.pollInterval * 1000);
        };
        poll();
    }

    stopPolling() {
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /**
     * Handles incoming WebSocket messages, parses them, and updates ioBroker states.
     * @param {Buffer} message - The raw message from the WebSocket.
     */
    async _handleMessage(message) {
        try {
            const payload = JSON.parse(message.toString());
            this.adapter.log.debug(`Received message: ${JSON.stringify(payload)}`);

            // Check if this is a status response payload
            if (payload.command === 'GET_STATUS_RSP' && payload.data) {
                const data = payload.data;

                // Update Print Status
                const statusCode = data.print_status;
                const statusKey = STATUS_CODES[statusCode] || 'UNKNOWN';
                await this.adapter.setStateAsync('status.printStatusCode', statusCode, true);
                await this.adapter.setStateAsync('status.printStatus', statusKey, true);

                // Update Progress and Layers
                await this.adapter.setStateAsync('status.printProgress', data.progress || 0, true);
                await this.adapter.setStateAsync('status.currentLayer', data.current_layer || 0, true);
                await this.adapter.setStateAsync('status.totalLayers', data.total_layers || 0, true);

                // Update Timings
                const elapsed = data.print_time_secs || 0;
                const remaining = data.remaining_time_secs || 0;
                await this.adapter.setStateAsync('status.elapsedPrintTime', elapsed, true);
                await this.adapter.setStateAsync('status.elapsedPrintTime_hhmmss', formatSeconds(elapsed), true);
                await this.adapter.setStateAsync('status.remainingPrintTime', remaining, true);
                await this.adapter.setStateAsync('status.remainingPrintTime_hhmmss', formatSeconds(remaining), true);

                // Update Temperatures
                if (data.temps) {
                    await this.adapter.setStateAsync('temperatures.nozzle', data.temps.nozzle?.current || 0, true);
                    await this.adapter.setStateAsync('temperatures.nozzleTarget', data.temps.nozzle?.target || 0, true);
                    await this.adapter.setStateAsync('temperatures.bed', data.temps.bed?.current || 0, true);
                    await this.adapter.setStateAsync('temperatures.bedTarget', data.temps.bed?.target || 0, true);
                    await this.adapter.setStateAsync('temperatures.enclosure', data.temps.enclosure || 0, true);
                }

                // Update Fans
                if (data.fans) {
                    await this.adapter.setStateAsync('fans.model', data.fans.model || 0, true);
                    await this.adapter.setStateAsync('fans.auxiliary', data.fans.aux || 0, true);
                    await this.adapter.setStateAsync('fans.enclosure', data.fans.enclosure || 0, true);
                }
            }
        } catch (e) {
            this.adapter.log.warn(`Could not parse message: ${message}`);
        }
    }

    _scheduleReconnect() {
        if (!this.reconnectTimer) {
            this.reconnectTimer = setTimeout(() => {
                this.adapter.log.info('Attempting to reconnect...');
                this.connect();
            }, this.adapter.config.reconnectInterval * 1000);
        }
    }
    
    getWebSocketClient() {
        return this.ws;
    }
}

module.exports = MonitoringHandler;
