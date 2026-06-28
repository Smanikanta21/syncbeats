package com.example.syncbeats.network

import android.content.Context
import android.content.SharedPreferences
import java.util.UUID

object DeviceManager {
    private const val PREFS_NAME = "device_prefs"
    private const val KEY_DEVICE_ID = "x_device_id"

    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    val deviceId: String
        get() {
            var id = prefs.getString(KEY_DEVICE_ID, null)
            
            // Migrate old IDs that don't have the prefix
            if (id != null && !id.startsWith("ANDROID-")) {
                id = "ANDROID-$id"
                prefs.edit().putString(KEY_DEVICE_ID, id).apply()
                return id
            }
            
            if (id == null) {
                id = "ANDROID-" + UUID.randomUUID().toString()
                prefs.edit().putString(KEY_DEVICE_ID, id).apply()
            }
            return id
        }
}
