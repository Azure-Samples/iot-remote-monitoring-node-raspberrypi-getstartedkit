'use strict';

var CONFIG_LEDPIN = 7; // Define led pin
var wpi = require('wiring-pi');
wpi.setup('wpi');
wpi.pinMode(CONFIG_LEDPIN, wpi.OUTPUT);

class BME280 {

	readRegisterNBytes(reg, count) {
		var data = new Uint8Array(count+1);
		data.fill(0);
		var addr = data[0] = (((reg>>0) & 0x7F)|0x80);
		wpi.wiringPiSPIDataRW(0, data);
		const retbuf = data.subarray(1);
		//console.log("R->Addr:("+addr+")="+retbuf.toString());
		return retbuf;
	}

	writeRegister(reg, data) {
		const val = [(reg) & 0x7F, data];
		const uint8Data = Uint8Array.from(val);
		wpi.wiringPiSPIDataRW(0, uint8Data);
		//if(this.readRegisterNBytes(reg,1)[0] == data){
		//	console.log("Write:0x"+reg.toString(16)+"=0x"+data.toString(16));
		//}
	}


  constructor(options) {

	wpi.wiringPiSPISetup(0, 5000);
	this.wire = wpi;

    this.I2C_ADDRESS_B   = 0x76;
    this.I2C_ADDRESS_A   = 0x77;
    this.CHIP_ID         = 0x58;

    this.REGISTER_DIG_T1 = 0x88;
    this.REGISTER_DIG_T2 = 0x8A;
    this.REGISTER_DIG_T3 = 0x8C;

    this.REGISTER_DIG_P1 = 0x8E;
    this.REGISTER_DIG_P2 = 0x90;
    this.REGISTER_DIG_P3 = 0x92;
    this.REGISTER_DIG_P4 = 0x94;
    this.REGISTER_DIG_P5 = 0x96;
    this.REGISTER_DIG_P6 = 0x98;
    this.REGISTER_DIG_P7 = 0x9A;
    this.REGISTER_DIG_P8 = 0x9C;
    this.REGISTER_DIG_P9 = 0x9E;

    this.REGISTER_DIG_H1 = 0xA1;
    this.REGISTER_DIG_H2 = 0xE1;
    this.REGISTER_DIG_H3 = 0xE3;
    this.REGISTER_DIG_H4 = 0xE4;
    this.REGISTER_DIG_H5 = 0xE5;
    this.REGISTER_DIG_H6 = 0xE7;

    this.REGISTER_CHIPID = 0xD0;
    this.REGISTER_RESET  = 0xE0;

    this.REGISTER_CONTROL_HUM   = 0xF2;
    this.REGISTER_CONTROL       = 0xF4;
    this.REGISTER_PRESSURE_DATA = 0xF7;
    this.REGISTER_TEMP_DATA     = 0xFA;
    this.REGISTER_HUMIDITY_DATA = 0xFD;
  }

  init() {
    this.writeRegister( this.REGISTER_CHIPID, 0);
	var chipId = this.readRegisterNBytes(this.REGISTER_CHIPID, 1)[0];
	console.log("Version="+chipId);
	if( chipId !== 0x56 &&
		chipId !== 0x57 &&
		chipId !== 0x58 &&
		chipId !== 0x60) {
			return -1;
     }else {
		this.loadCalibration();
		// Humidity 16x oversampling
		this.writeRegister( this.REGISTER_CONTROL_HUM, 0b00000101);
		this.writeRegister( this.REGISTER_CONTROL,     0b10110111);
  }
}
  // reset()
  //
  // Perform a power-on reset procedure. You will need to call init() following a reset()
  //
  reset() {
    this.writeRegister( this.REGISTER_RESET, this.POWER_ON_RESET_CMD);
  }

  readSensorData() {
    if(!this.cal) {
        return -1;
      }

      // Grab temperature, humidity, and pressure in a single read
      //
    var buffer = this.readRegisterNBytes(this.REGISTER_PRESSURE_DATA, 8);
		
  

        // Temperature (temperature first since we need t_fine for pressure and humidity)
        //
        let adc_T = BME280.uint20(buffer[3], buffer[4], buffer[5]);
        let tvar1 = ((((adc_T >> 3) - (this.cal.dig_T1 << 1))) * this.cal.dig_T2) >> 11;
        let tvar2  = (((((adc_T >> 4) - this.cal.dig_T1) * ((adc_T >> 4) - this.cal.dig_T1)) >> 12) * this.cal.dig_T3) >> 14;
        let t_fine = tvar1 + tvar2;

        let temperature_C = ((t_fine * 5 + 128) >> 8) / 100;

        // Pressure
        //
        let adc_P = BME280.uint20(buffer[0], buffer[1], buffer[2]);
        let pvar1 = t_fine / 2 - 64000;
        let pvar2 = pvar1 * pvar1 * this.cal.dig_P6 / 32768;
        pvar2 = pvar2 + pvar1 * this.cal.dig_P5 * 2;
        pvar2 = pvar2 / 4 + this.cal.dig_P4 * 65536;
        pvar1 = (this.cal.dig_P3 * pvar1 * pvar1 / 524288 + this.cal.dig_P2 * pvar1) / 524288;
        pvar1 = (1 + pvar1 / 32768) * this.cal.dig_P1;

        let pressure_hPa = 0;

        if(pvar1 !== 0) {
          let p = 1048576 - adc_P;
          p = ((p - pvar2 / 4096) * 6250) / pvar1;
          pvar1 = this.cal.dig_P9 * p * p / 2147483648;
          pvar2 = p * this.cal.dig_P8 / 32768;
          p = p + (pvar1 + pvar2 + this.cal.dig_P7) / 16;

          pressure_hPa = p / 100;
        }

        // Humidity (available on the BME280, will be zero on the BMP280 since it has no humidity sensor)
        //
        let adc_H = BME280.uint16(buffer[6], buffer[7]);

        let h = t_fine - 76800;
        h = (adc_H - (this.cal.dig_H4 * 64 + this.cal.dig_H5 / 16384 * h)) *
            (this.cal.dig_H2 / 65536 * (1 + this.cal.dig_H6 / 67108864 * h * (1 + this.cal.dig_H3 / 67108864 * h)));
        h = h * (1 - this.cal.dig_H1 * h / 524288);

        let humidity = (h > 100) ? 100 : (h < 0 ? 0 : h);

		//console.log(buffer.toString("hex") +" P="+pressure_hPa +" T="+temperature_C + " H="+humidity);

		return {
          temperature_C : temperature_C,
          humidity      : humidity,
          pressure_hPa  : pressure_hPa
        };
  }

