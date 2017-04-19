'use strict';

var raspberry = require('./raspberry');
var Protocol = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').Client;
var ConnectionString = require('azure-iot-device').ConnectionString;
var Message = require('azure-iot-device').Message;

var connectionString = <Your connection string here:'HostName=*.azure-devices.cn;DeviceId=*;SharedAccessKey=*'>;
var deviceId = ConnectionString.parse(connectionString).DeviceId;
var sensorData = raspberry.getSensorData();

function printErrorFor(op) {
  return function printError(err) {
    if (err) console.log(op + ' error: ' + err.toString());
  };
}

function generateRandomIncrement() {
  return ((Math.random() * 2) - 1);
}

var deviceMetaData = {
  'ObjectType': 'DeviceInfo',
  'IsSimulatedDevice': 0,
  'Version': raspberry.getVersion(),
  'Temperature': parseInt(sensorData.temperature),
  'Humidity': parseInt(sensorData.humidity),
  'DeviceProperties': {'DeviceID': deviceId, 'TelemetryInterval': 1},
  'Telemetry': [
    {'Name': 'Temperature', 'DisplayName': 'Temperature', 'Type': 'double'},
    {'Name': 'Humidity', 'DisplayName': 'Humidity', 'Type': 'double'}
  ],
};

var reportedProperties = {
  'Device': {
    'DeviceState': 'normal',
    'Location': {'Latitude': 47.642877, 'Longitude': -122.125497}
  },
  'Config': {'TemperatureMeanValue': 56.7, 'TelemetryInterval': 45},
  'System': {
    'Manufacturer': 'Nodejs SDK',
    'FirmwareVersion': raspberry.getVersion(),
    'InstalledRAM': '8 MB',
    'ModelNumber': 'DB-14',
    'Platform': 'Plat 9.75',
    'Processor': 'ArmV7',
    'SerialNumber': 'SER99'
  },
  'Location': {'Latitude': 47.642877, 'Longitude': -122.125497},
  'SupportedMethods': {
    'ChangeLightStatus--LightStatusValue-int':
        'Change light status, 0 light off, 1 light on',
    'LightBlink': 'Blink Light',
    'InitiateFirmwareUpdate--FwPackageURI-string':
        'Updates device Firmware. Use parameter FwPackageURI to specifiy the URI of the firmware file, e.g. https://iotrmassets.blob.core.windows.net/firmwares/FW20.bin'
  },
};

function onChangeLightStatus(request, response) {
  raspberry.changeLightStatus(parseInt(request.payload.LightStatusValue));

  // Complete the response
  response.send(200, 'ChangeLightStatus done!', function(err) {
    if (!!err) {
      console.error(
          'An error ocurred when sending a method response:\n' +
          err.toString());
    } else {
      console.log(
          'Response to method \'' + request.methodName +
          '\' sent successfully.');
    }
  });
}

function onLightBlink(request, response) {
  raspberry.lightBlink();

  // Complete the response
  response.send(200, 'Light blink done!', function(err) {
    if (!!err) {
      console.error(
          'An error ocurred when sending a method response:\n' +
          err.toString());
    } else {
      console.log(
          'Response to method \'' + request.methodName +
          '\' sent successfully.');
    }
  });
}


function onInitiateFirmwareUpdate(request, response) {
  console.log('Download firmware from: ' + request.payload.FwPackageURI);
  // First Step: download firmware.
  var result = raspberry.updateFirmwareStep(1, request.payload.FwPackageURI);
  if (result) {
    // Complete the response
    response.send(200, 'Firmware update initiated', function(err) {
      if (!!err) {
        console.error(
            'An error ocurred when sending a method response:\n' +
            err.toString());
      } else {
        console.log(
            'Response to method \'' + request.methodName +
            '\' sent successfully.');
      }
    });

    // Step2 is replacing files, Step3 is restarting.
    // We assume that both the two steps are always correct, because they are
    // doing only local operations.
    result = raspberry.updateFirmwareStep(2);
    result = raspberry.updateFirmwareStep(3);
    process.exit();
  } else {
    // Complete the response
    response.send(500, 'Firmware download failed', function(err) {
      if (!!err) {
        console.error(
            'An error ocurred when sending a method response:\n' +
            err.toString());
      } else {
        console.log(
            'Response download error to method \'' + request.methodName +
            '\'.');
      }
    });
  }
}

var client = Client.fromConnectionString(connectionString, Protocol);

client.open(function(err) {
  if (err) {
    printErrorFor('open')(err);
  } else {
    console.log('Sending device metadata:\n' + JSON.stringify(deviceMetaData));
    client.sendEvent(
        new Message(JSON.stringify(deviceMetaData)),
        printErrorFor('send metadata'));

    var updateEvent =
        function() {
      sensorData = raspberry.getSensorData();
      var data = JSON.stringify({
        'DeviceID': deviceId,
        'Temperature': sensorData.temperature,
        'Humidity': sensorData.humidity
      });

      console.log('Sending device event data:\n' + data);
      client.sendEvent(new Message(data), printErrorFor('send event'));
    }

    // Start sending telemetry
    var sendInterval = setInterval(function() { updateEvent(); }, 1000);

    // Create device twin
    client.getTwin(function(err, twin) {
      if (err) {
        console.error('Could not get device twin');
      } else {
        console.log('Device twin created');

        twin.on('properties.desired', function(delta) {
          var interval = parseInt(delta.TelemetryInterval);
          if (interval != 0) {
            clearInterval(sendInterval);
            sendInterval =
                setInterval(function() { updateEvent(); }, interval * 1000);
            deviceMetaData.DeviceProperties.TelemetryInterval = interval;
            reportedProperties.Config.TelemetryInterval = interval;
            // Update reported properties
            twin.properties.reported.update(reportedProperties, function(err) {
              if (err) throw err;
              console.log('twin state reported');
            });
          }
          console.log(
              'Received new desired properties:' + JSON.stringify(delta));
        });

        // Send reported properties
        twin.properties.reported.update(reportedProperties, function(err) {
          if (err) throw err;
          console.log('twin state reported');
        });

        // Register handlers for direct methods
        client.onDeviceMethod('ChangeLightStatus', onChangeLightStatus);
        client.onDeviceMethod('LightBlink', onLightBlink);
        client.onDeviceMethod(
            'InitiateFirmwareUpdate', onInitiateFirmwareUpdate);
      }
    });

    client.on('error', function(err) {
      printErrorFor('client')(err);
      if (sendInterval) clearInterval(sendInterval);
      client.close(printErrorFor('client.close'));
    });
  }
});
