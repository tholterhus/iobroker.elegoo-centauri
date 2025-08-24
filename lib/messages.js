// lib/messages.js
// This file defines the status and error codes received from the printer.
// The keys are used for translation and internal logic.

const STATUS_CODES = {
    0: 'IDLE',
    1: 'HOMING',
    2: 'DROPPING',
    3: 'PRINTING',
    4: 'LIFTING',
    5: 'PAUSING',
    6: 'PAUSED',
    7: 'STOPPING',
    8: 'STOPPED',
    9: 'COMPLETE',
    10: 'FILE_CHECKING',
    12: 'RECOVERY',
    13: 'PRINTING', // Alternate code for PRINTING
    15: 'LOADING',
    16: 'LOADING', // Alternate code for LOADING
    18: 'LOADING', // Alternate code for LOADING
    19: 'LOADING', // Alternate code for LOADING
    20: 'LOADING', // Alternate code for LOADING
    21: 'LOADING', // Alternate code for LOADING
};

const ERROR_CODES = {
    101: 'ERROR_BED_HEAT_FAILED',
    102: 'ERROR_BED_NTC',
    103: 'ERROR_NOZZLE_HEAT_FAILED',
    104: 'ERROR_NOZZLE_NTC',
    502: 'ERROR_LEVELING_SENSOR',
    701: 'ERROR_FAN_MAINBOARD',
    702: 'ERROR_FAN_HEATBREAK',
    703: 'ERROR_FAN_MODEL',
    // Add more error codes here
};

module.exports = { STATUS_CODES, ERROR_CODES };
