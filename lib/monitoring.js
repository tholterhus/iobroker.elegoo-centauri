// monitoring.js - Fixed version with proper SDCP WebSocket handling

'use strict';

const WebSocket = require('ws');

class MonitoringService {
constructor(adapter) {
this.adapter = adapter;
this.ws = null;
this.reconnectTimer = null;
this.pollTimer = null;
this.keepAliveTimer = null;
this.requestId = 0;
this.isConnected = false;
this.config = adapter.config;
}

```
/**
 * Start monitoring the printer
 */
async start() {
    this.adapter.log.info('Starting monitoring service');
    this.connect();
}

/**
 * Stop monitoring the printer
 */
async stop() {
    this.adapter.log.info('Stopping monitoring service');
    
    this.clearTimers();
    
    if (this.ws) {
        this.ws.removeAllListeners();
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
        this.ws = null;
    }
    
    this.isConnected = false;
    await this.adapter.setState('info.connection', false, true);
}

/**
 * Connect to the Elegoo Centauri Carbon printer via WebSocket
 */
connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.adapter.log.debug('WebSocket already connected');
        return;
    }

    this.clearTimers();

    // CRITICAL FIX: Use correct SDCP WebSocket URL format
    const wsUrl = `ws://${this.config.printerIp}/websocket`;
    this.adapter.log.info(`Connecting to printer: ${wsUrl}`);

    try {
        this.ws = new WebSocket(wsUrl, {
            timeout: 10000,
            handshakeTimeout: 10000
        });

        this.setupWebSocketEventHandlers();

    } catch (error) {
        this.adapter.log.error(`Failed to create WebSocket connection: ${error.message}`);
        this.scheduleReconnect();
    }
}

/**
 * Setup WebSocket event handlers
 */
setupWebSocketEventHandlers() {
    this.ws.on('open', () => {
        this.adapter.log.info('WebSocket connection established');
        this.isConnected = true;
        this.adapter.setState('info.connection', true, true);
        
        // CRITICAL FIX: Start keep-alive immediately after connection
        this.startKeepAlive();
        
        // CRITICAL FIX: Request initial status using SDCP command 0
        this.requestStatus();
        
        // CRITICAL FIX: Start proper polling with SDCP commands
        this.startPolling();
    });

    this.ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            this.handleMessage(message);
        } catch (error) {
            this.adapter.log.error(`Failed to parse WebSocket message: ${error.message}`);
            this.adapter.log.debug(`Raw message: ${data.toString()}`);
        }
    });

    this.ws.on('error', (error) => {
        this.adapter.log.error(`WebSocket error: ${error.message}`);
        this.isConnected = false;
        this.adapter.setState('info.connection', false, true);
    });

    this.ws.on('close', (code, reason) => {
        this.adapter.log.warn(`WebSocket closed - Code: ${code}, Reason: ${reason || 'Unknown'}`);
        this.isConnected = false;
        this.adapter.setState('info.connection', false, true);
        this.clearTimers();
        this.scheduleReconnect();
    });

    this.ws.on('pong', () => {
        this.adapter.log.debug('Received pong from printer');
    });
}

/**
 * Generate unique request ID for SDCP messages
 */
generateRequestId() {
    this.requestId++;
    return `iobroker_${Date.now()}_${this.requestId}`;
}

/**
 * Send SDCP command to printer
 */
sendCommand(cmd, data = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.adapter.log.warn(`Cannot send command ${cmd}: WebSocket not connected`);
        return false;
    }

    // CRITICAL FIX: Use correct SDCP message format
    const message = {
        Id: "",
        Data: {
            Cmd: cmd,
            Data: data,
            RequestID: this.generateRequestId(),
            MainboardID: "",
            TimeStamp: Date.now(),
            From: 1
        }
    };

    try {
        const messageString = JSON.stringify(message);
        this.ws.send(messageString);
        this.adapter.log.debug(`Sent SDCP command ${cmd}: ${messageString}`);
        return true;
    } catch (error) {
        this.adapter.log.error(`Failed to send command ${cmd}: ${error.message}`);
        return false;
    }
}

/**
 * Request status update from printer (SDCP command 0)
 */
requestStatus() {
    this.adapter.log.debug('Requesting printer status');
    return this.sendCommand(0, {});
}

/**
 * Start keep-alive mechanism to prevent connection timeout
 */
startKeepAlive() {
    this.clearKeepAlive();
    
    // CRITICAL FIX: Keep connection alive every 50 seconds (printer closes after 60s)
    this.keepAliveTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Send WebSocket ping
            this.ws.ping();
            this.adapter.log.debug('Sent keep-alive ping');
        } else {
            this.clearKeepAlive();
        }
    }, 50000); // 50 seconds
}

