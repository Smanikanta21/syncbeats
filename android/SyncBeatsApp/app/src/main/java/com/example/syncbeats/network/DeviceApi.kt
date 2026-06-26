package com.example.syncbeats.network

import retrofit2.http.GET

interface DeviceApi {
    @GET("devices/mine")
    suspend fun getMyDevices(): DevicesResponse
}
