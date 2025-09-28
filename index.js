require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { publish, onMessage } = require('./service/mqtt');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Temperature storage
let lastTemperatureReading = {
    value: null,
    timestamp: null,
    status: 'initializing'
};

let stateBits = "000000";

// ThingSpeak configuration
const THINGSPEAK_CHANNEL_ID = process.env.THINGSPEAK_CHANNEL_ID || 'your_channel_id';
const THINGSPEAK_READ_API_KEY = process.env.THINGSPEAK_READ_API_KEY || 'your_read_api_key';
const THINGSPEAK_FIELD = process.env.THINGSPEAK_FIELD || 'field1'; // field where temperature is stored
const TEMPERATURE_FETCH_INTERVAL = process.env.TEMPERATURE_FETCH_INTERVAL || 30000; // 30 seconds default

// Function to fetch temperature from ThingSpeak
async function fetchTemperatureFromThingSpeak() {
    try {
        console.log('Fetching temperature from ThingSpeak...');
        const response = await axios.get(`https://api.thingspeak.com/channels/${THINGSPEAK_CHANNEL_ID}/feeds/last.json`, {
            params: {
                api_key: THINGSPEAK_READ_API_KEY
            }
        });

        if (response.data && response.data[THINGSPEAK_FIELD]) {
            const temperature = parseFloat(response.data[THINGSPEAK_FIELD]);
            const timestamp = new Date(response.data.created_at);

            lastTemperatureReading = {
                value: temperature,
                timestamp: timestamp,
                status: 'success',
                lastFetch: new Date()
            };

            console.log(`Temperature updated: ${temperature}°C at ${timestamp}`);
            return {
                temperature: temperature,
                timestamp: timestamp,
                success: true
            };
        } else {
            lastTemperatureReading.status = 'no_data';
            return {
                temperature: null,
                timestamp: null,
                success: false,
                error: 'No temperature data found'
            };
        }
    } catch (error) {
        console.error('Error fetching temperature from ThingSpeak:', error.message);
        lastTemperatureReading.status = 'error';
        lastTemperatureReading.error = error.message;
        lastTemperatureReading.lastFetch = new Date();
        return {
            temperature: null,
            timestamp: null,
            success: false,
            error: error.message
        };
    }
}

// Function to start periodic temperature fetching
function startTemperatureService() {
    console.log(`Starting temperature service with ${TEMPERATURE_FETCH_INTERVAL}ms interval`);

    // Fetch immediately on startup
    fetchTemperatureFromThingSpeak();

    // Set up periodic fetching
    setInterval(async () => {
        await fetchTemperatureFromThingSpeak();
    }, TEMPERATURE_FETCH_INTERVAL);
}

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
// Routes
app.get('/status', (req, res) => {
    res.json({
        message: 'Smart Home Energy Management Server is running',
        timestamp: new Date().toISOString(),
        mqtt: {
            status: 'connected', // You can get actual MQTT status from mqttService
        },
        temperature: {
            value: lastTemperatureReading.value,
            unit: '°C',
            timestamp: lastTemperatureReading.timestamp,
            lastFetch: lastTemperatureReading.lastFetch,
            source: 'ThingSpeak',
            status: lastTemperatureReading.status,
            error: lastTemperatureReading.error || null
        }
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
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);

    // Start temperature service
    startTemperatureService();
});