/**
 * Start polling timer
 */
startPolling() {
    this.clearPolling();
    
    const pollInterval = (this.config.pollInterval || 10) * 1000;
    
    // CRITICAL FIX: Use setInterval for consistent polling
    this.pollTimer = setInterval(() => {
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.requestStatus();
        } else {
            this.adapter.log.warn('Skipping poll - WebSocket not connected');
            this.clearPolling();
        }
    }, pollInterval);
    
    this.adapter.log.info(`Polling started with interval: ${pollInterval}ms`);
}

/**
 * Clear all timers
 */
clearTimers() {
    this.clearReconnect();
    this.clearPolling();
    this.clearKeepAlive();
}

clearReconnect() {
    if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
    }
}

clearPolling() {
    if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
    }
}

clearKeepAlive() {
    if (this.keepAliveTimer) {
        clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = null;
    }
}

/**
 * Schedule reconnection attempt
 */
scheduleReconnect() {
    this.clearReconnect();
    
    const reconnectInterval = (this.config.reconnectInterval || 60) * 1000;
    
    this.reconnectTimer = setTimeout(() => {
        this.adapter.log.info('Attempting to reconnect...');
        this.connect();
    }, reconnectInterval);
    
    this.adapter.log.info(`Reconnection scheduled in ${reconnectInterval}ms`);
}

/**
 * Handle incoming SDCP messages
 */
handleMessage(message) {
    this.adapter.log.debug(`Received message: ${JSON.stringify(message)}`);
    
    try {
        // CRITICAL FIX: Handle SDCP status updates correctly
        if (message.Status) {
            this.updatePrinterStatus(message.Status);
            this.adapter.setState('info.lastUpdate', new Date().toISOString(), true);
        }
        
        // Handle command responses
        if (message.Data && typeof message.Data.Cmd !== 'undefined') {
            this.handleCommandResponse(message);
        }
        
        // Handle other message types
        if (message.Topic && message.Topic.includes('sdcp/status/')) {
            // This is a status update message
            if (message.Status) {
                this.updatePrinterStatus(message.Status);
            }
        }
        
    } catch (error) {
        this.adapter.log.error(`Error handling message: ${error.message}`);
        this.adapter.log.debug(`Problematic message: ${JSON.stringify(message)}`);
    }
}

/**
 * Update printer status from SDCP status message
 */
