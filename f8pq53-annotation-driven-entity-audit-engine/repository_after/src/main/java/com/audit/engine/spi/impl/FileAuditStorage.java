package com.audit.engine.spi.impl;

import com.audit.engine.model.AuditLog;
import com.audit.engine.spi.AuditStorage;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.PrintWriter;

public class FileAuditStorage implements AuditStorage {

    private final ObjectMapper objectMapper;
    private final String filePath;

    public FileAuditStorage(String filePath) {
        this.filePath = filePath;
        this.objectMapper = new ObjectMapper();
        this.objectMapper.registerModule(new JavaTimeModule());
        this.objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    @Override
    public void save(AuditLog auditLog) {
        try (PrintWriter out = new PrintWriter(new FileWriter(filePath, true))) {
            String json = objectMapper.writeValueAsString(auditLog);
            out.println(json);
        } catch (IOException e) {
            e.printStackTrace();
            // In production, log error or throw generic exception
        }
    }
}
