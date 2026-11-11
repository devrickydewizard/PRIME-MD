const pino = require('pino');
const NodeCache = require('node-cache');
const { makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys");
const { cachedGroupMetadata } = require('./groupCache');

const _userDevicesCache = new NodeCache({ stdTTL: 1800, useClones: false });

const createSocketConfig = (version, state, logger) => {
    return {
        version,
        logger: pino({ level: 'silent' }),
        browser: ['macOS', 'Chrome', '122.0.0'],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        cachedGroupMetadata,
        userDevicesCache: _userDevicesCache,
        connectTimeoutMs: 15000,
        defaultQueryTimeoutMs: 20000,
        keepAliveIntervalMs: 20000,
        fireInitQueries: false,
        // ✅ FIX: ye hi asal wajah thi "always online" dikhne ki — true hone
        // par Baileys khud connect/reconnect pe forcefully "available"
        // presence broadcast kar deta tha, jo har message-level Presence()
        // control ko override kar deta tha
        markOnlineOnConnect: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        retryRequestDelayMs: 50,
        maxMsgRetryCount: 2,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined,
        emitOwnEvents: true,
        patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(
                message.buttonsMessage ||
                message.templateMessage ||
                message.listMessage
            );
            if (requiresPatch) {
                message = {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadataVersion: 2,
                                deviceListMetadata: {},
                            },
                            ...message,
                        },
                    },
                };
            }
            return message;
        }
    };
};

module.exports = { createSocketConfig };
