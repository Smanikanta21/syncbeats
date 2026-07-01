package com.example.syncbeats.network

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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
            socket = IO.socket("http://192.168.29.61:4000", opts)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "Socket connected: ${socket?.id()}")
                
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
        payload.put("message", "Ping from Android!")
        socket?.emit("device:ping", payload)
    }
    
    // MARK: - SyncBeat Mode (Personal Room)
    
    private val _isSyncBeatMode = MutableStateFlow(false)
    val isSyncBeatMode: StateFlow<Boolean> = _isSyncBeatMode.asStateFlow()

    fun toggleSyncBeatMode(context: android.content.Context) {
        if (_isSyncBeatMode.value) {
            leavePersonalRoom()
        } else {
            joinPersonalRoom(context)
        }
    }
    
    private fun joinPersonalRoom(context: android.content.Context) {
        val session = com.example.syncbeats.data.SessionManager(context)
        val userId = session.fetchUserId() ?: return
        
        _isSyncBeatMode.value = true
        val roomId = "personal_room_$userId"
        
        val payload = org.json.JSONObject().apply {
            put("roomId", roomId)
            put("userId", userId)
            put("displayName", "Android App")
        }
        
        socket?.emit("room:join", payload)
        
        if (socket != null) {
            ClockSyncManager.startSyncing(socket!!)
        }
        
        setupPlaybackListeners()
    }
    
    private fun leavePersonalRoom() {
        _isSyncBeatMode.value = false
        socket?.emit("room:leave")
        ClockSyncManager.stopSyncing()
        removePlaybackListeners()
    }
    
    // Event flow for incoming playback events
    private val _playbackScheduleFlow = MutableSharedFlow<org.json.JSONObject>()
    val playbackScheduleFlow = _playbackScheduleFlow.asSharedFlow()
    
    private val _playbackPauseFlow = MutableSharedFlow<org.json.JSONObject>()
    val playbackPauseFlow = _playbackPauseFlow.asSharedFlow()
    
    private val _trackSetFlow = MutableSharedFlow<org.json.JSONObject>()
    val trackSetFlow = _trackSetFlow.asSharedFlow()

    private fun setupPlaybackListeners() {
        socket?.on("playback:schedule") { args ->
            if (args.isNotEmpty()) {
                val data = args[0] as? org.json.JSONObject
                if (data != null) {
                    GlobalScope.launch { _playbackScheduleFlow.emit(data) }
                }
            }
        }
        socket?.on("playback:pause") { args ->
            if (args.isNotEmpty()) {
                val data = args[0] as? org.json.JSONObject
                if (data != null) {
                    GlobalScope.launch { _playbackPauseFlow.emit(data) }
                }
            }
        }
        socket?.on("room:updateQueue") { args ->
            if (args.isNotEmpty()) {
                val data = args[0] as? org.json.JSONObject
                if (data != null) {
                    GlobalScope.launch { _trackSetFlow.emit(data) }
                }
            }
        }
    }
    
    private fun removePlaybackListeners() {
        socket?.off("playback:schedule")
        socket?.off("playback:pause")
        socket?.off("room:updateQueue")
    }
    
    fun emitPlaybackSchedule(context: android.content.Context, trackUrl: String, positionMs: Double, startTime: Double) {
        if (!_isSyncBeatMode.value) return
        val session = com.example.syncbeats.data.SessionManager(context)
        val userId = session.fetchUserId() ?: return
        
        val payload = org.json.JSONObject().apply {
            put("roomId", "personal_room_$userId")
            put("trackUrl", trackUrl)
            put("positionMs", positionMs)
            put("startTime", startTime)
            put("senderId", DeviceManager.deviceId)
        }
        socket?.emit("playback:schedule", payload)
    }
    
    fun emitPlaybackPause(context: android.content.Context, positionMs: Double) {
        if (!_isSyncBeatMode.value) return
        val session = com.example.syncbeats.data.SessionManager(context)
        val userId = session.fetchUserId() ?: return
        
        val payload = org.json.JSONObject().apply {
            put("roomId", "personal_room_$userId")
            put("positionMs", positionMs)
            put("senderId", DeviceManager.deviceId)
        }
        socket?.emit("playback:pause", payload)
    }

    fun emitTrackSet(context: android.content.Context, trackId: String, title: String, artist: String, thumbnailURL: String, duration: String, audioURL: String) {
        if (!_isSyncBeatMode.value) return
        val session = com.example.syncbeats.data.SessionManager(context)
        val userId = session.fetchUserId() ?: return
        
        val trackJson = org.json.JSONObject().apply {
            put("id", trackId)
            put("title", title)
            put("artist", artist)
            put("thumbnailURL", thumbnailURL)
            put("duration", duration)
            put("url", audioURL)
        }
        
        val payload = org.json.JSONObject().apply {
            put("roomId", "personal_room_$userId")
            put("track", trackJson)
            put("senderId", DeviceManager.deviceId)
        }
        socket?.emit("room:updateQueue", payload)
    }

    fun emitForceSyncAll(context: android.content.Context) {
        if (!_isSyncBeatMode.value) return
        val session = com.example.syncbeats.data.SessionManager(context)
        val userId = session.fetchUserId() ?: return
        
        val payload = org.json.JSONObject().apply {
            put("roomId", "personal_room_$userId")
        }
        socket?.emit("room:forceSync", payload)
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
    }
}
