package com.example.syncbeats.network

import android.util.Log
import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import org.json.JSONObject
import java.net.InetSocketAddress

class LocalSyncServer(port: Int = 8080) : WebSocketServer(InetSocketAddress(port)) {
    
    private val connectedClients = mutableSetOf<WebSocket>()
    
    // Simplistic room state for P2P
    private var currentTrackUrl: String? = null
    private var isPlaying = false
    private var startEpoch: Double = 0.0
    private var pauseOffset: Double = 0.0
    private var positionMs: Double = 0.0

    override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
        Log.d("LocalSyncServer", "New connection from ${conn.remoteSocketAddress}")
        connectedClients.add(conn)
        
        // Send current snapshot
        val snapshot = JSONObject().apply {
            put("type", "room:snapshot")
            put("trackUrl", currentTrackUrl)
            put("isPlaying", isPlaying)
            put("startEpoch", startEpoch)
            put("pauseOffset", pauseOffset)
            put("positionMs", positionMs)
        }
        conn.send(snapshot.toString())
    }

    override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
        Log.d("LocalSyncServer", "Closed connection: $reason")
        connectedClients.remove(conn)
    }

    override fun onMessage(conn: WebSocket, message: String) {
        Log.d("LocalSyncServer", "Message received: $message")
        try {
            val json = JSONObject(message)
            val event = json.optString("event")
            val payload = json.optJSONObject("payload") ?: JSONObject()

            when (event) {
                "playback:schedule" -> {
                    currentTrackUrl = payload.optString("trackUrl")
                    positionMs = payload.optDouble("positionMs", 0.0)
                    startEpoch = payload.optDouble("startTime", 0.0)
                    isPlaying = true
                    pauseOffset = 0.0
                    
                    broadcastEvent("playback:schedule", payload)
                }
                "playback:pause" -> {
                    positionMs = payload.optDouble("positionMs", 0.0)
                    pauseOffset = positionMs / 1000.0
                    isPlaying = false
                    
                    broadcastEvent("playback:pause", payload)
                }
                "room:updateQueue" -> {
                    currentTrackUrl = payload.optString("trackUrl")
                    broadcastEvent("room:updateQueue", payload)
                }
            }
        } catch (e: Exception) {
            Log.e("LocalSyncServer", "Error parsing message", e)
        }
    }

    override fun onError(conn: WebSocket?, ex: Exception) {
        Log.e("LocalSyncServer", "Error", ex)
    }

    override fun onStart() {
        Log.d("LocalSyncServer", "Server started on port $port")
    }
    
    private fun broadcastEvent(event: String, payload: JSONObject) {
        val msg = JSONObject().apply {
            put("type", event)
            put("payload", payload)
        }.toString()
        
        for (client in connectedClients) {
            if (client.isOpen) {
                client.send(msg)
            }
        }
    }
}
