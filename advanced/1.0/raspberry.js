// We consider it a valid firmware if this line exists.
'use strict';


var CONFIG_LEDPIN = 7;  // Define led pin

var BME280 = require('./SpiBME280');
var wpi = require('wiring-pi');
var shell = require('shelljs');
shell.config.silent = true;
wpi.setup('wpi');
wpi.pinMode(CONFIG_LEDPIN, wpi.OUTPUT);

var bme = new BME280(wpi);
bme.init();

var raspberry = exports;
raspberry.getVersion = function() {
  return '1.1';
};

raspberry.getDeviceInfo = function() {
  var connectionString = '';
  try {
    var devicdInfo = shell.exec('cat ../config/deviceinfo 2>&1').stdout.split('\n');

    for (var i = 0; i < devicdInfo.length; ++i) {
      if (devicdInfo[i].indexOf('HostName=') == 0) {
        connectionString = devicdInfo[i];
        break;
      }
    }
  } catch (error) {
  }
  var deviceInfo = {ConnectionString: connectionString};
  return deviceInfo;
};


raspberry.changeLightStatus = function(value) {
  // var status = wpi.digitalRead(CONFIG_LEDPIN);
  value = (value != 0) ? 1 : 0;
  wpi.digitalWrite(CONFIG_LEDPIN, value);
};

raspberry.lightBlink = function() {
  var count = 1;
  setInterval(function() {
    if (count-- > 0) {
      wpi.digitalWrite(CONFIG_LEDPIN, 1);
      setTimeout(() => { wpi.digitalWrite(CONFIG_LEDPIN, 0); }, 100);
    } else {
      clearTimeout();
    }
  }, 300);
};


function generateRandomIncrement() {
  return ((Math.random() * 2) - 1);
}

raspberry.getSensorData = function() {
  var sensorJson;
  try {
    var data = bme.readSensorData();
    sensorJson = JSON.stringify(
        {'temperature': data.temperature_C, 'humidity': data.humidity});
  } catch (error) {
    // Generate a default number if hardware error.
    sensorJson = '{"Temperature":' + generateRandomIncrement() +
        ',"Humidity":' + generateRandomIncrement() + '}';
  }
  return JSON.parse(sensorJson);
};

var updateStart;
var deviceTwin;
function uploadReport(step, result, dration, next) {
  var status;
  switch (result) {
    case -1:
      status = 'Failed';
      break;
    case 0:
      status = 'Complete';
      break;
    default:
      status = 'Running';
      break;
  }
  var report = {Method: {UpdateFirmware: {}}};
  report.Method.UpdateFirmware[step] = {
    Status: status,
    LastUpdate: Date(),
    Duration: dration
  };
  report.Method.UpdateFirmware.LastUpdate = Date();
  var timestamp = new Date().getTime();
  report.Method.UpdateFirmware.Duration = (timestamp - updateStart) / 1000;
  if (result == -1)
    report.Method.UpdateFirmware.Status = status;
  else
    report.Method.UpdateFirmware.Status = 'Running';

  deviceTwin.properties.reported.update(report, function(err) {
    if (err) throw err;
    console.log('twin state reported:(' + step + '=' + status + ')');
    if (next) next();
  });
}

raspberry.updateFirmwareStep = function(twin, step, args, next) {
  switch (step) {
    case 1:  // Download and verify.
      // Do not this approach in real projects, Unsafe commands may come with
      // parameters.
      updateStart = new Date().getTime();
      deviceTwin = twin;
      uploadReport('Download', 1, 0, () => {

        var returnString =
            shell.exec('wget -O newversion "' + args + '" 2>&1').stdout;
        var suffix = returnString.substr(-20);
        if (　returnString.indexOf('Saving to:') != -1 &&
            suffix.indexOf('saved') != -1) {
          returnString = shell.exec('cat newversion 2>&1').stdout;
          if (returnString.indexOf(
                  '// We consider it a valid firmware if this line exists.') ==
              0) {
            console.log('Download and verify OK: ' + args);

            var downloadEnds = new Date().getTime();
            uploadReport(
                'Download', 0, (downloadEnds - updateStart) / 1000, next);
            return true;
          }
          console.log('Download OK but verify failed: ' + args);
        }
        uploadReport('Download', -1, 0);

      });

      return false;
      break;

    case 2:  // Replace old files
      uploadReport('Applied', 1, 0, () => {

        shell.exec('mv raspberry.js raspberry.js_' + Date.now());  // Backup
        shell.exec('mv newversion raspberry.js');
        uploadReport('Applied', 0, 0, next);
      });
      return true;
      break;

    case 3:  // Restart
      uploadReport('Reboot', 1, 0, () => {
        uploadReport('Reboot', 0, 0, () => {
          var cmd = 'node remote_monitoring.js "' + raspberry.connectionString +
              '" ' + updateStart + ' > /dev/null &';
          console.log('reboot cmd:' + cmd);
          shell.exec(cmd, {async: true});
          process.exit();
        });
      });
      return true;
      break;
  }
};
