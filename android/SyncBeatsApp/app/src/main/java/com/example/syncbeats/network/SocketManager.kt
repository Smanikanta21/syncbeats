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

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    fun connect() {
        if (socket?.connected() == true) return

        try {
            val opts = IO.Options()
            opts.transports = arrayOf(io.socket.engineio.client.transports.WebSocket.NAME)
            // Connect to backend URL using RetrofitClient's base URL logic (e.g., local IP)
            socket = IO.socket("http://192.168.29.61:4000", opts)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "Socket connected: ${socket?.id()}")
                _isConnected.value = true
                
                // Register this device with its deviceKey and userId to receive pings and syncs
                val payload = org.json.JSONObject()
                payload.put("deviceKey", DeviceManager.deviceId)
                
                val session = com.example.syncbeats.data.SessionManager(DeviceManager.appContext)
                val userId = session.fetchUserId()
                if (userId != null) {
                    payload.put("userId", userId)
                }
                
                socket?.emit("device:register", payload)
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.d(TAG, "Socket disconnected")
                _isConnected.value = false
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
            
            socket?.on("sync:forceEnable") { args ->
                GlobalScope.launch(kotlinx.coroutines.Dispatchers.Main) {
                    if (!_isSyncBeatMode.value) {
                        _isSyncBeatMode.value = true
                        joinPersonalRoom(DeviceManager.appContext)
                    }
                }
            }

            socket?.connect()
        } catch (e: Exception) {
            Log.e(TAG, "Error connecting socket", e)
        }
    }
    
    fun registerDevice() {
        val payload = org.json.JSONObject()
        payload.put("deviceKey", DeviceManager.deviceId)
        
        val session = com.example.syncbeats.data.SessionManager(DeviceManager.appContext)
        val userId = session.fetchUserId()
        if (userId != null) {
            payload.put("userId", userId)
        }
        
        socket?.emit("device:register", payload)
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
            leavePersonalRoom(context)
        } else {
            joinPersonalRoom(context)
            socket?.emit("sync:forceAll")
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
    
    private fun leavePersonalRoom(context: android.content.Context) {
        _isSyncBeatMode.value = false
        val session = com.example.syncbeats.data.SessionManager(context)
        val userId = session.fetchUserId()
        if (userId != null) {
            val payload = org.json.JSONObject().apply {
                put("roomId", "personal_room_$userId")
            }
            socket?.emit("room:leave", payload)
        } else {
            socket?.emit("room:leave")
        }
        ClockSyncManager.stopSyncing()
        removePlaybackListeners()
    }
    
    // Event flow for incoming playback events
    private val _playbackScheduleFlow = MutableSharedFlow<org.json.JSONObject>()
    val playbackScheduleFlow = _playbackScheduleFlow.asSharedFlow()
    
    private val _playbackPauseFlow = MutableSharedFlow<org.json.JSONObject>()
    val playbackPauseFlow = _playbackPauseFlow.asSharedFlow()
    
    private val _isPendingPlay = MutableStateFlow(false)
    val isPendingPlay = _isPendingPlay.asStateFlow()
    
    private val _trackSetFlow = MutableSharedFlow<org.json.JSONObject>()
    val trackSetFlow = _trackSetFlow.asSharedFlow()

    private fun setupPlaybackListeners() {
        socket?.on("room:snapshot") { args ->
            if (args.isNotEmpty()) {
                val data = args[0] as? org.json.JSONObject ?: return@on
                val trackUrl = data.optString("trackUrl", null)
                val queueArray = data.optJSONArray("queue")
                val pendingPlay = data.optBoolean("pendingPlay", false)
                _isPendingPlay.value = pendingPlay
                
                if (trackUrl != null && trackUrl != "null" && trackUrl.isNotEmpty()) {
                    var currentTrack: org.json.JSONObject? = null
                    if (queueArray != null) {
                        for (i in 0 until queueArray.length()) {
                            val item = queueArray.optJSONObject(i)
                            if (item?.optString("trackUrl") == trackUrl) {
                                currentTrack = item
                                break
                            }
                        }
                    }
                    
                    if (currentTrack == null) {
                        currentTrack = org.json.JSONObject().apply {
                            put("id", trackUrl)
                            put("trackUrl", trackUrl)
                            put("title", "Synced Audio")
                            put("artist", "Unknown")
                            put("thumbnailURL", "")
                            put("duration", "0")
                        }
                    }
                    
                    val trackData = org.json.JSONObject(currentTrack.toString())
                    if (!trackData.has("id")) {
                        trackData.put("id", trackUrl)
                    }
                    
                    val eventData = org.json.JSONObject().apply {
                        put("track", trackData)
                        put("senderId", "server")
                    }
                    
                    kotlinx.coroutines.GlobalScope.launch {
                        _trackSetFlow.emit(eventData)
                    }
                    
                    val state = data.optString("state", "")
                    if (state == "PLAYING") {
                        val position = data.optDouble("position", 0.0)
                        val startEpoch = data.optDouble("startEpoch", 0.0)
                        if (startEpoch > 0) {
                            val scheduleData = org.json.JSONObject().apply {
                                put("trackUrl", trackUrl)
                                put("positionMs", position)
                                put("startTime", startEpoch)
                                put("senderId", "server")
                            }
                            kotlinx.coroutines.GlobalScope.launch {
                                _playbackScheduleFlow.emit(scheduleData)
                            }
                        }
                    }
                }
            }
        }
        
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
            Log.d(TAG, "Received room:updateQueue event with args: ${args.contentToString()}")
            if (args.isNotEmpty()) {
                val data = args[0] as? org.json.JSONObject
                if (data != null) {
                    GlobalScope.launch { _trackSetFlow.emit(data) }
                }
            }
        }
        socket?.on("room:stateChanged") { args ->
            if (args.isNotEmpty()) {
                val data = args[0] as? org.json.JSONObject ?: return@on
                val pendingPlay = data.optBoolean("pendingPlay", false)
                _isPendingPlay.value = pendingPlay
            }
        }
    }
    
    private fun removePlaybackListeners() {
        socket?.off("playback:schedule")
        socket?.off("playback:pause")
        socket?.off("room:updateQueue")
        socket?.off("room:stateChanged")
    }
    
    fun emitClientReady(context: android.content.Context, isReady: Boolean) {
        if (!_isSyncBeatMode.value) return
        val session = com.example.syncbeats.data.SessionManager(context)
        val userId = session.fetchUserId() ?: return
        
        val payload = org.json.JSONObject().apply {
            put("roomId", "personal_room_$userId")
            put("isReady", isReady)
        }
        Log.d(TAG, "Emitting room:clientReady with payload: $payload")
        socket?.emit("room:clientReady", payload)
    }

    fun emitPlaybackPlay(context: android.content.Context) {
        if (!_isSyncBeatMode.value) return
        val session = com.example.syncbeats.data.SessionManager(context)
        val userId = session.fetchUserId() ?: return
        
        val payload = org.json.JSONObject().apply {
            put("roomId", "personal_room_$userId")
            put("senderId", DeviceManager.deviceId)
        }
        Log.d(TAG, "Emitting playback:play with payload: $payload")
        socket?.emit("playback:play", payload)
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
        Log.d(TAG, "Emitting playback:schedule with payload: $payload")
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
        Log.d(TAG, "Emitting playback:pause with payload: $payload")
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
        Log.d(TAG, "Emitting room:updateQueue with payload: $payload")
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
        _isConnected.value = false
    }
}
