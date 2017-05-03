// We consider it a valid firmware if this line exists.
'use strict';


var CONFIG_LEDPIN = 7; // Define led pin

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

raspberry.updateFirmwareStep = function(step, args) {
  switch (step) {
    case 1:  // Download and verify.
      // Do not this approach in real projects, Unsafe commands may come with
      // parameters.
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
          return true;
        }
        console.log('Download OK but verify failed: ' + args);
      }
      return false;
      break;

    case 2:  // Replace old files
      shell.exec('mv raspberry.js raspberry.js_' + Date.now());
      shell.exec('mv newversion raspberry.js');
      return true;
      break;

    case 3:  // Restart
    	var cmd = 'node remote_monitoring.js > /dev/null &';
	console.log('reboot cmd:' + cmd);
	shell.exec(cmd, {async: true});
	process.exit();
      return true;
      break;
  }
};
