package io.arcapp.backend.shared.persistence

fun Map<String, Any?>.long(name: String): Long = (this[name] as Number).toLong()
