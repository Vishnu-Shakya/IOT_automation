// service/mqtt.js
require('dotenv').config();
const mqtt = require('mqtt');

const options = {
    host: process.env.MQTT_HOST,
    port: parseInt(process.env.MQTT_PORT),
    protocol: process.env.MQTT_PROTOCOL,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD
};

const client = mqtt.connect(options);

client.on('connect', () => {
    console.log('✅ Connected to MQTT broker');

    // Subscribe to all topics
    const subscribePattern = process.env.MQTT_TOPIC_SUBSCRIBE_ALL || '#';
    const qosLevel = parseInt(process.env.MQTT_QOS_LEVEL) || 1;

    client.subscribe(subscribePattern, { qos: qosLevel }, (err) => {
        if (err) {
            console.error('❌ Subscription error:', err.message);
        } else {
            console.log(`📡 Subscribed to ${subscribePattern}`);
        }
    });
});

client.on('error', (err) => {
    console.error('❌ MQTT error:', err.message);
});

// Publish helper
function publish(topic, message) {
    const qosLevel = parseInt(process.env.MQTT_QOS_LEVEL) || 1;

    client.publish(topic, message, { qos: qosLevel }, (err) => {
        if (err) {
            console.error(`❌ Publish failed on ${topic}:`, err.message);
        } else {
            console.log(`➡️ Published "${message}" to ${topic}`);
        }
    });
}

// Subscribe handler for server.js
function onMessage(callback) {
    client.on('message', (topic, message) => {
        callback(topic, message.toString());
    });
}

module.exports = { publish, onMessage };