	loadCalibration() {


		let h1   = this.readRegisterNBytes(this.REGISTER_DIG_H1, 1)[0];
		var buffer = this.readRegisterNBytes(this.REGISTER_DIG_H2, 7);
		let h2   = BME280.uint16( buffer[1], buffer[0] );
		let h3   = buffer[2];
		let h4   = buffer[3];
		let h5   = buffer[4];
		let h5_1 = buffer[5];
		let h6   = buffer[6];

		buffer = this.readRegisterNBytes(this.REGISTER_DIG_T1, 24);
		this.cal = {
			dig_T1: BME280.uint16(buffer[1], buffer[0]),
			dig_T2: BME280.int16(buffer[3], buffer[2]),
			dig_T3: BME280.int16(buffer[5], buffer[4]),

			dig_P1: BME280.uint16(buffer[7], buffer[6]),
			dig_P2: BME280.int16(buffer[9], buffer[8]),
			dig_P3: BME280.int16(buffer[11], buffer[10]),
			dig_P4: BME280.int16(buffer[13], buffer[12]),
			dig_P5: BME280.int16(buffer[15], buffer[14]),
			dig_P6: BME280.int16(buffer[17], buffer[16]),
			dig_P7: BME280.int16(buffer[19], buffer[18]),
			dig_P8: BME280.int16(buffer[21], buffer[20]),
			dig_P9: BME280.int16(buffer[23], buffer[22]),

			dig_H1: h1,
			dig_H2: h2,
			dig_H3: h3,
			dig_H4: (h4 << 4) | (h5 & 0xF),
			dig_H5: (h5_1 << 4) | (h5 >> 4),
			dig_H6: h6
		};
		
		//console.log("Cali="+buffer.toString("hex"));
		//console.log(`Cali= ${JSON.stringify(this.cal, null, 2)}`);
	}


  static int16(msb, lsb) {
    let val = BME280.uint16(msb, lsb);
    return val > 32767 ? (val - 65536) : val;
  }

  static uint16(msb, lsb) {
    return msb << 8 | lsb;
  }

  static uint20(msb, lsb, xlsb) {
    return ((msb << 8 | lsb) << 8 | xlsb) >> 4;
  }

  static convertCelciusToFahrenheit(c) { 
    return c * 9 / 5 + 32;
  }

  static convertHectopascalToInchesOfMercury(hPa) {
    return hPa * 0.02952998751;
  }

  static convertMetersToFeet(m) {
    return m * 3.28084;
  }

  static calculateHeatIndexCelcius(temperature_C, humidity) {
    return -8.784695 + 1.61139411 * temperature_C + 2.33854900 * humidity +
           -0.14611605 * temperature_C * humidity + -0.01230809 * Math.pow(temperature_C, 2) +
           -0.01642482 * Math.pow(humidity, 2) + 0.00221173 * Math.pow(temperature_C, 2) * humidity +
           0.00072546 * temperature_C * Math.pow(humidity, 2) +
           -0.00000358 * Math.pow(temperature_C, 2) * Math.pow(humidity, 2);
  }

  static calculateDewPointCelcius(temperature_C, humidity) {
    return 243.04 * (Math.log(humidity/100.0) + ((17.625 * temperature_C)/(243.04 + temperature_C))) / 
           (17.625 - Math.log(humidity/100.0) - ((17.625 * temperature_C)/(243.04 + temperature_C)));
  }

  static calculateAltitudeMeters(pressure_hPa, seaLevelPressure_hPa) {
    if(!seaLevelPressure_hPa) {
      seaLevelPressure_hPa = 1013.25;
    }

    return (1.0 - Math.pow(pressure_hPa / seaLevelPressure_hPa, (1 / 5.2553))) * 145366.45 * 0.3048;
  }

}
module.exports = BME280;


//var bme = new BME280(wpi);
//bme.reset();
//bme.init();
//
//const readSensorData = () => {
//	var data = bme.readSensorData();
//	console.log(`data = ${JSON.stringify(data, null, 2)}`);
//	setTimeout(readSensorData, 1000);
//};
//
//setTimeout(readSensorData, 2000);

