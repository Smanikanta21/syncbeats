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
            if (id == null) {
                id = UUID.randomUUID().toString()
                prefs.edit().putString(KEY_DEVICE_ID, id).apply()
            }
            return id
        }
}
