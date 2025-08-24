// This function is called by the admin framework when the settings page is loaded.
function load(settings, onChange) {
    if (!settings) return;

    // Populate the fields with values from the 'settings' object.
    // Default values are used if a value is not defined.
    $('#printerIp').val(settings.printerIp |

| '192.168.178.34');
    $('#wsPort').val(settings.wsPort |

| 3030);
    $('#camPort').val(settings.camPort |

| 8080);
    $('#pollInterval').val(settings.pollInterval |

| 10);
    $('#reconnectInterval').val(settings.reconnectInterval |

| 60);
    $('#autoDiscovery').prop('checked', settings.autoDiscovery === undefined? false : settings.autoDiscovery);

    // Register the onChange callback to react to changes.
    onChange(false);
    $('.value').on('change keyup paste', function () {
        onChange(true);
    });
}

// This function is called when the user clicks "Save".
function save(callback) {
    var settings = {
        printerIp: $('#printerIp').val(),
        wsPort: parseInt($('#wsPort').val(), 10),
        camPort: parseInt($('#camPort').val(), 10),
        pollInterval: parseInt($('#pollInterval').val(), 10),
        reconnectInterval: parseInt($('#reconnectInterval').val(), 10),
        autoDiscovery: $('#autoDiscovery').prop('checked'),
    };

    // Return the 'settings' object to the admin framework to be saved.
    callback(settings);
}
