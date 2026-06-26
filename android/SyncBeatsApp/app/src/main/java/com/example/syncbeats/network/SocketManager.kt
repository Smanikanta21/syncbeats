package com.example.syncbeats.network

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

object SocketManager {
    private const val TAG = "SocketManager"
    private var socket: Socket? = null

    // Event flow for incoming pings to be observed by UI
    private val _pingFlow = MutableSharedFlow<String>()
    val pingFlow = _pingFlow.asSharedFlow()

    fun connect() {
        if (socket?.connected() == true) return

        try {
            val opts = IO.Options()
            opts.transports = arrayOf(io.socket.engineio.client.transports.WebSocket.NAME)
            
            // Connect to backend URL using RetrofitClient's base URL logic (e.g., local IP)
            socket = IO.socket("http://192.168.29.211:4000", opts)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "Socket connected: \${socket?.id()}")
                
                // Register this device with its deviceKey to receive pings
                val payload = org.json.JSONObject()
                payload.put("deviceKey", DeviceManager.deviceId)
                socket?.emit("device:register", payload)
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.d(TAG, "Socket disconnected")
            }

            socket?.on("device:ping") { args ->
                if (args.isNotEmpty()) {
                    val data = args[0] as? org.json.JSONObject
                    val message = data?.optString("message", "Ping!") ?: "Ping!"
                    Log.d(TAG, "Received ping: \$message")
                    GlobalScope.launch {
                        _pingFlow.emit(message)
                    }
                }
            }

            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Error connecting socket", e)
        }
    }

    fun pingDevice(targetDeviceKey: String) {
        val payload = org.json.JSONObject()
        payload.put("targetDeviceKey", targetDeviceKey)
        payload.put("message", "Ping from \${android.os.Build.MODEL}!")
        socket?.emit("device:ping", payload)
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
    }
}
