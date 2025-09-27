require('dotenv').config();
const express = require('express');
const { publish, onMessage } = require('./service/mqtt');

const app = express();
const port = process.env.SERVER_PORT || 3000;

app.use(express.json());

let stateBits = "000000";

// Decode helper
function decodeState(bits) {
    const devices = ['ac', 'fan', 'light'];
    const props = { status: ['off', 'on'], mode: ['auto', 'manual'] };

    let decoded = {};
    devices.forEach((d, i) => {
        const s = parseInt(bits[i * 2]);
        const m = parseInt(bits[i * 2 + 1]);
        decoded[d] = {
            status: props.status[s],
            mode: props.mode[m]
        };
    });
    return decoded;
}

onMessage((topic, msg) => {
    const arduinoStatusTopic = process.env.MQTT_TOPIC_ARDUINO_STATUS || 'home/status/arduino';

    if (topic === arduinoStatusTopic) {
        if (/^[01]{6}$/.test(msg)) {
            stateBits = msg;
            console.log(`⬅️ Confirmed stateBits from Arduino: ${stateBits}`);
        } else {
            console.warn(`⚠️ Ignored invalid Arduino payload: ${msg}`);
        }
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// Get current status
app.get('/status', (req, res) => {
    console.log(req.method, req.url);
    res.json({
        bits: stateBits,
        devices: decodeState(stateBits)
    });
});

app.post('/status', (req, res) => {
    const { data } = req.body;

    if (!data || data.length !== 6 || !/^[01]{6}$/.test(data)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid data format. Provide a 6-bit string (e.g., "101010").'
        });
    }

    // Publish update to Arduino
    const deviceStatusTopic = process.env.MQTT_TOPIC_DEVICE_STATUS || 'home/devices/status';
    publish(deviceStatusTopic, data);

    res.json({
        success: true,
        message: 'Command sent to Arduino, waiting for confirmation...',
        sentData: data,
        currentBits: stateBits
    });
});

// Start server
app.listen(port, () => {
    console.log(`✅ Server running at http://localhost:${port}`);
});
