package com.example.syncbeats.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.Header
import retrofit2.http.POST

interface AuthApi {
    @POST("auth/login")
    suspend fun login(
        @Body request: LoginRequest,
        @Header("x-device-id") deviceId: String = "android-app"
    ): Response<AuthResponse>

    @POST("auth/register")
    suspend fun register(
        @Body request: RegisterRequest
    ): Response<AuthResponse>

    @retrofit2.http.GET("auth/me")
    suspend fun getMe(): AuthResponse
}
