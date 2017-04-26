'use strict';


var Protocol = require('azure-iot-device-mqtt').Mqtt;
var Client = require('azure-iot-device').Client;
var ConnectionString = require('azure-iot-device').ConnectionString;
var Message = require('azure-iot-device').Message;

var connectionString =
    'HostName=[IoTHubName].azure-devices.net;DeviceId=[Device Id];SharedAccessKey=[Device Key]';
var deviceId = ConnectionString.parse(connectionString).DeviceId;

var temperature = 50;
var humidity = 50;
var externalTemperature = 55;

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
  'Version': '1.0',
  'DeviceProperties':
      {'DeviceID': deviceId, 'TelemetryInterval': 1, 'HubEnabledState': true},
  'Telemetry': [
    {'Name': 'Temperature', 'DisplayName': 'Temperature', 'Type': 'double'},
    {'Name': 'Humidity', 'DisplayName': 'Humidity', 'Type': 'double'}
  ],
};

// SupportedMethods key is a must, other kyes are just for demonstration.
var reportedProperties = {
  'Config': {'TemperatureMeanValue': 56.7, 'TelemetryInterval': 45},
  'System': {
    'Manufacturer': 'Nodejs SDK',
    'FirmwareVersion': '1.0',
    'InstalledRAM': '8 MB',
    'ModelNumber': 'DB-14',
    'Platform': 'Plat 9.75',
    'Processor': 'ArmV7',
    'SerialNumber': 'SER99'
  },
  'SupportedMethods': {
    'ChangeLightStatus--LightStatusValue-int':
        'Change light status, 0 light off, 1 light on',
    'LightBlink': 'Blink Light'
  },
};

function onChangeLightStatus(request, response) {
  console.log('Raspberry Pi simulated light status change\n');

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
  console.log('Raspberry Pi simulated light blink\n');

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

var client = Client.fromConnectionString(connectionString, Protocol);
client.open(function(err) {
  if (err) {
    printErrorFor('open')(err);
  } else {
    console.log('Sending device metadata:\n' + JSON.stringify(deviceMetaData));
    client.sendEvent(
        new Message(JSON.stringify(deviceMetaData)),
        printErrorFor('send metadata'));

    // Create device twin
    client.getTwin(function(err, twin) {
      if (err) {
        console.error('Could not get device twin');
      } else {
        console.log('Device twin created');

        twin.on('properties.desired', function(delta) {
          console.log('Received new desired properties:');
          console.log(JSON.stringify(delta));
        });

        // Send reported properties
        twin.properties.reported.update(reportedProperties, function(err) {
          if (err) throw err;
          console.log('twin state reported');
        });

        // Register handlers for direct methods
        client.onDeviceMethod('ChangeLightStatus', onChangeLightStatus);
        client.onDeviceMethod('LightBlink', onLightBlink);
      }
    });

    // Start sending telemetry
    var sendInterval = setInterval(function() {
      temperature += generateRandomIncrement();
      humidity += generateRandomIncrement();

      var data = JSON.stringify({
        'DeviceID': deviceId,
        'Temperature': temperature,
        'Humidity': humidity
      });

      console.log('Sending device event data:\n' + data);
      client.sendEvent(new Message(data), printErrorFor('send event'));
    }, 5000);

    client.on('error', function(err) {
      printErrorFor('client')(err);
      if (sendInterval) clearInterval(sendInterval);
      client.close(printErrorFor('client.close'));
    });
  }
});
