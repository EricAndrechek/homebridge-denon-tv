const fs = require('fs');
const fsPromises = fs.promises;
const EventEmitter = require('events');
const axios = require('axios');
const parseStringPromise = require('xml2js').parseStringPromise;

const API_URL = {
    'UPNP': ':60006/upnp/desc/aios_device/aios_device.xml',
    'DeviceInfo': '/goform/Deviceinfo.xml',
    'MainZone': '/goform/formMainZone_MainZoneXml.xml',
    'MainZoneStatus': '/goform/formMainZone_MainZoneXmlStatus.xml',
    'MainZoneStatusLite': '/goform/formMainZone_MainZoneXmlStatusLite.xml',
    'Zone2Status': '/goform/forZone2_Zone2XmlStatus.xml',
    'Zone2StatusLite': '/goform/formZone2_Zone2XmlStatusLite.xml',
    'Zone3Status': '/goform/forZone3_Zone3XmlStatus.xml',
    'Zone3StatusLite': '/goform/formZone3_Zone3XmlStatusLite.xml',
    'Zone4Status': '/goform/forZone4_Zone4XmlStatus.xml',
    'Zone4StatusLite': '/goform/formZone4_Zone4XmlStatusLite.xml',
    'SoundModeStatus': '/goform/formMainZone_MainZoneXmlStatusLite.xml',
    'TunerStatus': '/goform/formTuner_TunerXml.xml',
    'iPhoneDirect': '/goform/formiPhoneAppDirect.xml?',
    'AppCommand': '/goform/AppCommand.xml',
    'AppCommand300': '/goform/AppCommand0300.xml',
    'NetAudioStatusS': '/goform/formNetAudio_StatusXml.xml',
    'HdTunerStatus': '/goform/formTuner_HdXml.xml',
    'NetAudioCommandPost': '/NetAudio/index.put.asp'
}

class DENON extends EventEmitter {
    constructor(config) {
        super();
        this.host = config.host;
        this.port = config.port;
        this.zoneControl = config.zoneControl;
        this.devInfoFile = config.devInfoFile;
        this.apiUrl = [API_URL.MainZoneStatusLite, API_URL.Zone2StatusLite, API_URL.Zone3StatusLite, API_URL.SoundModeStatus][this.zoneControl];

        const url = (`http://${this.host}:${this.port}`);
        this.axiosInstance = axios.create({
            method: 'GET',
            baseURL: url
        });

        this.isConnected = false;
        this.power = false;
        this.reference = '';
        this.volume = 0;
        this.mute = false;
        this.checkStateOnFirstRun = false;

        this.connect();
    };

    async getDeviceInfoUpnp() {
        try {
            const deviceInfoUpnp = await axios.get(`http://${this.host}${API_URL.UPNP}`);
            const parseDeviceInfoUpnp = await parseStringPromise(deviceInfoUpnp.data);
            this.emit('debug', `parseDeviceInfoUpnp: ${parseDeviceInfoUpnp.root.device[0]}`);
            this.emit('deviceInfoUpnp', parseDeviceInfoUpnp);
        } catch (error) {
            this.emit('error', `device info upnp error: ${error}`);

            setTimeout(() => {
                this.connect();
            }, 5000);
        };
    };

    async getDeviceInfo() {
        try {
            const deviceInfo = await this.axiosInstance(API_URL.DeviceInfo);
            const parseDeviceInfo = await parseStringPromise(deviceInfo.data);
            const devInfo = JSON.stringify(parseDeviceInfo.Device_Info, null, 2);
            const writeDevInfo = (this.zoneControl == 0) ? await fsPromises.writeFile(this.devInfoFile, devInfo) : false;
            this.emit('debug', `parseDeviceInfo: ${deviceInfo.data}`);
            this.emit('connect', 'Connected.');
            this.emit('deviceInfo', parseDeviceInfo);
            this.isConnected = true;
            this.updateDeviceState();
        } catch (error) {
            this.emit('error', `device info error: ${error}`);

            setTimeout(() => {
                this.connect();
            }, 5000);
        };
    };

    updateDeviceState() {
        this.checkStateOnFirstRun = true;
        this.checkState = setInterval(async () => {
            try {
                const deviceStateData = await this.axiosInstance(this.apiUrl);
                const parseDeviceStateData = await parseStringPromise(deviceStateData.data);
                const power = (parseDeviceStateData.item.Power[0].value[0] == 'ON');
                const reference = (this.zoneControl <= 2) ? (parseDeviceStateData.item.InputFuncSelect[0].value[0] == 'Internet Radio') ? 'IRADIO' : (parseDeviceStateData.item.InputFuncSelect[0].value[0] == 'AirPlay') ? 'NET' : parseDeviceStateData.item.InputFuncSelect[0].value[0] : this.reference;
                const volume = (parseFloat(parseDeviceStateData.item.MasterVolume[0].value[0]) >= -79.5) ? parseInt(parseDeviceStateData.item.MasterVolume[0].value[0]) + 80 : this.volume;
                const mute = power ? (parseDeviceStateData.item.Mute[0].value[0] == 'on') : true;
                if (this.checkStateOnFirstRun == true || power != this.power || reference != this.reference || volume != this.volume || mute != this.mute) {
                    this.emit('debug', `deviceStateData: ${deviceStateData.data}`);
                    this.emit('deviceState', power, reference, volume, mute);
                    this.power = power;
                    this.reference = reference;
                    this.volume = volume;
                    this.mute = mute;
                    this.checkStateOnFirstRun = false;
                };
            } catch (error) {
                this.emit('error', `update device state error: ${error}`);
                this.isConnected = false;
                this.emit('deviceState', false, '', 0, true);
                this.emit('disconnect', 'Disconnected.');
                clearInterval(this.checkState);
                this.connect();
            };
        }, 750)
    };

    send(apiUrl) {
        return new Promise(async (resolve, reject) => {
            try {
                const sendCommand = await this.axiosInstance(apiUrl);
                this.emit('message', `send command: ${apiUrl}`);
                resolve(true);
            } catch (error) {
                this.emit('error', `send command error: ${error}`);
                reject(error);
            };
        });
    };

    connect() {
        if (!this.isConnected) {
            this.getDeviceInfo();
        };
    };
};
module.exports = DENON;