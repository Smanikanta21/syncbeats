package com.example.syncbeats.data

import android.content.Context
import android.content.SharedPreferences

class SessionManager(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveAuthToken(token: String) {
        val editor = prefs.edit()
        editor.putString(USER_TOKEN, token)
        editor.apply()
    }

    fun fetchAuthToken(): String? {
        return prefs.getString(USER_TOKEN, null)
    }
    
    fun saveUserId(id: String) {
        prefs.edit().putString(USER_ID, id).apply()
    }
    
    fun fetchUserId(): String? {
        val savedId = prefs.getString(USER_ID, null)
        if (savedId != null) return savedId
        
        // Fallback: Extract from JWT token
        val token = fetchAuthToken() ?: return null
        try {
            val parts = token.split(".")
            if (parts.size == 3) {
                val payload = String(android.util.Base64.decode(parts[1], android.util.Base64.URL_SAFE))
                val jsonObject = org.json.JSONObject(payload)
                val sub = jsonObject.optString("sub", null)
                if (sub != null) {
                    saveUserId(sub) // cache it
                    return sub
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return null
    }

    fun logout() {
        val editor = prefs.edit()
        editor.remove(USER_TOKEN)
        editor.apply()
    }

    fun isLoggedIn(): Boolean {
        return fetchAuthToken() != null
    }

    companion object {
        const val PREFS_NAME = "syncbeats_prefs"
        const val USER_TOKEN = "user_token"
        const val USER_ID = "user_id"
    }
}