updatePrinterStatus(status) {
    try {
        this.adapter.log.debug('Updating printer status from SDCP data');
        
        // CRITICAL FIX: Handle temperature data correctly
        if (typeof status.TempOfNozzle !== 'undefined') {
            this.adapter.setState('temperatures.nozzle.actual', 
                Math.round(status.TempOfNozzle * 100) / 100, true);
        }
        
        if (typeof status.TempOfHotbed !== 'undefined') {
            this.adapter.setState('temperatures.bed.actual', 
                Math.round(status.TempOfHotbed * 100) / 100, true);
        }
        
        if (typeof status.TempOfBox !== 'undefined') {
            this.adapter.setState('temperatures.chamber.actual', 
                Math.round(status.TempOfBox * 100) / 100, true);
        }

        // Target temperatures
        if (typeof status.TempTargetNozzle !== 'undefined') {
            this.adapter.setState('temperatures.nozzle.target', 
                Math.round(status.TempTargetNozzle * 100) / 100, true);
        }
        
        if (typeof status.TempTargetHotbed !== 'undefined') {
            this.adapter.setState('temperatures.bed.target', 
                Math.round(status.TempTargetHotbed * 100) / 100, true);
        }
        
        if (typeof status.TempTargetBox !== 'undefined') {
            this.adapter.setState('temperatures.chamber.target', 
                Math.round(status.TempTargetBox * 100) / 100, true);
        }

        // CRITICAL FIX: Handle fan speeds correctly
        if (status.CurrentFanSpeed) {
            this.adapter.setState('fans.model', status.CurrentFanSpeed.ModelFan || 0, true);
            this.adapter.setState('fans.auxiliary', status.CurrentFanSpeed.AuxiliaryFan || 0, true);
            this.adapter.setState('fans.chamber', status.CurrentFanSpeed.BoxFan || 0, true);
        }

        // CRITICAL FIX: Handle print information correctly
        if (status.PrintInfo) {
            const printInfo = status.PrintInfo;
            
            // Status mapping from SDCP documentation
            const statusText = this.mapPrintStatus(printInfo.Status);
            this.adapter.setState('print.status', statusText, true);
            this.adapter.setState('print.statusCode', printInfo.Status || 0, true);
            
            // Progress and layer information
            this.adapter.setState('print.progress', printInfo.Progress || 0, true);
            this.adapter.setState('print.currentLayer', printInfo.CurrentLayer || 0, true);
            this.adapter.setState('print.totalLayers', printInfo.TotalLayer || 0, true);
            this.adapter.setState('print.speedPercentage', printInfo.PrintSpeedPct || 100, true);
            
            // Filename
            if (printInfo.Filename) {
                this.adapter.setState('print.filename', printInfo.Filename, true);
            }
            
            // CRITICAL FIX: Handle time calculation correctly
            if (printInfo.CurrentTicks && printInfo.TotalTicks) {
                const totalTimeSeconds = printInfo.TotalTicks;
                const elapsedTimeSeconds = printInfo.CurrentTicks;
                const remainingTimeSeconds = Math.max(0, totalTimeSeconds - elapsedTimeSeconds);
                
                this.adapter.setState('print.totalTime', this.formatTime(totalTimeSeconds), true);
                this.adapter.setState('print.elapsedTime', this.formatTime(elapsedTimeSeconds), true);
                this.adapter.setState('print.remainingTime', this.formatTime(remainingTimeSeconds), true);
            }
        }

        // CRITICAL FIX: Handle position data correctly
        if (status.CurrenCoord) {
            try {
                const coords = status.CurrenCoord.split(',');
                if (coords.length === 3) {
                    this.adapter.setState('position.x', parseFloat(coords[0]) || 0, true);
                    this.adapter.setState('position.y', parseFloat(coords[1]) || 0, true);
                    this.adapter.setState('position.z', parseFloat(coords[2]) || 0, true);
                }
            } catch (error) {
                this.adapter.log.warn(`Failed to parse coordinates: ${status.CurrenCoord}`);
            }
        }

        // Z-offset
        if (typeof status.ZOffset !== 'undefined') {
            this.adapter.setState('position.zOffset', 
                Math.round(status.ZOffset * 10000) / 10000, true);
        }

        // CRITICAL FIX: Handle lighting correctly
        if (status.LightStatus) {
            this.adapter.setState('lights.chamber', !!status.LightStatus.SecondLight, true);
            
            if (status.LightStatus.RgbLight && Array.isArray(status.LightStatus.RgbLight)) {
                if (status.LightStatus.RgbLight.length >= 3) {
                    this.adapter.setState('lights.rgb.r', status.LightStatus.RgbLight[0] || 0, true);
                    this.adapter.setState('lights.rgb.g', status.LightStatus.RgbLight[1] || 0, true);
                    this.adapter.setState('lights.rgb.b', status.LightStatus.RgbLight[2] || 0, true);
                }
            }
        }

    } catch (error) {
        this.adapter.log.error(`Failed to update printer status: ${error.message}`);
    }
}

/**
 * Map SDCP print status codes to readable text
 */
mapPrintStatus(statusCode) {
    const statusMap = {
        0: 'Idle',
        8: 'Preparing',
        9: 'Starting', 
        10: 'Paused',
        13: 'Printing'
    };
    
    return statusMap[statusCode] || `Unknown (${statusCode})`;
}

/**
 * Format time from seconds to HH:MM:SS
 */
formatTime(seconds) {
    if (!seconds || seconds < 0) return '00:00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Handle command responses
 */
handleCommandResponse(message) {
    const cmd = message.Data.Cmd;
    const ack = message.Data.Data && message.Data.Data.Ack;
    
    if (typeof ack !== 'undefined') {
        const ackMessages = {
            0: 'Success',
            1: 'Failed/Error',
            2: 'File Not Found'
        };
        
        const ackText = ackMessages[ack] || `Unknown (${ack})`;
        this.adapter.log.debug(`Command ${cmd} response: ${ackText}`);
        
        if (ack !== 0) {
            this.adapter.log.warn(`Command ${cmd} failed with code ${ack}: ${ackText}`);
        }
    }
}

/**
 * Send printer commands via monitoring service
 */
pausePrint() {
    return this.sendCommand(129, {});
}

resumePrint() {
    return this.sendCommand(131, {});
}

cancelPrint() {
    return this.sendCommand(130, {});
}

toggleLight(lightOn = true, rgbColors = [0, 0, 0]) {
    return this.sendCommand(403, {
        LightStatus: {
            SecondLight: lightOn,
            RgbLight: rgbColors
        }
    });
}
```

}

module.exports = MonitoringService;
