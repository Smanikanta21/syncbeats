package com.example.syncbeats.network

import kotlinx.serialization.Serializable

@Serializable
data class LoginRequest(
    val email: String,
    val password: String
)

@Serializable
data class RegisterRequest(
    val name: String,
    val email: String,
    val password: String
)

@Serializable
data class AuthResponse(
    val ok: Boolean? = null,
    val token: String? = null,
    val user: User? = null,
    val error: String? = null
)

@Serializable
data class User(
    val id: String,
    val name: String,
    val email: String
)

@Serializable
data class ErrorResponse(
    val error: String
)

@Serializable
data class SearchResponse(
    val results: List<SearchResult> = emptyList(),
    val error: String? = null
)

@Serializable
data class SearchResult(
    val id: String,
    val title: String,
    val artist: String,
    val duration: String,
    val thumbnail: String
)

@Serializable
data class PublicDevice(
    val id: String,
    val device_key: String,
    val name: String,
    val user_agent: String?,
    val created_at: String,
    val updated_at: String,
    val last_seen_at: String
)

@Serializable
data class DevicesResponse(
    val devices: List<PublicDevice>
)
