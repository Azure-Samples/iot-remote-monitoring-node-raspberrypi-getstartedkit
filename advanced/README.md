# Advanced

This sample will show you how to initiate firmware update by Azure Remote Monitoring solution and download a per-compiled executable file for demo purpose.

## Folder introduction

### 1.0

The sample code is the beginning for firmware update scenario.


### 2.0

The folder contains the new files for updating process, it contains only one file:


- raspberry.js
	
	This file will execute after reboot operation, the getVersion function will return "2.0".

### config

This folder contains a configuration file and a log file.

- deviceinfo

	This file should be updated with the real device's id and connection string.
